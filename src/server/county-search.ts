import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { scoreSystem, type RawSystem } from "@/lib/score";
import type { Lead } from "@/lib/format";

const InputSchema = z.object({
  state: z.string().length(2).regex(/^[A-Z]{2}$/),
  county: z.string().min(1).max(80).regex(/^[A-Za-z .'\-]+$/),
  forceRefresh: z.boolean().optional(),
});

type CountySearchResult = {
  state: string;
  county: string;
  systems: Lead[];
  fetchedAt: string;
  expiresAt: string;
  cached: boolean;
  source: "cache" | "epa-sdwis";
};

const EFS_BASE = "https://data.epa.gov/efservice";

/** Fetch a JSON table from EPA Envirofacts with a row-range cap and per-request timeout. */
async function efs<T = Record<string, unknown>>(
  path: string,
  max = 500,
  timeoutMs = 8_000,
  retries = 1,
): Promise<T[]> {
  const url = `${EFS_BASE}/${path}/ROWS/0:${max - 1}/JSON`;
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { Accept: "application/json", "User-Agent": "WaterLeads/1.0" },
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!res.ok) throw new Error(`EPA Envirofacts ${res.status}: ${path}`);
      const text = await res.text();
      if (!text.trim()) return [];
      // EPA sometimes returns a JSON error object like {"error": "..."} instead of an array.
      try {
        const json = JSON.parse(text);
        if (Array.isArray(json)) return json as T[];
        return [];
      } catch {
        // Non-JSON (often an XML error page) — treat as empty.
        return [];
      }
    } catch (e) {
      lastErr = e;
      if (attempt < retries) await new Promise((r) => setTimeout(r, 500));
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

/** Run promises with a max concurrency to avoid overwhelming the EPA API. */
async function pMap<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, i: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      results[idx] = await fn(items[idx], idx);
    }
  });
  await Promise.all(workers);
  return results;
}

/** Pluck a value from an EPA row using any of the possible casings the API returns. */
function pick<T = string>(row: Record<string, unknown>, ...keys: string[]): T | undefined {
  for (const k of keys) {
    const variants = [k, k.toLowerCase(), k.toUpperCase()];
    for (const v of variants) {
      if (v in row && row[v] !== null && row[v] !== "") return row[v] as T;
    }
  }
  return undefined;
}

function num(row: Record<string, unknown>, ...keys: string[]): number {
  const v = pick<string | number>(row, ...keys);
  if (v === undefined || v === null || v === "") return 0;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function str(row: Record<string, unknown>, ...keys: string[]): string {
  const v = pick<string | number>(row, ...keys);
  return v === undefined || v === null ? "" : String(v);
}

/** Title-case a county name so it matches the EPA `county_served` field
 *  (e.g. "PALM BEACH" / "palm beach" -> "Palm Beach", "st. lucie" -> "St. Lucie").
 *  EPA filtering is case-sensitive on this column. */
function normalizeCounty(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .map((w) =>
      w
        .split("-")
        .map((p) => (p ? p[0].toUpperCase() + p.slice(1) : p))
        .join("-"),
    )
    .join(" ");
}

/** Map an EPA WATER_SYSTEM row + a list of its violation rows into a scored Lead. */
function buildSystem(
  ws: Record<string, unknown>,
  vios: Record<string, unknown>[],
): Lead {
  const fiveYearsAgo = new Date();
  fiveYearsAgo.setFullYear(fiveYearsAgo.getFullYear() - 5);

  let activeMcl = 0;
  let activeHealth = 0;
  let lcr5 = 0;
  let unresolved = 0;
  let total5 = 0;
  let latestDate = "";

  for (const v of vios) {
    const begin = str(v, "compl_per_begin_date", "COMPL_PER_BEGIN_DATE", "VIOLATION_FIRST_REPORTED_DATE");
    const status = str(v, "violation_status", "VIOLATION_STATUS").toUpperCase();
    const cat = str(v, "violation_category_code", "VIOLATION_CATEGORY_CODE").toUpperCase();
    const isHealth = str(v, "is_health_based_ind", "IS_HEALTH_BASED_IND").toUpperCase() === "Y";
    const contaminant = str(v, "contaminant_code", "CONTAMINANT_CODE");

    let beginDate: Date | null = null;
    if (begin) {
      const d = new Date(begin);
      if (!isNaN(d.getTime())) beginDate = d;
    }
    if (beginDate && beginDate >= fiveYearsAgo) {
      total5 += 1;
      if (!latestDate || begin > latestDate) latestDate = begin;
      // Lead/Copper Rule contaminant codes (EPA): 1030 lead, 1022 copper, plus 8000-series LCR
      if (["1030", "1022"].includes(contaminant) || cat === "LCR") lcr5 += 1;
    }
    if (status === "UNADDRESSED" || status === "ADDRESSED") {
      // active = unresolved
      if (cat === "MCL") activeMcl += 1;
      if (isHealth) activeHealth += 1;
      unresolved += 1;
    }
  }

  const raw: RawSystem = {
    PWSID: str(ws, "pwsid", "PWSID"),
    "System Name": str(ws, "pws_name", "PWS_NAME"),
    Type: str(ws, "pws_type_code", "PWS_TYPE_CODE"),
    "Population Served": num(ws, "population_served_count", "POPULATION_SERVED_COUNT"),
    "Service Connections": num(ws, "service_connections_count", "SERVICE_CONNECTIONS_COUNT"),
    Source: str(ws, "primary_source_code", "PRIMARY_SOURCE_CODE"),
    "Owner Type": str(ws, "owner_type_code", "OWNER_TYPE_CODE"),
    City: str(ws, "city_name", "CITY_NAME"),
    Zip: str(ws, "zip_code", "ZIP_CODE"),
    Address: str(ws, "address_line1", "ADDRESS_LINE1"),
    Contact: str(ws, "org_name", "ORG_NAME"),
    Phone: str(ws, "phone_number", "PHONE_NUMBER"),
    Email: str(ws, "email_addr", "EMAIL_ADDR"),
    "Active MCL Violations": activeMcl,
    "Active Health-Based Violations": activeHealth,
    "Lead 90th %ile (mg/L)": 0,
    "Lead Action Level Exceeded": "",
    "Copper 90th %ile (mg/L)": 0,
    "Copper Action Level Exceeded": "",
    "LCR Violations (5yr)": lcr5,
    "Unresolved Violations (5yr)": unresolved,
    "Total Violations (5yr)": total5,
    "Latest Violation Date": latestDate,
  };
  return scoreSystem(raw);
}

async function fetchFromEpa(state: string, county: string): Promise<Lead[]> {
  const countyName = normalizeCounty(county);
  const startedAt = Date.now();
  const BUDGET_MS = 20_000; // total time budget for the whole EPA fetch

  // 1. Look up which PWSIDs actually serve this county via GEOGRAPHIC_AREA.
  //    This is the only EPA table that has a usable county filter; the
  //    PRINCIPAL_COUNTY_SERVED column on WATER_SYSTEM is silently ignored
  //    by Envirofacts and returns the first 1000 rows of the state.
  let geoRows: Record<string, unknown>[] = [];
  try {
    geoRows = await efs<Record<string, unknown>>(
      `GEOGRAPHIC_AREA/STATE_SERVED/${state}/COUNTY_SERVED/${encodeURIComponent(countyName)}/PWS_ACTIVITY_CODE/A`,
      500,
      10_000,
      1,
    );
  } catch (e) {
    console.error("GEOGRAPHIC_AREA lookup failed:", e);
    throw e;
  }

  // De-duplicate PWSIDs (a system can have multiple geo rows: county + city + zip).
  const pwsidSet = new Set<string>();
  for (const g of geoRows) {
    const id = str(g, "pwsid", "PWSID");
    if (id) pwsidSet.add(id);
  }
  const pwsids = Array.from(pwsidSet);
  if (pwsids.length === 0) return [];

  // 2. Fetch WATER_SYSTEM details for each PWSID. Bounded concurrency.
  //    Cap at 60 systems to stay well within the time budget.
  const TOP_SYSTEMS = pwsids.slice(0, 60);
  const wsById = new Map<string, Record<string, unknown>>();
  await pMap(TOP_SYSTEMS, 6, async (id) => {
    if (Date.now() - startedAt > BUDGET_MS - 6_000) return;
    try {
      const rows = await efs<Record<string, unknown>>(`WATER_SYSTEM/PWSID/${id}`, 1, 5_000, 0);
      if (rows[0]) wsById.set(id, rows[0]);
    } catch {
      /* skip — system will be omitted */
    }
  });

  if (wsById.size === 0) return [];

  // 3. Pull violations only for the systems we successfully fetched and only
  //    if there's time budget left. Systems without violation data still get
  //    scored (zero-violation fallback).
  const vioByPws = new Map<string, Record<string, unknown>[]>();
  const remaining = BUDGET_MS - (Date.now() - startedAt);
  if (remaining > 4_000) {
    const ids = Array.from(wsById.keys()).slice(0, 25);
    await pMap(ids, 4, async (id) => {
      if (Date.now() - startedAt > BUDGET_MS) return;
      try {
        const vios = await efs<Record<string, unknown>>(`VIOLATION/PWSID/${id}`, 100, 4_000, 0);
        vioByPws.set(id, vios);
      } catch {
        vioByPws.set(id, []);
      }
    });
  } else {
    console.warn("Skipping violations fetch — out of time budget");
  }

  return Array.from(wsById.entries()).map(([id, ws]) =>
    buildSystem(ws, vioByPws.get(id) || []),
  );
}

export const searchCounty = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => InputSchema.parse(input))
  .handler(async ({ data }): Promise<CountySearchResult> => {
    const state = data.state.toUpperCase();
    const county = normalizeCounty(data.county);

    // 1. Cache lookup
    if (!data.forceRefresh) {
      const { data: cached } = await supabaseAdmin
        .from("county_search_cache")
        .select("*")
        .eq("state_code", state)
        .eq("county_name", county)
        .gt("expires_at", new Date().toISOString())
        .maybeSingle();

      if (cached) {
        return {
          state,
          county,
          systems: (cached.results as unknown as Lead[]) || [],
          fetchedAt: cached.fetched_at,
          expiresAt: cached.expires_at,
          cached: true,
          source: "cache",
        };
      }
    }

    // 2. Live fetch from EPA SDWIS
    let systems: Lead[];
    try {
      systems = await fetchFromEpa(state, county);
    } catch (err) {
      console.error("EPA SDWIS fetch failed:", err);
      throw new Error(
        `Could not reach EPA SDWIS. ${err instanceof Error ? err.message : "Unknown error"}`,
      );
    }

    // 3. Sort by priority/score the same way the dashboard does
    const PRIO_ORDER: Record<Lead["Priority"], number> = { HOT: 0, WARM: 1, COOL: 2, COLD: 3 };
    systems.sort(
      (a, b) =>
        PRIO_ORDER[a.Priority] - PRIO_ORDER[b.Priority] ||
        b["Lead Score"] - a["Lead Score"] ||
        b["Population Served"] - a["Population Served"],
    );

    const now = new Date();
    const expires = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    // 4. Upsert cache (service role, bypasses RLS)
    await supabaseAdmin
      .from("county_search_cache")
      .upsert(
        {
          state_code: state,
          county_name: county,
          results: systems as unknown as never,
          system_count: systems.length,
          fetched_at: now.toISOString(),
          expires_at: expires.toISOString(),
        },
        { onConflict: "state_code,county_name" },
      );

    return {
      state,
      county,
      systems,
      fetchedAt: now.toISOString(),
      expiresAt: expires.toISOString(),
      cached: false,
      source: "epa-sdwis",
    };
  });
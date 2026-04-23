import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { scoreSystem, type RawSystem } from "@/lib/score";
import type { Lead } from "@/lib/format";
import leadsData from "@/data/leads.json";

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
const EPA_FETCH_BUDGET_MS = 14_000;
const GEO_LOOKUP_TIMEOUT_MS = 7_500;
const DETAIL_TIMEOUT_MS = 3_500;
const DETAIL_CONCURRENCY = 4;
const MAX_SYSTEM_DETAILS = 12;
const MAX_VIOLATION_LOOKUPS = 4;
const VIOLATION_TIMEOUT_MS = 2_500;
const historicalLeadById = new Map((leadsData as Lead[]).map((lead) => [lead.PWSID, lead]));

/** Fetch a JSON table from EPA Envirofacts with a row-range cap and per-request timeout.
 *  EPA returns plain JSON arrays on success, and `{"error": "..."}` objects on transient
 *  failures (which happen often, especially on larger ROWS ranges). We treat the latter
 *  as a soft failure and surface it via `epaError` so callers can retry differently. */
async function efs<T = Record<string, unknown>>(
  path: string,
  max = 500,
  timeoutMs = 8_000,
  retries = 1,
): Promise<T[]> {
  // EPA Envirofacts intermittently 500s on ROWS/0:N where N>~99 — cap at 99 per request.
  const safeMax = Math.min(max, 100);
  const url = `${EFS_BASE}/${path}/ROWS/0:${safeMax - 1}/JSON`;
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
      try {
        const json = JSON.parse(text);
        if (Array.isArray(json)) return json as T[];
        // {"error": "..."} → soft failure; retry, then give up with empty.
        if (json && typeof json === "object" && "error" in json) {
          lastErr = new Error(`EPA error: ${(json as { error: string }).error}`);
          if (attempt < retries) {
            await new Promise((r) => setTimeout(r, 600 + attempt * 400));
            continue;
          }
          return [];
        }
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

function countyVariants(input: string): string[] {
  const base = normalizeCounty(input).replace(/\s+county$/i, "");
  const variants = [base];

  if (/^St\.?\s+/i.test(base)) variants.push(base.replace(/^St\.?\s+/i, "Saint "));
  if (/^Saint\s+/i.test(base)) variants.push(base.replace(/^Saint\s+/i, "St. "));

  return Array.from(new Set(variants.filter(Boolean)));
}

function mergeHistoricalLead(base: Lead, ws: Record<string, unknown>): Lead {
  return {
    ...base,
    "System Name": str(ws, "pws_name", "PWS_NAME") || base["System Name"],
    Type: str(ws, "pws_type_code", "PWS_TYPE_CODE") || base.Type,
    "Population Served": num(ws, "population_served_count", "POPULATION_SERVED_COUNT") || base["Population Served"],
    "Service Connections": num(ws, "service_connections_count", "SERVICE_CONNECTIONS_COUNT") || base["Service Connections"],
    Source: str(ws, "primary_source_code", "PRIMARY_SOURCE_CODE") || base.Source,
    "Owner Type": str(ws, "owner_type_code", "OWNER_TYPE_CODE") || base["Owner Type"],
    City: str(ws, "city_name", "CITY_NAME") || base.City,
    Zip: str(ws, "zip_code", "ZIP_CODE") || base.Zip,
    Address: str(ws, "address_line1", "ADDRESS_LINE1") || base.Address,
    Contact: str(ws, "org_name", "ORG_NAME") || base.Contact,
    Phone: str(ws, "phone_number", "PHONE_NUMBER") || base.Phone,
    Email: str(ws, "email_addr", "EMAIL_ADDR") || base.Email,
  };
}

async function fetchGeoRows(state: string, county: string): Promise<Record<string, unknown>[]> {
  let lastError: unknown;

  for (const candidate of countyVariants(county)) {
    try {
      // NOTE: Do NOT chain `/PWS_ACTIVITY_CODE/A` onto this URL — EPA Envirofacts
      // returns `{"error": "'NoneType' object has no attribute 'get'"}` for that
      // combination on many counties. Filter activity status locally instead.
      // Also keep ROWS small (<=99) — larger ranges trigger transient EPA 500s.
      const rows = await efs<Record<string, unknown>>(
        `GEOGRAPHIC_AREA/STATE_SERVED/${state}/COUNTY_SERVED/${encodeURIComponent(candidate)}`,
        99,
        GEO_LOOKUP_TIMEOUT_MS,
        2,
      );
      const active = rows.filter((r) => {
        const code = str(r, "pws_activity_code", "PWS_ACTIVITY_CODE").toUpperCase();
        // "A" = Active. Empty/unknown -> keep (defensive).
        return code === "" || code === "A";
      });
      if (active.length > 0) return active;
      if (rows.length > 0) return rows; // fall back to all rows if none flagged active
    } catch (error) {
      lastError = error;
      break;
    }
  }

  if (lastError) throw lastError;
  return [];
}

function prioritizePwsids(ids: string[]): string[] {
  return [...ids].sort((a, b) => {
    const scoreDiff = (historicalLeadById.get(b)?.["Lead Score"] ?? -1) - (historicalLeadById.get(a)?.["Lead Score"] ?? -1);
    if (scoreDiff !== 0) return scoreDiff;
    return a.localeCompare(b);
  });
}

function buildLead(ws: Record<string, unknown>, vios: Record<string, unknown>[]): Lead {
  const pwsid = str(ws, "pwsid", "PWSID");
  const historical = historicalLeadById.get(pwsid);
  if (historical && vios.length === 0) return mergeHistoricalLead(historical, ws);
  return buildSystem(ws, vios);
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
  const startedAt = Date.now();
  const geoRows = await fetchGeoRows(state, county);

  const pwsidSet = new Set<string>();
  for (const g of geoRows) {
    const id = str(g, "pwsid", "PWSID");
    if (id) pwsidSet.add(id);
  }
  const pwsids = prioritizePwsids(Array.from(pwsidSet));
  if (pwsids.length === 0) return [];

  const leadById = new Map<string, Lead>();
  for (const id of pwsids) {
    const historical = historicalLeadById.get(id);
    if (historical) leadById.set(id, historical);
  }

  const wsById = new Map<string, Record<string, unknown>>();
  const detailIds = pwsids.slice(0, MAX_SYSTEM_DETAILS);
  await pMap(detailIds, DETAIL_CONCURRENCY, async (id) => {
    if (Date.now() - startedAt > EPA_FETCH_BUDGET_MS - 3_000) return;
    try {
      const rows = await efs<Record<string, unknown>>(`WATER_SYSTEM/PWSID/${id}`, 1, DETAIL_TIMEOUT_MS, 0);
      if (rows[0]) {
        wsById.set(id, rows[0]);
        leadById.set(id, buildLead(rows[0], []));
      }
    } catch {
      const historical = historicalLeadById.get(id);
      if (historical) leadById.set(id, historical);
    }
  });

  const remaining = EPA_FETCH_BUDGET_MS - (Date.now() - startedAt);
  if (remaining > 2_500 && wsById.size > 0) {
    const ids = Array.from(wsById.keys())
      .sort((a, b) => {
        const aLead = leadById.get(a);
        const bLead = leadById.get(b);
        return (bLead?.["Lead Score"] ?? 0) - (aLead?.["Lead Score"] ?? 0);
      })
      .slice(0, MAX_VIOLATION_LOOKUPS);

    await pMap(ids, 2, async (id) => {
      if (Date.now() - startedAt > EPA_FETCH_BUDGET_MS) return;
      try {
        const vios = await efs<Record<string, unknown>>(`VIOLATION/PWSID/${id}`, 100, VIOLATION_TIMEOUT_MS, 0);
        const ws = wsById.get(id);
        if (ws) leadById.set(id, buildLead(ws, vios));
      } catch {
        // Keep the no-violation fallback/historical score instead of failing the whole search.
      }
    });
  }

  return pwsids.map((id) => leadById.get(id)).filter((lead): lead is Lead => Boolean(lead));
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
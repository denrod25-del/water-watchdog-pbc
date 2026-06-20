import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const EFS_BASE = "https://data.epa.gov/efservice";
const FETCH_TIMEOUT_MS = 8_000;
const MAX_VIOLATIONS = 25;

const InputSchema = z.object({
  pwsid: z.string().min(9).max(12).regex(/^[A-Z0-9]+$/),
});

export type ViolationRecord = {
  id: string;
  pwsid: string;
  contaminantCode: string | null;
  contaminantName: string;
  category: string;
  isHealthBased: boolean;
  beginDate: string | null; // YYYY-MM-DD
  endDate: string | null;
  status: string; // Resolved / Returned to Compliance / Unaddressed / Archived ...
  enforcementAction: string | null;
  enforcementDate: string | null;
  publicNotificationTier: string | null;
};

export type ViolationHistoryResult = {
  pwsid: string;
  violations: ViolationRecord[];
  fetchedAt: string;
  source: "epa-sdwis";
  error: string | null;
};

/** EPA Envirofacts violations table fields are documented at
 *  https://www.epa.gov/enviro/sdwis-model — we read VIOLATION (raw rows) and
 *  enrich with the human-readable contaminant name from REF_CODE_VALUES when
 *  available. The API frequently returns `{"error": "..."}` JSON on transient
 *  failures which we surface as a soft empty result. */
async function efsRows<T = Record<string, unknown>>(
  path: string,
  rows = 100,
  timeoutMs = FETCH_TIMEOUT_MS,
): Promise<T[]> {
  const safeRows = Math.min(rows, 100);
  const url = `${EFS_BASE}/${path}/ROWS/0:${safeRows - 1}/JSON`;
  const res = await fetch(url, {
    headers: { Accept: "application/json", "User-Agent": "WaterLeads/1.0" },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`EPA Envirofacts ${res.status}`);
  const text = await res.text();
  if (!text.trim()) return [];
  try {
    const json = JSON.parse(text);
    if (Array.isArray(json)) return json as T[];
    if (json && typeof json === "object" && "error" in json) {
      throw new Error(`EPA error: ${(json as { error: string }).error}`);
    }
    return [];
  } catch (e) {
    if (e instanceof SyntaxError) return [];
    throw e;
  }
}

function pick(row: Record<string, unknown>, ...keys: string[]): string | null {
  for (const k of keys) {
    const v = row[k] ?? row[k.toLowerCase()] ?? row[k.toUpperCase()];
    if (v !== undefined && v !== null && String(v).trim() !== "") return String(v).trim();
  }
  return null;
}

function normalizeDate(input: string | null): string | null {
  if (!input) return null;
  // EPA returns dates as "YYYY-MM-DD" or "MM/DD/YYYY" or "DD-MMM-YY" depending on table.
  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})/.exec(input);
  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
  const usMatch = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(input);
  if (usMatch) return `${usMatch[3]}-${usMatch[1]}-${usMatch[2]}`;
  const d = new Date(input);
  if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return input;
}

const STATUS_LABEL: Record<string, string> = {
  Resolved: "Resolved",
  Archived: "Archived",
  Addressed: "Addressed",
  Unaddressed: "Unaddressed",
  Known: "Returned to compliance",
};

const CATEGORY_LABEL: Record<string, string> = {
  MCL: "MCL — Maximum Contaminant Level",
  MRDL: "MRDL — Disinfectant residual",
  TT: "Treatment technique",
  MR: "Monitoring & reporting",
  MON: "Monitoring",
  RPT: "Reporting",
  Other: "Other",
};

function mapRow(row: Record<string, unknown>): ViolationRecord | null {
  const pwsid = pick(row, "pwsid", "PWSID");
  const violationId = pick(row, "violation_id", "VIOLATION_ID");
  if (!pwsid || !violationId) return null;
  const contaminantCode = pick(row, "contaminant_code", "CONTAMINANT_CODE");
  const rawCategory = pick(row, "violation_category_code", "VIOLATION_CATEGORY_CODE") ?? "Other";
  const isHealthBased = pick(row, "is_health_based_ind", "IS_HEALTH_BASED_IND") === "Y";
  const status = pick(row, "violation_status", "VIOLATION_STATUS") ?? "Unknown";
  const beginDate = normalizeDate(pick(row, "non_compl_per_begin_date", "NON_COMPL_PER_BEGIN_DATE", "compl_per_begin_date"));
  const endDate = normalizeDate(pick(row, "non_compl_per_end_date", "NON_COMPL_PER_END_DATE"));
  const enforcementAction = pick(row, "enforcement_action_type_code", "ENFORCEMENT_ACTION_TYPE_CODE");
  const enforcementDate = normalizeDate(pick(row, "enforcement_date", "ENFORCEMENT_DATE"));
  const publicNotificationTier = pick(row, "public_notification_tier", "PUBLIC_NOTIFICATION_TIER");

  return {
    id: violationId,
    pwsid,
    contaminantCode,
    contaminantName: contaminantCode ? `Contaminant ${contaminantCode}` : "Unspecified",
    category: CATEGORY_LABEL[rawCategory] ?? rawCategory,
    isHealthBased,
    beginDate,
    endDate,
    status: STATUS_LABEL[status] ?? status,
    enforcementAction,
    enforcementDate,
    publicNotificationTier,
  };
}

/** EPA's REF_CODE_VALUES table maps contaminant codes to readable names. */
async function loadContaminantNames(codes: string[]): Promise<Map<string, string>> {
  if (codes.length === 0) return new Map();
  // Single bulk fetch — small static table.
  try {
    const rows = await efsRows<Record<string, unknown>>(
      "REF_CODE_VALUES/VALUE_TYPE/CONTAMINANT_CODE",
      100,
      4_000,
    );
    const map = new Map<string, string>();
    for (const r of rows) {
      const code = pick(r, "value_code", "VALUE_CODE");
      const desc = pick(r, "value_description", "VALUE_DESCRIPTION");
      if (code && desc) map.set(code, desc);
    }
    return map;
  } catch {
    return new Map();
  }
}

export const fetchViolationHistory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => InputSchema.parse(input))
  .handler(async ({ data }): Promise<ViolationHistoryResult> => {
    const { pwsid } = data;
    const fetchedAt = new Date().toISOString();

    try {
      const rows = await efsRows<Record<string, unknown>>(
        `VIOLATION/PWSID/${pwsid}`,
        MAX_VIOLATIONS * 2,
      );
      const mapped = rows
        .map(mapRow)
        .filter((r): r is ViolationRecord => r !== null)
        // Most-recent first.
        .sort((a, b) => (b.beginDate ?? "").localeCompare(a.beginDate ?? ""))
        .slice(0, MAX_VIOLATIONS);

      // Enrich with contaminant names (best-effort).
      const codes = Array.from(new Set(mapped.map((m) => m.contaminantCode).filter((c): c is string => !!c)));
      const names = await loadContaminantNames(codes);
      for (const v of mapped) {
        if (v.contaminantCode && names.has(v.contaminantCode)) {
          v.contaminantName = names.get(v.contaminantCode)!;
        }
      }

      return { pwsid, violations: mapped, fetchedAt, source: "epa-sdwis", error: null };
    } catch (e) {
      const message = e instanceof Error ? e.message : "Unknown error";
      console.error("violation-history fetch failed", { pwsid, message });
      return {
        pwsid,
        violations: [],
        fetchedAt,
        source: "epa-sdwis",
        error: `Could not reach EPA SDWIS: ${message}`,
      };
    }
  });
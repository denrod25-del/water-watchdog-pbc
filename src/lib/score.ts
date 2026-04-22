import type { Lead } from "./format";

/**
 * Shared scoring logic. Used by:
 *  - precomputed leads.json (already scored offline by Python ETL — kept identical here)
 *  - the live county search server function (src/server/county-search.ts)
 *
 * Inputs are the raw SDWIS-style fields; output is a fully populated Lead
 * including Lead Score / Priority / Flags.
 */

export type RawSystem = Omit<Lead, "Lead Score" | "Priority" | "Flags"> & {
  "Lead Score"?: number;
  Priority?: Lead["Priority"];
  Flags?: string;
};

export function scoreSystem(s: RawSystem): Lead {
  const flags: string[] = [];
  let score = 0;

  const healthBased = s["Active Health-Based Violations"] || 0;
  const mcl = s["Active MCL Violations"] || 0;
  const lcr5 = s["LCR Violations (5yr)"] || 0;
  const unresolved = s["Unresolved Violations (5yr)"] || 0;
  const total5 = s["Total Violations (5yr)"] || 0;
  const leadMgL = s["Lead 90th %ile (mg/L)"] || 0;
  const copperMgL = s["Copper 90th %ile (mg/L)"] || 0;
  const leadExceeded = s["Lead Action Level Exceeded"] === "YES";
  const copperExceeded = s["Copper Action Level Exceeded"] === "YES";

  if (healthBased > 0) {
    score += 40 * Math.min(healthBased, 3);
    flags.push(`${healthBased} active health-based`);
  }
  if (mcl > 0) {
    score += 25 * Math.min(mcl, 3);
    flags.push(`${mcl} active MCL`);
  }
  if (leadExceeded) {
    const ug = leadMgL * 1000;
    score += 35;
    flags.push(`Lead exceedance (${ug.toFixed(1)} \u00b5g/L)`);
  }
  if (copperExceeded) {
    score += 30;
    flags.push(`Copper exceedance (${copperMgL.toFixed(2)} mg/L)`);
  }
  if (lcr5 > 0) {
    score += 8 * Math.min(lcr5, 5);
    flags.push(`${lcr5} LCR violations`);
  }
  if (unresolved > 0) {
    score += 6 * Math.min(unresolved, 5);
    if (!flags.some((f) => f.includes("active"))) flags.push(`${unresolved} unresolved`);
  }
  if (total5 >= 10) {
    score += 10;
    if (!flags.length) flags.push(`${total5} violations (5yr)`);
  }

  // Population multiplier (more impact = warmer lead)
  const pop = s["Population Served"] || 0;
  if (pop >= 50000) score += 15;
  else if (pop >= 10000) score += 10;
  else if (pop >= 1000) score += 5;

  let priority: Lead["Priority"];
  if (score >= 60) priority = "HOT";
  else if (score >= 30) priority = "WARM";
  else if (score >= 10) priority = "COOL";
  else priority = "COLD";

  return {
    ...s,
    "Lead Score": score,
    Priority: priority,
    Flags: flags.join("; "),
  };
}

/** US state codes accepted by EPA SDWIS / Envirofacts. */
export const US_STATES: { code: string; name: string }[] = [
  { code: "AL", name: "Alabama" }, { code: "AK", name: "Alaska" }, { code: "AZ", name: "Arizona" },
  { code: "AR", name: "Arkansas" }, { code: "CA", name: "California" }, { code: "CO", name: "Colorado" },
  { code: "CT", name: "Connecticut" }, { code: "DE", name: "Delaware" }, { code: "DC", name: "District of Columbia" },
  { code: "FL", name: "Florida" }, { code: "GA", name: "Georgia" }, { code: "HI", name: "Hawaii" },
  { code: "ID", name: "Idaho" }, { code: "IL", name: "Illinois" }, { code: "IN", name: "Indiana" },
  { code: "IA", name: "Iowa" }, { code: "KS", name: "Kansas" }, { code: "KY", name: "Kentucky" },
  { code: "LA", name: "Louisiana" }, { code: "ME", name: "Maine" }, { code: "MD", name: "Maryland" },
  { code: "MA", name: "Massachusetts" }, { code: "MI", name: "Michigan" }, { code: "MN", name: "Minnesota" },
  { code: "MS", name: "Mississippi" }, { code: "MO", name: "Missouri" }, { code: "MT", name: "Montana" },
  { code: "NE", name: "Nebraska" }, { code: "NV", name: "Nevada" }, { code: "NH", name: "New Hampshire" },
  { code: "NJ", name: "New Jersey" }, { code: "NM", name: "New Mexico" }, { code: "NY", name: "New York" },
  { code: "NC", name: "North Carolina" }, { code: "ND", name: "North Dakota" }, { code: "OH", name: "Ohio" },
  { code: "OK", name: "Oklahoma" }, { code: "OR", name: "Oregon" }, { code: "PA", name: "Pennsylvania" },
  { code: "RI", name: "Rhode Island" }, { code: "SC", name: "South Carolina" }, { code: "SD", name: "South Dakota" },
  { code: "TN", name: "Tennessee" }, { code: "TX", name: "Texas" }, { code: "UT", name: "Utah" },
  { code: "VT", name: "Vermont" }, { code: "VA", name: "Virginia" }, { code: "WA", name: "Washington" },
  { code: "WV", name: "West Virginia" }, { code: "WI", name: "Wisconsin" }, { code: "WY", name: "Wyoming" },
];
export const formatNumber = (n: number) => n.toLocaleString("en-US");
export const formatPhone = (p: string) => {
  const d = (p || "").replace(/\D/g, "");
  if (d.length === 10) return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
  return p || "";
};
export type Lead = {
  PWSID: string;
  "System Name": string;
  Type: string;
  "Population Served": number;
  "Service Connections": number;
  Source: string;
  "Owner Type": string;
  City: string;
  Zip: string;
  Address: string;
  Contact: string;
  Phone: string;
  Email: string;
  "Active MCL Violations": number;
  "Active Health-Based Violations": number;
  "Lead 90th %ile (mg/L)": number;
  "Lead Action Level Exceeded": string;
  "Copper 90th %ile (mg/L)": number;
  "Copper Action Level Exceeded": string;
  "LCR Violations (5yr)": number;
  "Unresolved Violations (5yr)": number;
  "Total Violations (5yr)": number;
  "Latest Violation Date": string;
  "Lead Score": number;
  Priority: "HOT" | "WARM" | "COOL" | "COLD";
  Flags: string;
};

export const PWS_TYPE_LABEL: Record<string, string> = {
  CWS: "Community",
  NTNCWS: "Non-Transient Non-Community",
  TNCWS: "Transient Non-Community",
};
export const SOURCE_LABEL: Record<string, string> = {
  GW: "Groundwater",
  SW: "Surface Water",
  GU: "GW under SW influence",
  SWP: "Surface (purchased)",
  GWP: "Groundwater (purchased)",
};

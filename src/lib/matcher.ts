import productsData from "@/data/products.json";
import type { Lead } from "@/lib/format";

export type Product = {
  sku: string;
  name: string;
  tier: "POU" | "POE" | "SYSTEM" | "SERVICE";
  category: string;
  price: number;
  monthlyService: number;
  treats: string[];
  blurb: string;
  leadTimeDays: number;
};

export type ContaminantHit = {
  key: string;
  label: string;
  severity: "high" | "medium" | "low";
  evidence: string;
};

export const PRODUCTS = productsData as Product[];

const FLAG_PATTERNS: { match: RegExp; key: string; label: string; severity: ContaminantHit["severity"] }[] = [
  { match: /lead/i, key: "lead", label: "Lead", severity: "high" },
  { match: /copper/i, key: "copper", label: "Copper", severity: "high" },
  { match: /tthm|trihalomethane/i, key: "tthm", label: "TTHM (disinfection by-products)", severity: "high" },
  { match: /haa5|haloacetic/i, key: "haa5", label: "HAA5", severity: "high" },
  { match: /nitrate|nitrite/i, key: "nitrate", label: "Nitrate / Nitrite", severity: "high" },
  { match: /arsenic/i, key: "arsenic", label: "Arsenic", severity: "high" },
  { match: /pfas|pfoa|pfos/i, key: "pfas", label: "PFAS", severity: "high" },
  { match: /radium|radionuclide|gross alpha|uranium/i, key: "radium", label: "Radionuclides", severity: "high" },
  { match: /coliform|e\.?\s*coli/i, key: "coliform", label: "Coliform / E. coli", severity: "high" },
  { match: /chlorine|chloramine|disinfect/i, key: "chlorine", label: "Disinfectant residual", severity: "medium" },
];

export function detectContaminants(lead: Lead): ContaminantHit[] {
  const hits = new Map<string, ContaminantHit>();
  const flags = lead.Flags || "";

  // Direct fields first (highest confidence)
  if (lead["Lead Action Level Exceeded"] === "YES") {
    const ug = (lead["Lead 90th %ile (mg/L)"] || 0) * 1000;
    hits.set("lead", {
      key: "lead",
      label: "Lead",
      severity: "high",
      evidence: `90th %ile ${ug.toFixed(1)} µg/L (action level 15 µg/L)`,
    });
  }
  if (lead["Copper Action Level Exceeded"] === "YES") {
    hits.set("copper", {
      key: "copper",
      label: "Copper",
      severity: "high",
      evidence: `90th %ile ${lead["Copper 90th %ile (mg/L)"].toFixed(2)} mg/L (action level 1.3 mg/L)`,
    });
  }

  // Parse Flags string for other contaminants
  flags.split(/;|,/).forEach((part) => {
    const trimmed = part.trim();
    if (!trimmed) return;
    for (const pat of FLAG_PATTERNS) {
      if (pat.match.test(trimmed) && !hits.has(pat.key)) {
        hits.set(pat.key, { key: pat.key, label: pat.label, severity: pat.severity, evidence: trimmed });
      }
    }
  });

  // Generic fallbacks when we know there's a violation but no specific contaminant
  if (hits.size === 0 && lead["Active Health-Based Violations"] > 0) {
    hits.set("health-based", {
      key: "health-based",
      label: "Active health-based violation",
      severity: "high",
      evidence: `${lead["Active Health-Based Violations"]} active violation${lead["Active Health-Based Violations"] > 1 ? "s" : ""}`,
    });
  }
  if (hits.size === 0 && lead["Active MCL Violations"] > 0) {
    hits.set("mcl-generic", {
      key: "mcl-generic",
      label: "Active MCL violation",
      severity: "high",
      evidence: `${lead["Active MCL Violations"]} active MCL violation${lead["Active MCL Violations"] > 1 ? "s" : ""}`,
    });
  }
  if (lead["Unresolved Violations (5yr)"] > 0 && hits.size === 0) {
    hits.set("unresolved", {
      key: "unresolved",
      label: "Unresolved violations",
      severity: "medium",
      evidence: `${lead["Unresolved Violations (5yr)"]} unresolved in last 5 yrs`,
    });
  }

  return Array.from(hits.values());
}

export type Recommendation = {
  product: Product;
  matchedContaminants: ContaminantHit[];
  fitScore: number; // 0-100
  rationale: string;
};

const POPULATION_TIER_BIAS: Record<Product["tier"], (pop: number) => number> = {
  POU: (pop) => (pop < 500 ? 15 : pop < 5000 ? 5 : -10),
  POE: (pop) => (pop < 100 ? -5 : pop < 10000 ? 10 : 0),
  SYSTEM: (pop) => (pop < 1000 ? -15 : pop < 50000 ? 15 : 20),
  SERVICE: () => 5,
};

export function recommendProducts(lead: Lead): Recommendation[] {
  const contaminants = detectContaminants(lead);
  if (contaminants.length === 0) return [];

  const contKeys = new Set(contaminants.map((c) => c.key));
  const pop = lead["Population Served"] || 0;

  const recs: Recommendation[] = [];
  for (const product of PRODUCTS) {
    const matched = contaminants.filter((c) => product.treats.includes(c.key));
    if (matched.length === 0) continue;

    const coverage = matched.length / contaminants.length;
    const specificity = matched.length / product.treats.length;
    let score = Math.round(coverage * 60 + specificity * 25);
    score += POPULATION_TIER_BIAS[product.tier](pop);
    // Always include audit when there are unresolved/health-based concerns
    if (product.sku === "WQ-AUDIT" && (contKeys.has("unresolved") || contKeys.has("health-based") || contKeys.has("mcl-generic"))) {
      score += 20;
    }
    score = Math.max(5, Math.min(100, score));

    const rationale =
      `Treats ${matched.map((m) => m.label).join(", ")}. ` +
      (product.tier === "POU"
        ? `Best for small / scattered service (${pop.toLocaleString()} people).`
        : product.tier === "POE"
          ? `Sized for community-scale flow (${pop.toLocaleString()} people).`
          : product.tier === "SYSTEM"
            ? `Distribution-side fix; engineered install.`
            : `Compliance support service.`);

    recs.push({ product, matchedContaminants: matched, fitScore: score, rationale });
  }

  return recs.sort((a, b) => b.fitScore - a.fitScore).slice(0, 4);
}

export function formatPrice(n: number) {
  return n >= 1000 ? `$${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}k` : `$${n}`;
}
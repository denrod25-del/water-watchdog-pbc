import { Wrench, Package, Sparkles } from "lucide-react";
import { recommendProducts, formatPrice, type Recommendation } from "@/lib/matcher";
import type { Lead } from "@/lib/format";

const TIER_STYLE: Record<Recommendation["product"]["tier"], string> = {
  POU: "bg-cool-soft text-cool border-cool/30",
  POE: "bg-warm-soft text-warm border-warm/30",
  SYSTEM: "bg-hot-soft text-hot border-hot/30",
  SERVICE: "bg-secondary text-secondary-foreground border-border",
};

export function ProductMatcher({ lead }: { lead: Lead }) {
  const recs = recommendProducts(lead);
  if (recs.length === 0) return null;

  const totalCapex = recs.slice(0, 2).reduce((s, r) => s + r.product.price, 0);
  const totalMonthly = recs.slice(0, 2).reduce((s, r) => s + r.product.monthlyService, 0);

  return (
    <div className="mt-6 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-muted-foreground">
          <Sparkles className="h-3.5 w-3.5" /> Recommended solutions
        </h3>
        <span className="text-[10px] text-muted-foreground">
          Top-2 bundle ≈ <span className="font-bold text-foreground">{formatPrice(totalCapex)}</span>
          {totalMonthly > 0 && <> + {formatPrice(totalMonthly)}/mo</>}
        </span>
      </div>

      <div className="space-y-2">
        {recs.map((rec, i) => (
          <div
            key={rec.product.sku}
            className="rounded-xl border border-border bg-card p-3 shadow-[var(--shadow-soft)] transition-colors hover:border-primary/40"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  {i === 0 && (
                    <span className="rounded-full bg-primary px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-primary-foreground">
                      Best fit
                    </span>
                  )}
                  <span
                    className={`rounded-full border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider ${TIER_STYLE[rec.product.tier]}`}
                  >
                    {rec.product.tier}
                  </span>
                  <span className="font-mono text-[10px] text-muted-foreground">{rec.product.sku}</span>
                </div>
                <p className="mt-1 truncate text-sm font-semibold text-foreground">{rec.product.name}</p>
                <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{rec.product.blurb}</p>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-sm font-bold tabular-nums text-foreground">{formatPrice(rec.product.price)}</p>
                {rec.product.monthlyService > 0 && (
                  <p className="text-[10px] text-muted-foreground tabular-nums">
                    +{formatPrice(rec.product.monthlyService)}/mo
                  </p>
                )}
                <div className="mt-1 inline-flex items-center gap-1 rounded-md bg-secondary px-1.5 py-0.5 text-[9px] font-semibold text-secondary-foreground">
                  Fit {rec.fitScore}
                </div>
              </div>
            </div>
            <div className="mt-2 flex flex-wrap gap-1">
              {rec.matchedContaminants.map((c) => (
                <span
                  key={c.key}
                  title={c.evidence}
                  className="rounded-md border border-hot/20 bg-hot-soft/40 px-1.5 py-0.5 text-[10px] font-semibold text-hot"
                >
                  Solves {c.label}
                </span>
              ))}
            </div>
            <p className="mt-2 flex items-center gap-1 text-[10px] text-muted-foreground">
              <Package className="h-2.5 w-2.5" /> Lead time {rec.product.leadTimeDays} days · {rec.product.category}
            </p>
          </div>
        ))}
      </div>

      <p className="flex items-center gap-1 text-[10px] text-muted-foreground">
        <Wrench className="h-2.5 w-2.5" /> Auto-matched from violation profile · pricing is indicative
      </p>
    </div>
  );
}
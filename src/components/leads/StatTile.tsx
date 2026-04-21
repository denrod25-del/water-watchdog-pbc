import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

export function StatTile({
  label,
  value,
  hint,
  tone = "default",
  icon,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  tone?: "default" | "hot" | "warm" | "cool";
  icon?: ReactNode;
}) {
  const toneClass = {
    default: "border-border bg-card",
    hot: "border-hot/30 bg-hot-soft/40",
    warm: "border-warm/30 bg-warm-soft/40",
    cool: "border-cool/30 bg-cool-soft/40",
  }[tone];
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl border p-4 shadow-[var(--shadow-soft)] transition-all hover:shadow-[var(--shadow-elevated)] hover:-translate-y-0.5",
        toneClass,
      )}
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            {label}
          </p>
          <p className="mt-1 text-3xl font-bold tracking-tight text-foreground tabular-nums">{value}</p>
          {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
        </div>
        {icon && <div className="text-muted-foreground/60">{icon}</div>}
      </div>
    </div>
  );
}

import { Link } from "@tanstack/react-router";
import { PriorityBadge } from "./PriorityBadge";
import { ScoreBar } from "./Sparkline";
import { formatNumber, formatPhone, type Lead } from "@/lib/format";
import { AlertCircle, ExternalLink, Phone } from "lucide-react";
import type { LeadStatus } from "./useLeadStatus";

const STATUS_DOT: Record<LeadStatus, string> = {
  new: "bg-cold",
  contacted: "bg-cool",
  qualified: "bg-warm",
  won: "bg-emerald-500",
  lost: "bg-muted-foreground/40",
};

export function LeadTable({
  leads,
  onSelect,
  store,
}: {
  leads: Lead[];
  onSelect: (l: Lead) => void;
  store: Record<string, { status: LeadStatus; notes: string }>;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-[var(--shadow-soft)]">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-secondary/60 text-left text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Priority</th>
              <th className="px-4 py-3">System</th>
              <th className="px-4 py-3">City</th>
              <th className="px-4 py-3 text-right">Pop</th>
              <th className="px-4 py-3">Flags</th>
              <th className="px-4 py-3">Score</th>
              <th className="px-4 py-3">Phone</th>
              <th className="px-4 py-3">Pipeline</th>
            </tr>
          </thead>
          <tbody>
            {leads.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-12 text-center text-muted-foreground">
                  No systems match your filters.
                </td>
              </tr>
            )}
            {leads.map((l) => {
              const flags = l.Flags ? l.Flags.split("; ").filter(Boolean) : [];
              const status = store[l.PWSID]?.status ?? "new";
              return (
                <tr
                  key={l.PWSID}
                  onClick={() => onSelect(l)}
                  className="cursor-pointer border-t border-border transition-colors hover:bg-accent/40"
                >
                  <td className="px-4 py-3 align-top"><PriorityBadge priority={l.Priority} /></td>
                  <td className="max-w-[260px] px-4 py-3 align-top">
                    <Link
                      to="/leads/$pwsid"
                      params={{ pwsid: l.PWSID }}
                      onClick={(e) => e.stopPropagation()}
                      className="group inline-flex items-center gap-1 font-semibold text-foreground hover:text-primary"
                    >
                      {l["System Name"]}
                      <ExternalLink className="h-3 w-3 opacity-0 transition-opacity group-hover:opacity-100" />
                    </Link>
                    <p className="font-mono text-[10px] text-muted-foreground">{l.PWSID}</p>
                  </td>
                  <td className="px-4 py-3 align-top text-foreground">{l.City || "—"}</td>
                  <td className="px-4 py-3 text-right align-top tabular-nums text-foreground">
                    {formatNumber(l["Population Served"])}
                  </td>
                  <td className="max-w-[320px] px-4 py-3 align-top">
                    {flags.length === 0 ? (
                      <span className="text-xs text-muted-foreground">No active flags</span>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {flags.slice(0, 3).map((f, i) => (
                          <span
                            key={i}
                            className="inline-flex items-center gap-1 rounded-md bg-hot-soft px-1.5 py-0.5 text-[10px] font-medium text-hot"
                          >
                            <AlertCircle className="h-2.5 w-2.5" /> {f}
                          </span>
                        ))}
                        {flags.length > 3 && (
                          <span className="text-[10px] text-muted-foreground">+{flags.length - 3} more</span>
                        )}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 align-top"><ScoreBar score={l["Lead Score"]} /></td>
                  <td className="px-4 py-3 align-top text-xs text-muted-foreground">
                    {l.Phone ? (
                      <a
                        href={`tel:${l.Phone}`}
                        onClick={(e) => e.stopPropagation()}
                        className="inline-flex items-center gap-1 text-primary hover:underline"
                      >
                        <Phone className="h-3 w-3" /> {formatPhone(l.Phone)}
                      </a>
                    ) : "—"}
                  </td>
                  <td className="px-4 py-3 align-top">
                    <span className="inline-flex items-center gap-1.5 text-xs capitalize text-foreground">
                      <span className={`h-2 w-2 rounded-full ${STATUS_DOT[status]}`} />
                      {status}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

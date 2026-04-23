import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { fetchViolationHistory, type ViolationRecord } from "@/server/violation-history";
import { AlertTriangle, CalendarClock, FlaskConical, Loader2, RefreshCw, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

function formatDate(iso: string | null) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}

function isResolved(status: string) {
  return /resolved|archived|returned/i.test(status);
}

export function ViolationHistory({ pwsid }: { pwsid: string }) {
  const fetcher = useServerFn(fetchViolationHistory);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [violations, setViolations] = useState<ViolationRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [fetchedAt, setFetchedAt] = useState<string | null>(null);

  const load = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const res = await fetcher({ data: { pwsid } });
      setViolations(res.violations);
      setFetchedAt(res.fetchedAt);
      if (res.error) setError(res.error);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load violations");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pwsid]);

  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-muted-foreground">
          <FlaskConical className="h-3.5 w-3.5" /> Violation history (live from EPA SDWIS)
        </h2>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => load(true)}
          disabled={loading || refreshing}
          className="h-7 gap-1.5 text-xs"
        >
          {refreshing ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
          Refresh
        </Button>
      </div>

      {loading && (
        <div className="space-y-2">
          <Skeleton className="h-16 w-full rounded-xl" />
          <Skeleton className="h-16 w-full rounded-xl" />
          <Skeleton className="h-16 w-full rounded-xl" />
        </div>
      )}

      {!loading && error && violations.length === 0 && (
        <div className="rounded-xl border border-warm/30 bg-warm-soft/30 p-4 text-sm text-warm">
          <p className="font-semibold">Could not fetch live records.</p>
          <p className="mt-1 text-xs text-muted-foreground">{error}</p>
        </div>
      )}

      {!loading && !error && violations.length === 0 && (
        <div className="rounded-xl border border-border bg-card p-6 text-center">
          <ShieldCheck className="mx-auto h-6 w-6 text-emerald-500" />
          <p className="mt-2 text-sm font-semibold text-foreground">No SDWIS violations on file</p>
          <p className="text-xs text-muted-foreground">EPA returned zero violation records for this PWSID.</p>
        </div>
      )}

      {!loading && violations.length > 0 && (
        <ol className="space-y-2">
          {violations.map((v) => {
            const resolved = isResolved(v.status);
            return (
              <li
                key={v.id}
                className={`rounded-xl border p-3 ${
                  v.isHealthBased && !resolved
                    ? "border-hot/30 bg-hot-soft/30"
                    : resolved
                      ? "border-border bg-card"
                      : "border-warm/30 bg-warm-soft/20"
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {v.isHealthBased && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-hot px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white">
                          <AlertTriangle className="h-2.5 w-2.5" /> Health-based
                        </span>
                      )}
                      <span className="rounded-full border border-border bg-secondary px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-secondary-foreground">
                        {v.category}
                      </span>
                      {v.contaminantCode && (
                        <span className="font-mono text-[10px] text-muted-foreground">#{v.contaminantCode}</span>
                      )}
                    </div>
                    <p className="mt-1 text-sm font-semibold text-foreground">{v.contaminantName}</p>
                    <p className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        <CalendarClock className="h-3 w-3" />
                        {formatDate(v.beginDate)}
                        {v.endDate && <> → {formatDate(v.endDate)}</>}
                      </span>
                      {v.publicNotificationTier && (
                        <span>· Tier {v.publicNotificationTier} notice</span>
                      )}
                    </p>
                  </div>
                  <div className="text-right">
                    <span
                      className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                        resolved
                          ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                          : "bg-hot-soft text-hot"
                      }`}
                    >
                      {v.status}
                    </span>
                    {v.enforcementAction && (
                      <p className="mt-1 text-[10px] text-muted-foreground">
                        Enforcement: {v.enforcementAction}
                        {v.enforcementDate && ` · ${formatDate(v.enforcementDate)}`}
                      </p>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      )}

      {fetchedAt && (
        <p className="mt-3 text-[10px] text-muted-foreground">
          Live from EPA Envirofacts · fetched {new Date(fetchedAt).toLocaleString()}
        </p>
      )}
    </section>
  );
}
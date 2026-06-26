import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { searchCounty } from "@/lib/county-search.functions";
import { US_STATES } from "@/lib/score";
import type { Lead } from "@/lib/format";
import { LeadTable } from "./LeadTable";
import { useLeadStore } from "./useLeadStatus";
import { Globe2, Loader2, RefreshCw, Search, ServerCrash, Database } from "lucide-react";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";

type Result = {
  state: string;
  county: string;
  systems: Lead[];
  fetchedAt: string;
  expiresAt: string;
  cached: boolean;
};

export function CountySearch({ onSelect }: { onSelect: (l: Lead) => void }) {
  const [state, setState] = useState("FL");
  const [county, setCounty] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const { store } = useLeadStore();
  const search = useServerFn(searchCounty);

  const run = async (forceRefresh = false) => {
    if (!county.trim()) {
      setError("Enter a county name");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const r = await search({ data: { state, county: county.trim(), forceRefresh } });
      setResult(r);
      if (r.systems.length === 0) {
        toast.warning(`No systems found for ${r.county}, ${r.state}`);
      } else {
        toast.success(
          `${r.systems.length} systems · ${r.cached ? "cached" : "live from EPA SDWIS"}`,
        );
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Search failed";
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="space-y-4 rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-soft)]">
      <header className="flex flex-wrap items-center gap-2">
        <Globe2 className="h-5 w-5 text-primary" />
        <h2 className="text-lg font-bold tracking-tight">Any-county search</h2>
        <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          Live · EPA SDWIS · 7-day cache
        </span>
      </header>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          run(false);
        }}
        className="grid grid-cols-1 gap-2 sm:grid-cols-[120px_1fr_auto_auto]"
      >
        <select
          value={state}
          onChange={(e) => setState(e.target.value)}
          className="h-10 rounded-xl border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring/30"
          disabled={loading}
        >
          {US_STATES.map((s) => (
            <option key={s.code} value={s.code}>
              {s.code} — {s.name}
            </option>
          ))}
        </select>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={county}
            onChange={(e) => setCounty(e.target.value)}
            placeholder="County name (e.g. Palm Beach)"
            className="h-10 w-full rounded-xl border border-input bg-background pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-ring/30"
            disabled={loading}
          />
        </div>
        <button
          type="submit"
          disabled={loading || !county.trim()}
          className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          Search
        </button>
        {result && (
          <button
            type="button"
            onClick={() => run(true)}
            disabled={loading}
            title="Bypass cache and refetch from EPA"
            className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-border bg-background px-3 text-sm font-medium text-muted-foreground hover:bg-secondary disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
          </button>
        )}
      </form>

      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          <ServerCrash className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {loading && !result && (
        <LoadingState />
      )}

      {loading && result && (
        <LoadingState />
      )}

      {result && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5 font-mono">
              {result.cached ? <Database className="h-3.5 w-3.5" /> : <Globe2 className="h-3.5 w-3.5" />}
              {result.cached ? "From cache" : "Fresh from EPA"}
            </span>
            <span>·</span>
            <span>
              <strong className="text-foreground">{result.systems.length}</strong> systems in{" "}
              <strong className="text-foreground">{result.county}, {result.state}</strong>
            </span>
            <span>·</span>
            <span>
              Cached until{" "}
              {new Date(result.expiresAt).toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
              })}
            </span>
          </div>
          {result.systems.length > 0 ? (
            <LeadTable leads={result.systems} onSelect={onSelect} store={store} />
          ) : (
            <p className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
              No active public water systems found for this county.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
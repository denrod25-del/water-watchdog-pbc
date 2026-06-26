import { useCallback, useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { searchCounty } from "@/lib/county-search.functions";
import {
  addSavedSearch,
  listSavedSearches,
  popularCountiesInState,
  removeSavedSearch,
  type SavedSearch,
} from "@/lib/saved-searches.functions";
import { US_STATES } from "@/lib/score";
import type { Lead } from "@/lib/format";
import { LeadTable } from "./LeadTable";
import { useLeadStore } from "./useLeadStatus";
import {
  Bookmark,
  BookmarkCheck,
  Clock,
  Compass,
  Database,
  Globe2,
  Loader2,
  MapPinned,
  RefreshCw,
  Search,
  ServerCrash,
  Sparkles,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";

const RECENT_KEY = "wq-recent-county-searches-v1";
type RecentEntry = { state: string; county: string; at: number };

function readRecent(): RecentEntry[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) || "[]");
  } catch {
    return [];
  }
}
function pushRecent(state: string, county: string) {
  const next = [{ state, county, at: Date.now() }, ...readRecent().filter(
    (r) => !(r.state === state && r.county.toLowerCase() === county.toLowerCase()),
  )].slice(0, 8);
  localStorage.setItem(RECENT_KEY, JSON.stringify(next));
}

function LoadingState() {
  return (
    <div className="space-y-3 rounded-xl border border-dashed border-border p-4">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin text-primary" />
        Querying EPA Safe Drinking Water Information System…
      </div>
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3">
            <Skeleton className="h-6 w-16 rounded-md" />
            <Skeleton className="h-6 flex-1 rounded-md" />
            <Skeleton className="hidden h-6 w-24 rounded-md sm:block" />
            <Skeleton className="hidden h-6 w-16 rounded-md sm:block" />
            <Skeleton className="h-6 w-20 rounded-md" />
          </div>
        ))}
      </div>
    </div>
  );
}

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
  const [recent, setRecent] = useState<RecentEntry[]>([]);
  const [saved, setSaved] = useState<SavedSearch[]>([]);
  const [suggestions, setSuggestions] = useState<{ county: string; systemCount: number }[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const { store } = useLeadStore();
  const search = useServerFn(searchCounty);
  const listSaved = useServerFn(listSavedSearches);
  const addSaved = useServerFn(addSavedSearch);
  const removeSaved = useServerFn(removeSavedSearch);
  const popular = useServerFn(popularCountiesInState);

  useEffect(() => {
    setRecent(readRecent());
    listSaved().then(setSaved).catch(() => {});
  }, [listSaved]);

  // Suggestions: nearby/popular counties for current state
  useEffect(() => {
    let cancelled = false;
    popular({ data: { state } })
      .then((r) => { if (!cancelled) setSuggestions(r); })
      .catch(() => { if (!cancelled) setSuggestions([]); });
    return () => { cancelled = true; };
  }, [state, popular, result]);

  // "/" focuses the county input (unless typing in an input/textarea already)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const tag = t?.tagName;
      if (e.key === "/" && tag !== "INPUT" && tag !== "TEXTAREA" && !t?.isContentEditable) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const runFor = useCallback(
    async (st: string, co: string, forceRefresh = false) => {
      setLoading(true);
      setError(null);
      setShowHistory(false);
      try {
        const r = await search({ data: { state: st, county: co.trim(), forceRefresh } });
        setResult(r);
        pushRecent(r.state, r.county);
        setRecent(readRecent());
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
    },
    [search],
  );

  const run = (forceRefresh = false) => {
    if (!county.trim()) {
      setError("Enter a county name");
      return;
    }
    return runFor(state, county, forceRefresh);
  };

  const jumpTo = (st: string, co: string) => {
    setState(st);
    setCounty(co);
    runFor(st, co, false);
  };

  const isSaved = result
    ? saved.some((s) => s.state === result.state && s.county.toLowerCase() === result.county.toLowerCase())
    : false;

  const toggleSave = async () => {
    if (!result) return;
    try {
      if (isSaved) {
        await removeSaved({ data: { state: result.state, county: result.county } });
        toast.success(`Removed ${result.county}, ${result.state} from saved`);
      } else {
        await addSaved({ data: { state: result.state, county: result.county } });
        toast.success(`Saved ${result.county}, ${result.state}`);
      }
      const next = await listSaved();
      setSaved(next);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not update saved searches");
    }
  };

  const removeSavedAt = async (s: SavedSearch) => {
    try {
      await removeSaved({ data: { state: s.state, county: s.county } });
      setSaved((prev) => prev.filter((x) => x.id !== s.id));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not remove saved");
    }
  };

  const clearRecent = () => {
    localStorage.removeItem(RECENT_KEY);
    setRecent([]);
  };

  const tryAnother = () => {
    setResult(null);
    setError(null);
    setCounty("");
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  return (
    <section className="space-y-4 rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-soft)]">
      <header className="flex flex-wrap items-center gap-2">
        <Globe2 className="h-5 w-5 text-primary" />
        <h2 className="text-lg font-bold tracking-tight">Any-county search</h2>
        <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          Live · EPA SDWIS · 7-day cache
        </span>
        <span className="ml-auto hidden items-center gap-1 rounded-md border border-border bg-background px-2 py-0.5 text-[10px] text-muted-foreground sm:inline-flex">
          Press <kbd className="rounded bg-secondary px-1 font-mono">/</kbd> to focus
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
            ref={inputRef}
            value={county}
            onChange={(e) => setCounty(e.target.value)}
            onFocus={() => setShowHistory(true)}
            onBlur={() => setTimeout(() => setShowHistory(false), 150)}
            placeholder="County name (e.g. Palm Beach)"
            className="h-10 w-full rounded-xl border border-input bg-background pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-ring/30"
            disabled={loading}
          />
          {showHistory && (recent.length > 0 || saved.length > 0) && (
            <div className="absolute left-0 right-0 top-11 z-20 max-h-80 overflow-auto rounded-xl border border-border bg-card p-2 shadow-lg">
              {saved.length > 0 && (
                <div className="mb-2">
                  <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    Saved
                  </div>
                  {saved.map((s) => (
                    <div key={s.id} className="group flex items-center gap-1 rounded-md px-2 py-1.5 hover:bg-secondary">
                      <BookmarkCheck className="h-3.5 w-3.5 text-primary" />
                      <button
                        type="button"
                        onMouseDown={(e) => { e.preventDefault(); jumpTo(s.state, s.county); }}
                        className="flex-1 text-left text-sm text-foreground"
                      >
                        <span className="font-medium">{s.county}</span>
                        <span className="ml-1 text-xs text-muted-foreground">{s.state}</span>
                      </button>
                      <button
                        type="button"
                        onMouseDown={(e) => { e.preventDefault(); removeSavedAt(s); }}
                        className="opacity-0 transition-opacity group-hover:opacity-100"
                        title="Remove"
                      >
                        <X className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {recent.length > 0 && (
                <div>
                  <div className="flex items-center justify-between px-2 py-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Recent</span>
                    <button
                      type="button"
                      onMouseDown={(e) => { e.preventDefault(); clearRecent(); }}
                      className="text-[10px] text-muted-foreground hover:text-foreground"
                    >
                      Clear
                    </button>
                  </div>
                  {recent.map((r, i) => (
                    <button
                      key={i}
                      type="button"
                      onMouseDown={(e) => { e.preventDefault(); jumpTo(r.state, r.county); }}
                      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-secondary"
                    >
                      <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-foreground">{r.county}</span>
                      <span className="text-xs text-muted-foreground">{r.state}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
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
            <button
              type="button"
              onClick={toggleSave}
              className={`ml-auto inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-semibold transition-colors ${
                isSaved
                  ? "border-primary/40 bg-primary/10 text-primary"
                  : "border-border bg-background text-muted-foreground hover:bg-secondary"
              }`}
              title={isSaved ? "Remove from saved" : "Save this search"}
            >
              {isSaved ? <BookmarkCheck className="h-3.5 w-3.5" /> : <Bookmark className="h-3.5 w-3.5" />}
              {isSaved ? "Saved" : "Save search"}
            </button>
          </div>
          {result.systems.length > 0 ? (
            (() => {
              const lcrSystems = result.systems.filter(
                (s) =>
                  (s["LCR Violations (5yr)"] ?? 0) > 0 ||
                  (s["Active Health-Based Violations"] ?? 0) > 0 ||
                  s.Priority === "HOT" ||
                  s.Priority === "WARM",
              );
              if (lcrSystems.length === 0) {
                return (
                  <EmptyState
                    icon={<Sparkles className="h-6 w-6 text-primary" />}
                    title={`Good news — no lead or copper issues flagged in ${result.county}, ${result.state}`}
                    body={
                      <>
                        We found <strong className="text-foreground">{result.systems.length}</strong> active
                        water systems, but none have recent Lead &amp; Copper Rule violations or active
                        health-based violations. That's a clean bill of health for this county.
                      </>
                    }
                    hint="Try a neighboring county, or search a larger metro area to surface more replacement opportunities."
                    onReset={tryAnother}
                  >
                    <LeadTable leads={result.systems} onSelect={onSelect} store={store} />
                  </EmptyState>
                );
              }
              return <LeadTable leads={result.systems} onSelect={onSelect} store={store} />;
            })()
          ) : (
            <EmptyState
              icon={<MapPinned className="h-6 w-6 text-primary" />}
              title={`No active public water systems found in ${result.county}, ${result.state}`}
              body={
                <>
                  EPA SDWIS doesn't list any active community water systems for this county. This usually
                  means the county name is spelled differently in EPA's records, or residents are served by
                  systems registered to a neighboring county.
                </>
              }
              hint='Double-check spelling (e.g. "Miami-Dade", "St. Lucie", "DeKalb") or try an adjacent county.'
              onReset={tryAnother}
            />
          )}
        </div>
      )}

      {suggestions.length > 0 && (
        <div className="rounded-xl border border-border bg-secondary/40 p-3">
          <div className="mb-2 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            <Compass className="h-3 w-3" /> Other counties searched in {state}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {suggestions
              .filter((s) => !result || s.county.toLowerCase() !== result.county.toLowerCase())
              .slice(0, 10)
              .map((s) => (
                <button
                  key={s.county}
                  type="button"
                  onClick={() => jumpTo(state, s.county)}
                  disabled={loading}
                  className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-2.5 py-1 text-xs text-foreground hover:bg-secondary disabled:opacity-50"
                >
                  {s.county}
                  <span className="text-[10px] text-muted-foreground">· {s.systemCount}</span>
                </button>
              ))}
          </div>
        </div>
      )}
    </section>
  );
}

function EmptyState({
  icon,
  title,
  body,
  hint,
  onReset,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  body: React.ReactNode;
  hint: string;
  onReset: () => void;
  children?: React.ReactNode;
}) {
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-dashed border-border bg-secondary/30 p-6">
        <div className="flex items-start gap-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10">
            {icon}
          </div>
          <div className="flex-1 space-y-2">
            <h3 className="text-base font-semibold text-foreground">{title}</h3>
            <p className="text-sm text-muted-foreground">{body}</p>
            <p className="text-xs text-muted-foreground/80">{hint}</p>
            <div className="pt-2">
              <button
                type="button"
                onClick={onReset}
                className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-primary px-3 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
              >
                <Search className="h-3.5 w-3.5" /> Try another county
              </button>
            </div>
          </div>
        </div>
      </div>
      {children}
    </div>
  );
}
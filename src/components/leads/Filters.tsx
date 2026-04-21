import { Search } from "lucide-react";

export type FilterState = {
  q: string;
  priorities: Set<string>;
  onlyMcl: boolean;
  onlyLcr: boolean;
  onlyUnresolved: boolean;
  minPop: number;
};

const PRIOS = ["HOT", "WARM", "COOL", "COLD"];

export function Filters({ state, setState, total, shown }: { state: FilterState; setState: (s: FilterState) => void; total: number; shown: number }) {
  const toggle = (p: string) => {
    const n = new Set(state.priorities);
    if (n.has(p)) n.delete(p); else n.add(p);
    setState({ ...state, priorities: n });
  };
  return (
    <div className="space-y-3 rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-soft)]">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={state.q}
            onChange={(e) => setState({ ...state, q: e.target.value })}
            placeholder="Search by name, city, PWSID…"
            className="h-10 w-full rounded-xl border border-input bg-background pl-9 pr-3 text-sm outline-none ring-ring/30 focus:ring-2"
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {PRIOS.map((p) => (
            <button
              key={p}
              onClick={() => toggle(p)}
              className={`rounded-full border px-3 py-1 text-xs font-bold uppercase tracking-wider transition-all ${
                state.priorities.has(p)
                  ? p === "HOT"
                    ? "border-hot bg-hot text-hot-foreground"
                    : p === "WARM"
                      ? "border-warm bg-warm text-warm-foreground"
                      : p === "COOL"
                        ? "border-cool bg-cool text-cool-foreground"
                        : "border-cold bg-cold text-cold-foreground"
                  : "border-border bg-background text-muted-foreground hover:bg-secondary"
              }`}
            >
              {p}
            </button>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <Toggle on={state.onlyMcl} onClick={() => setState({ ...state, onlyMcl: !state.onlyMcl })}>Active MCL</Toggle>
        <Toggle on={state.onlyLcr} onClick={() => setState({ ...state, onlyLcr: !state.onlyLcr })}>Lead/Copper issues</Toggle>
        <Toggle on={state.onlyUnresolved} onClick={() => setState({ ...state, onlyUnresolved: !state.onlyUnresolved })}>Unresolved (5yr)</Toggle>
        <div className="ml-auto flex items-center gap-2 text-muted-foreground">
          <label className="flex items-center gap-2">
            Min population
            <input
              type="number"
              value={state.minPop || ""}
              onChange={(e) => setState({ ...state, minPop: Number(e.target.value) || 0 })}
              className="h-7 w-20 rounded-md border border-input bg-background px-2 text-xs outline-none focus:ring-2 focus:ring-ring/30"
              placeholder="0"
            />
          </label>
          <span className="font-mono text-xs tabular-nums">
            {shown}/{total}
          </span>
        </div>
      </div>
    </div>
  );
}

function Toggle({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full border px-3 py-1 font-medium transition-all ${
        on
          ? "border-primary bg-primary/10 text-primary"
          : "border-border bg-background text-muted-foreground hover:bg-secondary"
      }`}
    >
      {children}
    </button>
  );
}

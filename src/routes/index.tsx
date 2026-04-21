import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import leadsData from "@/data/leads.json";
import type { Lead } from "@/lib/format";
import { formatNumber } from "@/lib/format";
import { Hero } from "@/components/leads/Hero";
import { StatTile } from "@/components/leads/StatTile";
import { Filters, type FilterState } from "@/components/leads/Filters";
import { LeadTable } from "@/components/leads/LeadTable";
import { LeadMap } from "@/components/leads/LeadMap";
import { LeadDetail } from "@/components/leads/LeadDetail";
import { useLeadStore, type LeadStatus } from "@/components/leads/useLeadStatus";
import { AuthBar } from "@/components/leads/AuthBar";
import { useAuth } from "@/hooks/useAuth";
import { Toaster } from "@/components/ui/sonner";
import { AlertOctagon, Beaker, Droplet, FileSpreadsheet, FileText, Loader2, ShieldAlert, Map as MapIcon, Table as TableIcon } from "lucide-react";

export const Route = createFileRoute("/")({
  component: Index,
});

const ALL_LEADS = leadsData as Lead[];
const PRIO_ORDER: Record<string, number> = { HOT: 0, WARM: 1, COOL: 2, COLD: 3 };

function Index() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();

  useEffect(() => {
    if (!authLoading && !user) {
      navigate({ to: "/auth" });
    }
  }, [authLoading, user, navigate]);

  const [filters, setFilters] = useState<FilterState>({
    q: "",
    priorities: new Set(["HOT", "WARM", "COOL", "COLD"]),
    onlyMcl: false,
    onlyLcr: false,
    onlyUnresolved: false,
    minPop: 0,
  });
  const [selected, setSelected] = useState<Lead | null>(null);
  const [view, setView] = useState<"table" | "map">("table");
  const { store, update } = useLeadStore();

  const filtered = useMemo(() => {
    const q = filters.q.trim().toLowerCase();
    return ALL_LEADS.filter((l) => {
      if (!filters.priorities.has(l.Priority)) return false;
      if (filters.onlyMcl && l["Active MCL Violations"] === 0) return false;
      if (
        filters.onlyLcr &&
        !l["Lead Action Level Exceeded"] &&
        !l["Copper Action Level Exceeded"] &&
        l["LCR Violations (5yr)"] === 0
      )
        return false;
      if (filters.onlyUnresolved && l["Unresolved Violations (5yr)"] === 0) return false;
      if (filters.minPop && l["Population Served"] < filters.minPop) return false;
      if (q) {
        const hay = `${l["System Name"]} ${l.City} ${l.PWSID} ${l.Contact}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    }).sort(
      (a, b) =>
        PRIO_ORDER[a.Priority] - PRIO_ORDER[b.Priority] ||
        b["Lead Score"] - a["Lead Score"] ||
        b["Population Served"] - a["Population Served"],
    );
  }, [filters]);

  const stats = useMemo(() => {
    const hot = ALL_LEADS.filter((l) => l.Priority === "HOT").length;
    const warm = ALL_LEADS.filter((l) => l.Priority === "WARM").length;
    const mcl = ALL_LEADS.filter((l) => l["Active MCL Violations"] > 0).length;
    const lead = ALL_LEADS.filter((l) => l["Lead Action Level Exceeded"]).length;
    const copper = ALL_LEADS.filter((l) => l["Copper Action Level Exceeded"]).length;
    const unresolved = ALL_LEADS.filter((l) => l["Unresolved Violations (5yr)"] > 0).length;
    const pop = ALL_LEADS.reduce((s, l) => s + (l["Population Served"] || 0), 0);
    return { hot, warm, mcl, lead, copper, unresolved, pop };
  }, []);

  const sel = selected ? store[selected.PWSID] : undefined;

  return (
    <div className="min-h-screen bg-background">
      <Toaster richColors position="top-right" />
      <main className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-8 sm:py-10">
        <AuthBar />
        <Hero totalSystems={ALL_LEADS.length} hot={stats.hot} />

        <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <StatTile
            label="HOT leads"
            value={stats.hot}
            tone="hot"
            icon={<ShieldAlert className="h-5 w-5" />}
            hint="Score ≥ 60"
          />
          <StatTile
            label="WARM leads"
            value={stats.warm}
            tone="warm"
            icon={<AlertOctagon className="h-5 w-5" />}
            hint="Score 30–59"
          />
          <StatTile label="Active MCL" value={stats.mcl} icon={<Beaker className="h-5 w-5" />} />
          <StatTile label="Lead exceedances" value={stats.lead} icon={<Droplet className="h-5 w-5" />} />
          <StatTile label="Copper exceedances" value={stats.copper} />
          <StatTile
            label="Population reached"
            value={formatNumber(stats.pop)}
            hint="across all systems"
          />
        </section>

        <Filters state={filters} setState={setFilters} total={ALL_LEADS.length} shown={filtered.length} />

        <div className="flex items-center justify-end">
          <div className="inline-flex rounded-xl border border-border bg-card p-1 shadow-sm">
            <button
              onClick={() => setView("table")}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                view === "table" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-secondary"
              }`}
            >
              <TableIcon className="h-3.5 w-3.5" /> Table
            </button>
            <button
              onClick={() => setView("map")}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                view === "map" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-secondary"
              }`}
            >
              <MapIcon className="h-3.5 w-3.5" /> Map
            </button>
          </div>
        </div>

        {view === "table" ? (
          <LeadTable leads={filtered} onSelect={setSelected} store={store} />
        ) : (
          <LeadMap leads={filtered} onSelect={setSelected} />
        )}

        <footer className="flex flex-col items-start justify-between gap-3 rounded-2xl border border-border bg-card p-4 text-xs text-muted-foreground sm:flex-row sm:items-center">
          <p className="flex items-center gap-2">
            <FileSpreadsheet className="h-3.5 w-3.5" />
            Source: U.S. EPA Safe Drinking Water Information System (SDWIS) Federal Reporting
          </p>
          <p className="flex items-center gap-2">
            <FileText className="h-3.5 w-3.5" />
            Violations from Jan 2020 onward · Lead/Copper action levels: 15 µg/L · 1.3 mg/L
          </p>
        </footer>
      </main>

      <LeadDetail
        lead={selected}
        open={!!selected}
        onOpenChange={(o) => !o && setSelected(null)}
        status={(sel?.status ?? "new") as LeadStatus}
        setStatus={(s) => selected && update(selected.PWSID, { status: s })}
        notes={sel?.notes ?? ""}
        setNotes={(n) => selected && update(selected.PWSID, { notes: n })}
      />
    </div>
  );
}

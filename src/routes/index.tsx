import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import type { Lead } from "@/lib/format";
import { Hero } from "@/components/leads/Hero";
import { LeadDetail } from "@/components/leads/LeadDetail";
import { useLeadStore, type LeadStatus } from "@/components/leads/useLeadStatus";
import { AuthBar } from "@/components/leads/AuthBar";
import { CountySearch } from "@/components/leads/CountySearch";
import { useAuth } from "@/hooks/useAuth";
import { Toaster } from "@/components/ui/sonner";
import { FileSpreadsheet, FileText, Loader2 } from "lucide-react";

export const Route = createFileRoute("/")({
  component: Index,
});

function Index() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const [selected, setSelected] = useState<Lead | null>(null);
  const { store, update } = useLeadStore();

  useEffect(() => {
    if (!authLoading && !user) navigate({ to: "/auth" });
  }, [authLoading, user, navigate]);

  const sel = selected ? store[selected.PWSID] : undefined;

  if (authLoading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          {authLoading ? "Loading…" : "Redirecting to sign in…"}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Toaster richColors position="top-right" />
      <main className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-8 sm:py-10">
        <AuthBar />
        <Hero totalSystems={0} hot={0} />

        <CountySearch onSelect={setSelected} />

        <footer className="flex flex-col items-start justify-between gap-3 rounded-2xl border border-border bg-card p-4 text-xs text-muted-foreground sm:flex-row sm:items-center">
          <p className="flex items-center gap-2">
            <FileSpreadsheet className="h-3.5 w-3.5" />
            Source: U.S. EPA Safe Drinking Water Information System (SDWIS) Federal Reporting — fetched live
          </p>
          <p className="flex items-center gap-2">
            <FileText className="h-3.5 w-3.5" />
            Lead/Copper action levels: 15 µg/L · 1.3 mg/L
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

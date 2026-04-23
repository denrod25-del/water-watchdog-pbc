import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import leadsData from "@/data/leads.json";
import { formatNumber, formatPhone, PWS_TYPE_LABEL, SOURCE_LABEL, type Lead } from "@/lib/format";
import { PriorityBadge } from "@/components/leads/PriorityBadge";
import { ProductMatcher } from "@/components/leads/ProductMatcher";
import { ViolationHistory } from "@/components/leads/ViolationHistory";
import { useLeadStore, type LeadStatus } from "@/components/leads/useLeadStatus";
import { useAuth } from "@/hooks/useAuth";
import { recommendProducts } from "@/lib/matcher";
import { Button } from "@/components/ui/button";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";
import {
  AlertTriangle,
  ArrowLeft,
  Building2,
  Calendar,
  Copy,
  Droplet,
  FlaskConical,
  Loader2,
  Mail,
  MapPin,
  Phone,
  Users,
} from "lucide-react";

const ALL_LEADS = leadsData as Lead[];

const STATUS_ORDER: LeadStatus[] = ["new", "contacted", "qualified", "won", "lost"];
const STATUS_LABEL: Record<LeadStatus, string> = {
  new: "New",
  contacted: "Contacted",
  qualified: "Qualified",
  won: "Won",
  lost: "Lost",
};

export const Route = createFileRoute("/leads/$pwsid")({
  head: ({ params }) => {
    const lead = ALL_LEADS.find((l) => l.PWSID === params.pwsid);
    const title = lead
      ? `${lead["System Name"]} — Water system details`
      : "Water system details";
    const description = lead
      ? `Compliance profile, lead/copper indicators, and recommended filtration for ${lead["System Name"]} (PWSID ${lead.PWSID}).`
      : "Water system compliance and filtration recommendations.";
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
      ],
    };
  },
  component: LeadDetailsPage,
  notFoundComponent: () => (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background p-8 text-center">
      <h1 className="text-2xl font-bold text-foreground">Water system not found</h1>
      <p className="text-sm text-muted-foreground">No SDWIS record matches that PWSID.</p>
      <Link to="/" className="text-sm font-semibold text-primary hover:underline">← Back to leads</Link>
    </div>
  ),
});

function LeadDetailsPage() {
  const { pwsid } = Route.useParams();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { store, update } = useLeadStore();

  useEffect(() => {
    if (!authLoading && !user) navigate({ to: "/auth" });
  }, [authLoading, user, navigate]);

  const lead = useMemo(() => ALL_LEADS.find((l) => l.PWSID === pwsid) ?? null, [pwsid]);

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

  if (!lead) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background p-8 text-center">
        <h1 className="text-2xl font-bold text-foreground">Water system not found</h1>
        <p className="text-sm text-muted-foreground">No SDWIS record matches PWSID <span className="font-mono">{pwsid}</span>.</p>
        <Link to="/" className="text-sm font-semibold text-primary hover:underline">← Back to leads</Link>
      </div>
    );
  }

  const flags = lead.Flags ? lead.Flags.split("; ").filter(Boolean) : [];
  const pbUg = lead["Lead 90th %ile (mg/L)"] * 1000;
  const cuMg = lead["Copper 90th %ile (mg/L)"];
  const entry = store[lead.PWSID];
  const status = (entry?.status ?? "new") as LeadStatus;
  const notes = entry?.notes ?? "";

  const copyPitch = () => {
    const recs = recommendProducts(lead);
    const top = recs[0];
    const productLine = top
      ? `\n\nBased on your violation profile, our ${top.product.name} (${top.product.sku}) is engineered to address exactly this — ${top.product.blurb}`
      : "";
    const pitch = `Hi ${lead.Contact || "team"} at ${lead["System Name"]},\n\nEPA SDWIS records show ${flags.length ? flags.join(", ") + "." : "compliance issues with your system."} We help water systems serving ${formatNumber(lead["Population Served"])} people deliver compliant, clean water with point-of-entry and point-of-use filtration.${productLine}\n\nCould we schedule 15 minutes to walk through options?`;
    navigator.clipboard.writeText(pitch);
    toast.success("Outreach pitch copied");
  };

  return (
    <div className="min-h-screen bg-background">
      <Toaster richColors position="top-right" />
      <main className="mx-auto max-w-5xl space-y-6 px-4 py-6 sm:px-8 sm:py-10">
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back to all leads
        </Link>

        <header className="space-y-3 rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-soft)]">
          <div className="flex flex-wrap items-center gap-2">
            <PriorityBadge priority={lead.Priority} />
            <span className="font-mono text-xs text-muted-foreground">{lead.PWSID}</span>
            <span className="ml-auto rounded-md bg-secondary px-2 py-0.5 text-xs font-semibold text-secondary-foreground">
              Score {lead["Lead Score"]}
            </span>
          </div>
          <h1 className="text-3xl font-bold leading-tight text-foreground">{lead["System Name"]}</h1>
          <p className="text-sm text-muted-foreground">
            {[PWS_TYPE_LABEL[lead.Type] ?? lead.Type, SOURCE_LABEL[lead.Source] ?? lead.Source, lead.City]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </header>

        {flags.length > 0 && (
          <section className="rounded-2xl border border-hot/30 bg-hot-soft/40 p-4">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-hot">
              <AlertTriangle className="h-3.5 w-3.5" /> Compliance flags
            </div>
            <ul className="mt-2 space-y-1 text-sm text-foreground">
              {flags.map((f, i) => <li key={i}>• {f}</li>)}
            </ul>
          </section>
        )}

        <section>
          <h2 className="mb-3 text-xs font-bold uppercase tracking-wider text-muted-foreground">System overview</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <InfoCell icon={<Users className="h-4 w-4" />} label="Population served" value={formatNumber(lead["Population Served"])} />
            <InfoCell icon={<Building2 className="h-4 w-4" />} label="Connections" value={formatNumber(lead["Service Connections"])} />
            <InfoCell icon={<Droplet className="h-4 w-4" />} label="Source" value={SOURCE_LABEL[lead.Source] ?? lead.Source} />
            <InfoCell icon={<Building2 className="h-4 w-4" />} label="System type" value={PWS_TYPE_LABEL[lead.Type] ?? lead.Type} />
          </div>
        </section>

        <section>
          <h2 className="mb-3 text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Violations &amp; lead / copper indicators
          </h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Metric label="Active MCL" value={lead["Active MCL Violations"]} bad={lead["Active MCL Violations"] > 0} />
            <Metric label="Health-based" value={lead["Active Health-Based Violations"]} bad={lead["Active Health-Based Violations"] > 0} />
            <Metric label="Total (5yr)" value={lead["Total Violations (5yr)"]} bad={lead["Total Violations (5yr)"] > 0} />
            <Metric label="Lead 90th %" value={pbUg ? `${pbUg.toFixed(1)} µg/L` : "—"} bad={pbUg > 15} hint="Action level: 15 µg/L" />
            <Metric label="Copper 90th %" value={cuMg ? `${cuMg.toFixed(2)} mg/L` : "—"} bad={cuMg > 1.3} hint="Action level: 1.3 mg/L" />
            <Metric label="LCR violations (5yr)" value={lead["LCR Violations (5yr)"]} bad={lead["LCR Violations (5yr)"] > 0} />
            <Metric label="Unresolved (5yr)" value={lead["Unresolved Violations (5yr)"]} bad={lead["Unresolved Violations (5yr)"] > 0} />
          </div>
          {lead["Latest Violation Date"] && (
            <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
              <Calendar className="h-3 w-3" /> Latest violation recorded {lead["Latest Violation Date"]}
            </p>
          )}
        </section>

        <section>
          <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Recommended filtration</h2>
          <ProductMatcher lead={lead} />
        </section>

        <ViolationHistory pwsid={lead.PWSID} />

        <section className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2 rounded-2xl border border-border bg-card p-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Contact</h3>
            {lead.Contact && <p className="text-sm font-semibold text-foreground">{lead.Contact}</p>}
            {lead.Phone && (
              <a href={`tel:${lead.Phone}`} className="flex items-center gap-2 text-sm text-primary hover:underline">
                <Phone className="h-3.5 w-3.5" /> {formatPhone(lead.Phone)}
              </a>
            )}
            {lead.Email && (
              <a href={`mailto:${lead.Email}`} className="flex items-center gap-2 text-sm text-primary hover:underline">
                <Mail className="h-3.5 w-3.5" /> {lead.Email}
              </a>
            )}
            <p className="flex items-start gap-2 text-sm text-muted-foreground">
              <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{[lead.Address, lead.City, lead.Zip].filter(Boolean).join(", ") || "—"}</span>
            </p>
          </div>

          <div className="rounded-2xl border border-border bg-card p-4">
            <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">Pipeline status</h3>
            <div className="flex flex-wrap gap-1.5">
              {STATUS_ORDER.map((s) => (
                <button
                  key={s}
                  onClick={() => update(lead.PWSID, { status: s })}
                  className={`rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${
                    status === s
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-background text-muted-foreground hover:bg-secondary"
                  }`}
                >
                  {STATUS_LABEL[s]}
                </button>
              ))}
            </div>
          </div>
        </section>

        <section>
          <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">Notes</h3>
          <textarea
            value={notes}
            onChange={(e) => update(lead.PWSID, { notes: e.target.value })}
            placeholder="Call notes, next steps, decision-makers…"
            className="min-h-[120px] w-full resize-y rounded-xl border border-border bg-card p-3 text-sm shadow-sm outline-none ring-ring/30 focus:ring-2"
          />
        </section>

        <div className="flex flex-wrap gap-2">
          <Button onClick={copyPitch} className="gap-2">
            <Copy className="h-4 w-4" /> Copy outreach pitch
          </Button>
          {lead.Phone && (
            <Button asChild variant="secondary" className="gap-2">
              <a href={`tel:${lead.Phone}`}>
                <Phone className="h-4 w-4" /> Call {formatPhone(lead.Phone)}
              </a>
            </Button>
          )}
          {lead.Email && (
            <Button asChild variant="outline" className="gap-2">
              <a href={`mailto:${lead.Email}`}>
                <Mail className="h-4 w-4" /> Email
              </a>
            </Button>
          )}
        </div>

        <p className="flex items-center gap-1 pb-6 text-[10px] text-muted-foreground">
          <FlaskConical className="h-3 w-3" /> Data: EPA SDWIS Federal Reporting · violations from 2020+
        </p>
      </main>
    </div>
  );
}

function InfoCell({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <div className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        {icon} {label}
      </div>
      <p className="mt-1 text-sm font-semibold text-foreground">{value}</p>
    </div>
  );
}

function Metric({ label, value, bad, hint }: { label: string; value: React.ReactNode; bad?: boolean; hint?: string }) {
  return (
    <div className={`rounded-xl border p-3 ${bad ? "border-hot/30 bg-hot-soft/30" : "border-border bg-card"}`}>
      <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={`mt-1 text-lg font-bold tabular-nums ${bad ? "text-hot" : "text-foreground"}`}>{value}</p>
      {hint && <p className="text-[10px] text-muted-foreground">{hint}</p>}
    </div>
  );
}
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { PriorityBadge } from "./PriorityBadge";
import { formatNumber, formatPhone, PWS_TYPE_LABEL, SOURCE_LABEL, type Lead } from "@/lib/format";
import { Mail, Phone, MapPin, Building2, Users, Droplet, AlertTriangle, FlaskConical, Calendar, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import type { LeadStatus } from "./useLeadStatus";

const STATUS_ORDER: LeadStatus[] = ["new", "contacted", "qualified", "won", "lost"];
const STATUS_LABEL: Record<LeadStatus, string> = {
  new: "New",
  contacted: "Contacted",
  qualified: "Qualified",
  won: "Won",
  lost: "Lost",
};

export function LeadDetail({
  lead,
  open,
  onOpenChange,
  status,
  setStatus,
  notes,
  setNotes,
}: {
  lead: Lead | null;
  open: boolean;
  onOpenChange: (b: boolean) => void;
  status: LeadStatus;
  setStatus: (s: LeadStatus) => void;
  notes: string;
  setNotes: (n: string) => void;
}) {
  if (!lead) return null;
  const flags = lead.Flags ? lead.Flags.split("; ").filter(Boolean) : [];
  const pbUg = lead["Lead 90th %ile (mg/L)"] * 1000;
  const cuMg = lead["Copper 90th %ile (mg/L)"];

  const copyPitch = () => {
    const pitch = `Hi ${lead.Contact || "team"} at ${lead["System Name"]},\n\nEPA SDWIS records show ${flags.length ? flags.join(", ") + "." : "compliance issues with your system."} We help water systems serving ${formatNumber(lead["Population Served"])} people deliver compliant, clean water with point-of-entry and point-of-use filtration.\n\nCould we schedule 15 minutes to walk through options?`;
    navigator.clipboard.writeText(pitch);
    toast.success("Outreach pitch copied");
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader className="space-y-3">
          <div className="flex items-center gap-2">
            <PriorityBadge priority={lead.Priority} />
            <span className="font-mono text-xs text-muted-foreground">{lead.PWSID}</span>
            <span className="ml-auto rounded-md bg-secondary px-2 py-0.5 text-xs font-semibold text-secondary-foreground">
              Score {lead["Lead Score"]}
            </span>
          </div>
          <SheetTitle className="text-2xl leading-tight">{lead["System Name"]}</SheetTitle>
        </SheetHeader>

        {flags.length > 0 && (
          <div className="mt-4 rounded-xl border border-hot/30 bg-hot-soft/40 p-3">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-hot">
              <AlertTriangle className="h-3.5 w-3.5" /> Compliance flags
            </div>
            <ul className="mt-2 space-y-1 text-sm text-foreground">
              {flags.map((f, i) => <li key={i}>• {f}</li>)}
            </ul>
          </div>
        )}

        <div className="mt-6 grid grid-cols-2 gap-3">
          <InfoCell icon={<Users className="h-4 w-4" />} label="Population served" value={formatNumber(lead["Population Served"])} />
          <InfoCell icon={<Building2 className="h-4 w-4" />} label="Connections" value={formatNumber(lead["Service Connections"])} />
          <InfoCell icon={<Droplet className="h-4 w-4" />} label="Source" value={SOURCE_LABEL[lead.Source] ?? lead.Source} />
          <InfoCell icon={<Building2 className="h-4 w-4" />} label="System type" value={PWS_TYPE_LABEL[lead.Type] ?? lead.Type} />
        </div>

        <div className="mt-6 grid grid-cols-2 gap-3">
          <Metric label="Active MCL" value={lead["Active MCL Violations"]} bad={lead["Active MCL Violations"] > 0} />
          <Metric label="Health-based" value={lead["Active Health-Based Violations"]} bad={lead["Active Health-Based Violations"] > 0} />
          <Metric label="Lead 90th %" value={pbUg ? `${pbUg.toFixed(1)} µg/L` : "—"} bad={pbUg > 15} hint="Action level: 15 µg/L" />
          <Metric label="Copper 90th %" value={cuMg ? `${cuMg.toFixed(2)} mg/L` : "—"} bad={cuMg > 1.3} hint="Action level: 1.3 mg/L" />
          <Metric label="LCR violations (5yr)" value={lead["LCR Violations (5yr)"]} bad={lead["LCR Violations (5yr)"] > 0} />
          <Metric label="Unresolved (5yr)" value={lead["Unresolved Violations (5yr)"]} bad={lead["Unresolved Violations (5yr)"] > 0} />
        </div>

        <div className="mt-6 space-y-2 rounded-xl border border-border bg-card p-4">
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
            <span>{[lead.Address, lead.City, lead.Zip].filter(Boolean).join(", ")}</span>
          </p>
          {lead["Latest Violation Date"] && (
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <Calendar className="h-3 w-3" /> Latest violation {lead["Latest Violation Date"]}
            </p>
          )}
        </div>

        <div className="mt-6">
          <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">Pipeline status</h3>
          <div className="flex flex-wrap gap-1.5">
            {STATUS_ORDER.map((s) => (
              <button
                key={s}
                onClick={() => setStatus(s)}
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

        <div className="mt-6">
          <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">Notes</h3>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Call notes, next steps, decision-makers…"
            className="min-h-[100px] w-full resize-y rounded-xl border border-border bg-card p-3 text-sm shadow-sm outline-none ring-ring/30 focus:ring-2"
          />
        </div>

        <div className="mt-4 mb-8 flex gap-2">
          <Button onClick={copyPitch} className="flex-1 gap-2">
            <Copy className="h-4 w-4" /> Copy pitch
          </Button>
          {lead.Phone && (
            <Button asChild variant="secondary" className="flex-1 gap-2">
              <a href={`tel:${lead.Phone}`}>
                <Phone className="h-4 w-4" /> Call
              </a>
            </Button>
          )}
        </div>

        <p className="mt-2 mb-6 flex items-center gap-1 text-[10px] text-muted-foreground">
          <FlaskConical className="h-3 w-3" /> Data: EPA SDWIS Federal Reporting · violations from 2020+
        </p>
      </SheetContent>
    </Sheet>
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
    <div
      className={`rounded-xl border p-3 ${
        bad ? "border-hot/30 bg-hot-soft/30" : "border-border bg-card"
      }`}
    >
      <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={`mt-1 text-lg font-bold tabular-nums ${bad ? "text-hot" : "text-foreground"}`}>{value}</p>
      {hint && <p className="text-[10px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

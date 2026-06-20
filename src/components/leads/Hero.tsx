import { Droplets, MapPin } from "lucide-react";

export function Hero({ totalSystems, hot, location }: { totalSystems: number; hot: number; location?: string }) {
  return (
    <header className="relative overflow-hidden rounded-3xl text-white shadow-[var(--shadow-elevated)]" style={{ background: "var(--gradient-hero)" }}>
      <div className="absolute inset-0 opacity-20" style={{
        backgroundImage:
          "radial-gradient(circle at 20% 10%, rgba(255,255,255,0.5) 0%, transparent 40%), radial-gradient(circle at 80% 80%, rgba(255,255,255,0.3) 0%, transparent 40%)",
      }} />
      <div className="relative px-6 py-10 sm:px-10 sm:py-14">
        <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.2em] text-white/80">
          <MapPin className="h-3.5 w-3.5" /> {location ?? "United States"} · Live EPA SDWIS
        </div>
        <h1 className="mt-3 max-w-3xl text-4xl font-bold leading-tight tracking-tight sm:text-5xl">
          <span className="inline-flex items-center gap-3">
            <Droplets className="h-9 w-9 text-white/90" />
            Water Quality Leads
          </span>
        </h1>
        <p className="mt-3 max-w-2xl text-base text-white/85 sm:text-lg">
          Public water systems flagged for active MCL violations, lead &amp; copper exceedances,
          and unresolved compliance issues — ranked for your filtration outreach.
        </p>
        <div className="mt-6 flex flex-wrap items-center gap-3">
          {totalSystems > 0 && (
            <div className="rounded-full bg-white/15 px-4 py-1.5 text-sm font-semibold backdrop-blur-sm">
              {totalSystems} active systems
            </div>
          )}
          {hot > 0 && (
            <div className="rounded-full bg-hot/90 px-4 py-1.5 text-sm font-bold text-hot-foreground shadow-[0_0_24px_color-mix(in_oklab,var(--hot)_50%,transparent)]">
              {hot} HOT leads
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

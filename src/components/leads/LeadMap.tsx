import { useEffect, useMemo, useRef, useState } from "react";
import type LType from "leaflet";
import type { Lead } from "@/lib/format";
import zipCentroids from "@/data/zip-centroids.json";
import { Flame, MapPin } from "lucide-react";

const ZIPS = zipCentroids as unknown as Record<string, [number, number]>;

const PRIORITY_COLOR: Record<string, string> = {
  HOT: "#ef4444",
  WARM: "#f59e0b",
  COOL: "#0ea5e9",
  COLD: "#64748b",
};

function jitter(seed: string) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  const a = ((h & 0xffff) / 0xffff - 0.5) * 0.018;
  const b = (((h >> 16) & 0xffff) / 0xffff - 0.5) * 0.018;
  return [a, b] as const;
}

function makeIcon(L: typeof LType, priority: string) {
  const color = PRIORITY_COLOR[priority] ?? "#64748b";
  const html = `
    <div style="position:relative;width:26px;height:34px;">
      <div style="position:absolute;inset:0;filter:drop-shadow(0 2px 4px rgba(0,0,0,.35));">
        <svg viewBox="0 0 26 34" width="26" height="34" xmlns="http://www.w3.org/2000/svg">
          <path d="M13 0C5.82 0 0 5.82 0 13c0 9.75 13 21 13 21s13-11.25 13-21C26 5.82 20.18 0 13 0z" fill="${color}"/>
          <circle cx="13" cy="13" r="5" fill="white"/>
        </svg>
      </div>
    </div>`;
  return L.divIcon({
    html,
    className: "lead-map-pin",
    iconSize: [26, 34],
    iconAnchor: [13, 34],
    popupAnchor: [0, -30],
  });
}

export function LeadMap({ leads, onSelect }: { leads: Lead[]; onSelect: (l: Lead) => void }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const LRef = useRef<typeof LType | null>(null);
  const mapRef = useRef<LType.Map | null>(null);
  const pinLayerRef = useRef<LType.LayerGroup | null>(null);
  const heatLayerRef = useRef<LType.Layer | null>(null);
  const [ready, setReady] = useState(false);
  const [showHeat, setShowHeat] = useState(false);
  const [showPins, setShowPins] = useState(true);

  const points = useMemo(() => {
    return leads
      .map((lead) => {
        const zip = (lead.Zip || "").split("-")[0];
        const c = ZIPS[zip];
        if (!c) return null;
        const [dx, dy] = jitter(lead.PWSID);
        return { lead, lat: c[0] + dx, lng: c[1] + dy };
      })
      .filter((p): p is { lead: Lead; lat: number; lng: number } => !!p);
  }, [leads]);

  // init map once (client only — Leaflet touches `window`)
  useEffect(() => {
    if (typeof window === "undefined") return;
    let cancelled = false;
    (async () => {
      const L = (await import("leaflet")).default;
      await import("leaflet/dist/leaflet.css");
      await import("leaflet.heat");
      if (cancelled || !containerRef.current || mapRef.current) return;
      const map = L.map(containerRef.current, {
        center: [26.7, -80.15],
        zoom: 10,
        scrollWheelZoom: true,
      });
      L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
        maxZoom: 19,
        attribution: "&copy; OpenStreetMap &copy; CARTO",
        subdomains: "abcd",
      }).addTo(map);
      pinLayerRef.current = L.layerGroup().addTo(map);
      LRef.current = L;
      mapRef.current = map;
      setReady(true);
    })();
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
      pinLayerRef.current = null;
      heatLayerRef.current = null;
    };
  }, []);

  // refresh pins when filtered leads change
  useEffect(() => {
    const L = LRef.current;
    const map = mapRef.current;
    const layer = pinLayerRef.current;
    if (!L || !map || !layer) return;
    layer.clearLayers();
    if (!showPins) return;
    const bounds: [number, number][] = [];
    points.forEach(({ lead, lat, lng }) => {
      const m = L.marker([lat, lng], { icon: makeIcon(L, lead.Priority) });
      m.bindTooltip(
        `<div style="font-family:inherit"><strong>${lead["System Name"]}</strong><br/><span style="opacity:.7">${lead.City} · ${lead.Priority} · Score ${lead["Lead Score"]}</span></div>`,
        { direction: "top", offset: [0, -28] },
      );
      m.on("click", () => onSelect(lead));
      m.addTo(layer);
      bounds.push([lat, lng]);
    });
    if (bounds.length > 1) {
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 12 });
    } else if (bounds.length === 1) {
      map.setView(bounds[0], 12);
    }
  }, [points, onSelect, showPins, ready]);

  // refresh heatmap when toggled or data changes
  useEffect(() => {
    const L = LRef.current as (typeof LType & { heatLayer?: (latlngs: [number, number, number][], opts?: object) => LType.Layer }) | null;
    const map = mapRef.current;
    if (!L || !map) return;
    if (heatLayerRef.current) {
      map.removeLayer(heatLayerRef.current);
      heatLayerRef.current = null;
    }
    if (!showHeat || !L.heatLayer) return;
    const heatPoints: [number, number, number][] = points
      .map(({ lead, lat, lng }) => {
        const u = lead["Unresolved Violations (5yr)"] || 0;
        if (u <= 0) return null;
        // weight: scale unresolved violations into [0.2, 1.0]
        const w = Math.min(1, 0.2 + u * 0.15);
        return [lat, lng, w] as [number, number, number];
      })
      .filter((p): p is [number, number, number] => !!p);
    if (heatPoints.length === 0) return;
    heatLayerRef.current = L.heatLayer(heatPoints, {
      radius: 38,
      blur: 28,
      maxZoom: 13,
      minOpacity: 0.35,
      gradient: {
        0.2: "#0ea5e9",
        0.45: "#22c55e",
        0.65: "#f59e0b",
        0.85: "#ef4444",
        1.0: "#7f1d1d",
      },
    }).addTo(map);
  }, [points, showHeat, ready]);

  const missing = leads.length - points.length;

  return (
    <div className="relative overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      <div ref={containerRef} className="h-[560px] w-full" style={{ background: "var(--muted)" }} />
      <div className="absolute left-3 top-3 z-[400] flex flex-col gap-2">
        <div className="inline-flex rounded-xl border border-border bg-background/90 p-1 shadow-sm backdrop-blur">
          <button
            onClick={() => setShowPins((v) => !v)}
            className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] font-semibold transition-colors ${
              showPins ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-secondary"
            }`}
          >
            <MapPin className="h-3 w-3" /> Pins
          </button>
          <button
            onClick={() => setShowHeat((v) => !v)}
            className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] font-semibold transition-colors ${
              showHeat ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-secondary"
            }`}
          >
            <Flame className="h-3 w-3" /> Heatmap
          </button>
        </div>
        {showPins && (
          <div className="pointer-events-none flex flex-wrap items-center gap-1.5 rounded-xl border border-border bg-background/90 px-2.5 py-1.5 text-[11px] font-semibold shadow-sm backdrop-blur">
        {(["HOT", "WARM", "COOL", "COLD"] as const).map((p) => (
          <span key={p} className="flex items-center gap-1 px-1">
            <span
              className="inline-block h-2.5 w-2.5 rounded-full"
              style={{ background: PRIORITY_COLOR[p] }}
            />
            {p}
          </span>
        ))}
      </div>
        )}
        {showHeat && (
          <div className="pointer-events-none rounded-xl border border-border bg-background/90 px-2.5 py-1.5 shadow-sm backdrop-blur">
            <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Unresolved violations
            </p>
            <div className="flex items-center gap-2">
              <div
                className="h-2 w-32 rounded-full"
                style={{
                  background:
                    "linear-gradient(90deg, #0ea5e9 0%, #22c55e 35%, #f59e0b 60%, #ef4444 85%, #7f1d1d 100%)",
                }}
              />
              <span className="text-[10px] text-muted-foreground">low → high</span>
            </div>
          </div>
        )}
      </div>
      {missing > 0 && (
        <div className="pointer-events-none absolute bottom-3 right-3 z-[400] rounded-lg border border-border bg-background/90 px-2 py-1 text-[10px] text-muted-foreground shadow-sm backdrop-blur">
          {missing} system{missing === 1 ? "" : "s"} without geocoded ZIP
        </div>
      )}
    </div>
  );
}
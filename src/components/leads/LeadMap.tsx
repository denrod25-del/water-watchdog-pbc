import { useEffect, useMemo, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { Lead } from "@/lib/format";
import zipCentroids from "@/data/zip-centroids.json";

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

function makeIcon(priority: string) {
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
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);

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

  // init map once
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, {
      center: [26.7, -80.15],
      zoom: 10,
      scrollWheelZoom: true,
    });
    L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap &copy; CARTO',
      subdomains: "abcd",
    }).addTo(map);
    layerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
      layerRef.current = null;
    };
  }, []);

  // refresh markers when filtered leads change
  useEffect(() => {
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!map || !layer) return;
    layer.clearLayers();
    const bounds: [number, number][] = [];
    points.forEach(({ lead, lat, lng }) => {
      const m = L.marker([lat, lng], { icon: makeIcon(lead.Priority) });
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
  }, [points, onSelect]);

  const missing = leads.length - points.length;

  return (
    <div className="relative overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      <div ref={containerRef} className="h-[560px] w-full" style={{ background: "var(--muted)" }} />
      <div className="pointer-events-none absolute left-3 top-3 z-[400] flex flex-wrap items-center gap-1.5 rounded-xl border border-border bg-background/90 px-2.5 py-1.5 text-[11px] font-semibold shadow-sm backdrop-blur">
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
      {missing > 0 && (
        <div className="pointer-events-none absolute bottom-3 right-3 z-[400] rounded-lg border border-border bg-background/90 px-2 py-1 text-[10px] text-muted-foreground shadow-sm backdrop-blur">
          {missing} system{missing === 1 ? "" : "s"} without geocoded ZIP
        </div>
      )}
    </div>
  );
}
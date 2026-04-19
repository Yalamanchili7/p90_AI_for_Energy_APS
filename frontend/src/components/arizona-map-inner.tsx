"use client";

// NOTE: This file must ONLY be imported via dynamic({ ssr: false }).
// It imports react-leaflet statically, which touches `window` at module load.

import { useEffect, useMemo } from "react";
import {
  MapContainer,
  TileLayer,
  Polyline,
  CircleMarker,
  Tooltip,
  useMap,
} from "react-leaflet";
import "leaflet/dist/leaflet.css";
import type { BusInfo, TopologyEdge, BusForecast } from "@/lib/api";
import type { LatLngBoundsLiteral } from "leaflet";

// Color ramp matching the graph version
function loadToColor(peak: number, maxPeak: number): string {
  if (peak <= 0) return "#F1F5F9";
  const t = Math.min(1, peak / Math.max(maxPeak, 1));
  if (t < 0.25) return "#FEF3C7";
  if (t < 0.5) return "#FCD34D";
  if (t < 0.75) return "#F97316";
  return "#DC2626";
}

// Internal hook component: fix container sizing + fit camera to buses
function MapBehavior({ bounds }: { bounds: LatLngBoundsLiteral | null }) {
  const map = useMap();

  useEffect(() => {
    // Multiple invalidateSize calls at different tick delays.
    // This covers the common failure modes where the container measures
    // differently at first paint vs after tabs/layout settle.
    const timers: NodeJS.Timeout[] = [];
    [0, 50, 200, 500].forEach((delay) => {
      timers.push(
        setTimeout(() => {
          map.invalidateSize();
          if (bounds) {
            try {
              map.fitBounds(bounds, { padding: [30, 30] });
            } catch {
              /* no-op */
            }
          }
        }, delay)
      );
    });
    return () => timers.forEach(clearTimeout);
  }, [map, bounds]);

  useEffect(() => {
    const handler = () => map.invalidateSize();
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, [map]);

  return null;
}

export function InnerMap({
  buses,
  edges,
  busForecasts,
  selectedBusName,
  onSelectBus,
}: {
  buses: BusInfo[];
  edges: TopologyEdge[];
  busForecasts?: BusForecast[];
  selectedBusName?: string | null;
  onSelectBus?: (name: string) => void;
}) {
  const { center, bounds, busesWithCoords, busByName, maxPeak, peakByName } =
    useMemo(() => {
      const withCoords = buses.filter(
        (b) =>
          b.lat !== null &&
          b.lat !== undefined &&
          b.lon !== null &&
          b.lon !== undefined
      );

      const lats = withCoords.map((b) => b.lat as number);
      const lons = withCoords.map((b) => b.lon as number);
      const cLat =
        lats.length > 0 ? (Math.min(...lats) + Math.max(...lats)) / 2 : 33.482;
      const cLon =
        lons.length > 0 ? (Math.min(...lons) + Math.max(...lons)) / 2 : -112.188;

      const bnds: LatLngBoundsLiteral | null =
        lats.length > 0
          ? [
              [Math.min(...lats), Math.min(...lons)],
              [Math.max(...lats), Math.max(...lons)],
            ]
          : null;

      const byName = new Map(buses.map((b) => [b.name, b] as const));
      const peakByName = new Map<string, number>();
      for (const f of busForecasts ?? []) {
        peakByName.set(f.bus_name, Math.max(...f.p50));
      }
      const maxPeak = Math.max(...Array.from(peakByName.values()), 1);

      return {
        center: [cLat, cLon] as [number, number],
        bounds: bnds,
        busesWithCoords: withCoords,
        busByName: byName,
        peakByName,
        maxPeak,
      };
    }, [buses, busForecasts]);

  const edgeLines = useMemo(() => {
    return edges
      .map((e) => {
        const a = busByName.get(e.bus1);
        const b = busByName.get(e.bus2);
        if (!a || !b) return null;
        if (a.lat == null || a.lon == null || b.lat == null || b.lon == null)
          return null;
        return {
          key: `${e.bus1}-${e.bus2}`,
          positions: [
            [a.lat, a.lon],
            [b.lat, b.lon],
          ] as [number, number][],
        };
      })
      .filter(Boolean) as Array<{ key: string; positions: [number, number][] }>;
  }, [edges, busByName]);

  if (busesWithCoords.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-ink-400">
        No geographic positions available.
      </div>
    );
  }

  return (
    <div className="relative h-full w-full overflow-hidden rounded-xl">
      <MapContainer
        center={center}
        zoom={12}
        scrollWheelZoom={true}
        style={{ height: "100%", width: "100%", background: "#E2E8F0" }}
      >
        <MapBehavior bounds={bounds} />

        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
          attribution='&copy; <a href="https://carto.com/">Carto</a> &copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
          subdomains={["a", "b", "c", "d"]}
        />

        {edgeLines.map((line) => (
          <Polyline
            key={line.key}
            positions={line.positions}
            pathOptions={{ color: "#64748B", weight: 2, opacity: 0.7 }}
          />
        ))}

        {busesWithCoords.map((bus) => {
          const peak = peakByName.get(bus.name) ?? 0;
          const color = loadToColor(peak, maxPeak);
          const isSelected = selectedBusName === bus.name;
          const hasPeak = peak > 0;
          const radius = isSelected
            ? 14
            : hasPeak
            ? 8 + Math.min(8, Math.sqrt(peak) / 3)
            : 6;

          return (
            <CircleMarker
              key={bus.name}
              center={[bus.lat as number, bus.lon as number]}
              radius={radius}
              pathOptions={{
                fillColor: color,
                fillOpacity: hasPeak ? 0.92 : 0.5,
                color: isSelected ? "#2563EB" : "#1E293B",
                weight: isSelected ? 3 : 1.2,
                opacity: 1,
              }}
              eventHandlers={{
                click: () => onSelectBus?.(bus.name),
              }}
            >
              <Tooltip
                direction="top"
                offset={[0, -6]}
                opacity={1}
                className="!bg-white !border !border-ink-200 !text-ink !shadow-elevated"
              >
                <div className="text-xs">
                  <div className="font-semibold text-ink">Bus {bus.name}</div>
                  {hasPeak ? (
                    <>
                      <div className="tabular-nums">
                        Peak: {peak.toFixed(0)} kW
                      </div>
                      <div className="text-ink-500">
                        Base {bus.base_kw.toFixed(0)} kW · Res{" "}
                        {Math.round(bus.frac_res * 100)}%
                      </div>
                    </>
                  ) : (
                    <div className="text-ink-500">Non-load-bearing</div>
                  )}
                </div>
              </Tooltip>
            </CircleMarker>
          );
        })}
      </MapContainer>

      <div className="pointer-events-none absolute bottom-2 right-2 rounded bg-white/90 px-2 py-1 text-[10px] text-ink-500 shadow-sm">
        Synthetic positions · West Phoenix service area
      </div>

      <div className="pointer-events-none absolute left-2 top-2 rounded-lg bg-white/95 p-2 shadow-card">
        <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-ink-500">
          Peak load (kW)
        </div>
        <div className="flex items-center gap-1">
          <div
            className="h-2 w-6 rounded-l"
            style={{ background: "#FEF3C7" }}
          />
          <div className="h-2 w-6" style={{ background: "#FCD34D" }} />
          <div className="h-2 w-6" style={{ background: "#F97316" }} />
          <div
            className="h-2 w-6 rounded-r"
            style={{ background: "#DC2626" }}
          />
        </div>
        <div className="mt-1 flex justify-between text-[10px] text-ink-500">
          <span>0</span>
          <span>{maxPeak.toFixed(0)}</span>
        </div>
      </div>
    </div>
  );
}
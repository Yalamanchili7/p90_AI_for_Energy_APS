"use client";

import { useMemo } from "react";
import { PlotlyChart } from "./plotly-chart";
import type { BusInfo, TopologyEdge, BusForecast } from "@/lib/api";
import type { Data, Layout } from "plotly.js";

// Simple spring layout — deterministic positions for the 37 buses.
// We compute once client-side using a basic force layout simulation.
function computeBusPositions(
  buses: BusInfo[],
  edges: TopologyEdge[]
): Map<string, [number, number]> {
  const names = buses.map((b) => b.name);
  const n = names.length;
  const idx = new Map(names.map((n, i) => [n, i] as const));

  // Initialize in a circle
  const pos: [number, number][] = names.map((_, i) => {
    const ang = (2 * Math.PI * i) / n;
    return [Math.cos(ang), Math.sin(ang)];
  });

  // Adjacency
  const adj: number[][] = Array.from({ length: n }, () => []);
  for (const e of edges) {
    const a = idx.get(e.bus1);
    const b = idx.get(e.bus2);
    if (a !== undefined && b !== undefined) {
      adj[a].push(b);
      adj[b].push(a);
    }
  }

  // Fruchterman-Reingold-ish iterations
  const k = 1.2 / Math.sqrt(n);
  const iterations = 200;
  let temperature = 0.1;

  for (let iter = 0; iter < iterations; iter++) {
    const disp: [number, number][] = names.map(() => [0, 0]);

    // Repulsive forces between all pairs
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const dx = pos[i][0] - pos[j][0];
        const dy = pos[i][1] - pos[j][1];
        const dist = Math.sqrt(dx * dx + dy * dy) + 0.001;
        const force = (k * k) / dist;
        disp[i][0] += (dx / dist) * force;
        disp[i][1] += (dy / dist) * force;
        disp[j][0] -= (dx / dist) * force;
        disp[j][1] -= (dy / dist) * force;
      }
    }

    // Attractive forces along edges
    for (let i = 0; i < n; i++) {
      for (const j of adj[i]) {
        if (j > i) {
          const dx = pos[i][0] - pos[j][0];
          const dy = pos[i][1] - pos[j][1];
          const dist = Math.sqrt(dx * dx + dy * dy) + 0.001;
          const force = (dist * dist) / k;
          disp[i][0] -= (dx / dist) * force;
          disp[i][1] -= (dy / dist) * force;
          disp[j][0] += (dx / dist) * force;
          disp[j][1] += (dy / dist) * force;
        }
      }
    }

    // Limit displacement by temperature
    for (let i = 0; i < n; i++) {
      const d = Math.sqrt(disp[i][0] ** 2 + disp[i][1] ** 2) + 0.001;
      const capped = Math.min(d, temperature);
      pos[i][0] += (disp[i][0] / d) * capped;
      pos[i][1] += (disp[i][1] / d) * capped;
    }

    temperature *= 0.97;
  }

  return new Map(names.map((n, i) => [n, pos[i]]));
}

export function FeederMap({
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
  // Stable positions — computed once per bus/edge set
  const positions = useMemo(
    () => computeBusPositions(buses, edges),
    [buses, edges]
  );

  // Peak load per bus (from forecasts). Non-load-bearing buses get 0.
  const peakByBus = useMemo(() => {
    const m = new Map<string, number>();
    for (const f of busForecasts ?? []) {
      m.set(f.bus_name, Math.max(...f.p50));
    }
    return m;
  }, [busForecasts]);

  const { traces, layout } = useMemo<{ traces: Data[]; layout: Partial<Layout> }>(() => {
    // Edge trace
    const edgeX: (number | null)[] = [];
    const edgeY: (number | null)[] = [];
    for (const e of edges) {
      const a = positions.get(e.bus1);
      const b = positions.get(e.bus2);
      if (a && b) {
        edgeX.push(a[0], b[0], null);
        edgeY.push(a[1], b[1], null);
      }
    }

    // Node trace
    const nodeX: number[] = [];
    const nodeY: number[] = [];
    const nodeColors: number[] = [];
    const nodeText: string[] = [];
    const nodeLabels: string[] = [];
    const nodeSizes: number[] = [];
    const nodeOutlineColors: string[] = [];
    const nodeOutlineWidths: number[] = [];

    for (const bus of buses) {
      const p = positions.get(bus.name);
      if (!p) continue;
      const peak = peakByBus.get(bus.name) ?? 0;
      const hasPeak = peak > 0;

      nodeX.push(p[0]);
      nodeY.push(p[1]);
      nodeColors.push(peak);
      nodeLabels.push(bus.name);

      const hoverBody = hasPeak
        ? `<b>Bus ${bus.name}</b><br>Peak load: ${peak.toFixed(0)} kW<br>Base: ${bus.base_kw.toFixed(0)} kW<br>Residential: ${(bus.frac_res * 100).toFixed(0)}%`
        : `<b>Bus ${bus.name}</b><br><i>Non-load-bearing</i>`;
      nodeText.push(hoverBody);

      // Size: larger for load-bearing buses, scales with peak
      const base = 12;
      const scale = hasPeak ? Math.min(18, Math.sqrt(peak) / 2) : 0;
      nodeSizes.push(base + scale);

      // Outline: selected bus gets brand color
      if (selectedBusName === bus.name) {
        nodeOutlineColors.push("#2563EB");
        nodeOutlineWidths.push(3);
      } else {
        nodeOutlineColors.push("#334155");
        nodeOutlineWidths.push(1);
      }
    }

    const traces: Data[] = [
      {
        type: "scatter",
        mode: "lines",
        x: edgeX,
        y: edgeY,
        line: { color: "#CBD5E1", width: 1.5 },
        hoverinfo: "none",
        showlegend: false,
      },
      {
        type: "scatter",
        mode: "markers+text",
        x: nodeX,
        y: nodeY,
        text: nodeLabels,
        textposition: "top center",
        textfont: { size: 8, color: "#475569" },
        marker: {
          size: nodeSizes,
          color: nodeColors,
          colorscale: [
            [0, "#F1F5F9"],
            [0.25, "#FEF3C7"],
            [0.5, "#FCD34D"],
            [0.75, "#F97316"],
            [1, "#DC2626"],
          ],
          showscale: true,
          colorbar: {
            title: { text: "Peak kW", font: { size: 11 } },
            thickness: 10,
            len: 0.6,
            x: 1.02,
          },
          line: {
            color: nodeOutlineColors,
            width: nodeOutlineWidths,
          },
        },
        hovertext: nodeText,
        hoverinfo: "text",
        showlegend: false,
        customdata: nodeLabels as unknown as Data["customdata"],
      },
    ];

    const layout: Partial<Layout> = {
      autosize: true,
      margin: { l: 0, r: 40, t: 10, b: 10 },
      xaxis: {
        showgrid: false,
        zeroline: false,
        showticklabels: false,
        fixedrange: true,
      },
      yaxis: {
        showgrid: false,
        zeroline: false,
        showticklabels: false,
        scaleanchor: "x",
        scaleratio: 1,
        fixedrange: true,
      },
      plot_bgcolor: "white",
      paper_bgcolor: "white",
      hovermode: "closest",
      dragmode: false,
    };

    return { traces, layout };
  }, [buses, edges, positions, peakByBus, selectedBusName]);

  return (
    <div className="h-full w-full">
      <PlotlyChart
        data={traces}
        layout={layout}
        useResizeHandler
        style={{ width: "100%", height: "100%" }}
        config={{ displayModeBar: false, responsive: true }}
        onClick={(evt) => {
          const pt = evt.points?.[0];
          if (pt && pt.customdata && onSelectBus) {
            onSelectBus(String(pt.customdata));
          }
        }}
      />
    </div>
  );
}

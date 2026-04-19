"use client";

import { useMemo } from "react";
import { PlotlyChart } from "./plotly-chart";
import type { BusForecast } from "@/lib/api";
import type { Data, Layout } from "plotly.js";

export function BusForecastChart({
  forecast,
  baseline,
  height = 320,
}: {
  forecast: BusForecast;
  baseline?: BusForecast;
  height?: number;
}) {
  const { traces, layout } = useMemo<{ traces: Data[]; layout: Partial<Layout> }>(() => {
    const hours = forecast.p50.map((_, i) => i);

    const traces: Data[] = [
      // P90 upper (invisible, for fill)
      {
        type: "scatter",
        mode: "lines",
        x: hours,
        y: forecast.p90,
        line: { width: 0 },
        showlegend: false,
        hoverinfo: "skip",
      },
      // P10 lower + fill to P90
      {
        type: "scatter",
        mode: "lines",
        x: hours,
        y: forecast.p10,
        line: { width: 0 },
        fill: "tonexty",
        fillcolor: "rgba(37, 99, 235, 0.12)",
        name: "P10–P90",
        hoverinfo: "skip",
      },
      // P50 (stressed or only)
      {
        type: "scatter",
        mode: "lines",
        x: hours,
        y: forecast.p50,
        line: { color: "#2563EB", width: 3 },
        name: baseline ? "Stressed P50" : "P50 forecast",
        hovertemplate: "Hour +%{x}<br>%{y:.1f} kW<extra></extra>",
      },
    ];

    if (baseline) {
      traces.push({
        type: "scatter",
        mode: "lines",
        x: hours,
        y: baseline.p50,
        line: { color: "#94A3B8", width: 2, dash: "dash" },
        name: "Baseline P50",
        hovertemplate: "Hour +%{x}<br>Baseline: %{y:.1f} kW<extra></extra>",
      });
    }

    const layout: Partial<Layout> = {
      autosize: true,
      margin: { l: 50, r: 20, t: 10, b: 40 },
      xaxis: {
        title: { text: "Hour ahead", font: { size: 11, color: "#64748B" } },
        gridcolor: "#F1F5F9",
        zeroline: false,
        tickfont: { size: 10, color: "#64748B" },
      },
      yaxis: {
        title: { text: "Load (kW)", font: { size: 11, color: "#64748B" } },
        gridcolor: "#F1F5F9",
        zeroline: false,
        tickfont: { size: 10, color: "#64748B" },
      },
      plot_bgcolor: "white",
      paper_bgcolor: "white",
      hovermode: "x unified",
      legend: {
        orientation: "h",
        x: 0,
        y: 1.08,
        xanchor: "left",
        font: { size: 10 },
      },
      showlegend: true,
    };

    return { traces, layout };
  }, [forecast, baseline]);

  return (
    <div style={{ height }}>
      <PlotlyChart
        data={traces}
        layout={layout}
        useResizeHandler
        style={{ width: "100%", height: "100%" }}
        config={{ displayModeBar: false, responsive: true }}
      />
    </div>
  );
}

// ─── Total feeder load comparison chart ──────────────────────
export function TotalLoadChart({
  baselineTotal,
  stressedTotal,
  height = 260,
}: {
  baselineTotal: number[];
  stressedTotal?: number[];
  height?: number;
}) {
  const { traces, layout } = useMemo<{ traces: Data[]; layout: Partial<Layout> }>(() => {
    const hours = baselineTotal.map((_, i) => i);
    const traces: Data[] = [
      {
        type: "scatter",
        mode: "lines",
        x: hours,
        y: baselineTotal,
        line: { color: "#94A3B8", width: 2.5 },
        name: "Baseline",
        hovertemplate: "Hour +%{x}<br>%{y:.0f} kW<extra>Baseline</extra>",
      },
    ];
    if (stressedTotal) {
      traces.push({
        type: "scatter",
        mode: "lines",
        x: hours,
        y: stressedTotal,
        line: { color: "#DC2626", width: 3 },
        name: "Stressed",
        hovertemplate: "Hour +%{x}<br>%{y:.0f} kW<extra>Stressed</extra>",
      });
    }

    const layout: Partial<Layout> = {
      autosize: true,
      margin: { l: 55, r: 20, t: 10, b: 40 },
      xaxis: {
        title: { text: "Hour ahead", font: { size: 11, color: "#64748B" } },
        gridcolor: "#F1F5F9",
        zeroline: false,
        tickfont: { size: 10, color: "#64748B" },
      },
      yaxis: {
        title: { text: "Total feeder load (kW)", font: { size: 11, color: "#64748B" } },
        gridcolor: "#F1F5F9",
        zeroline: false,
        tickfont: { size: 10, color: "#64748B" },
      },
      plot_bgcolor: "white",
      paper_bgcolor: "white",
      hovermode: "x unified",
      legend: {
        orientation: "h",
        x: 0,
        y: 1.08,
        xanchor: "left",
        font: { size: 10 },
      },
    };

    return { traces, layout };
  }, [baselineTotal, stressedTotal]);

  return (
    <div style={{ height }}>
      <PlotlyChart
        data={traces}
        layout={layout}
        useResizeHandler
        style={{ width: "100%", height: "100%" }}
        config={{ displayModeBar: false, responsive: true }}
      />
    </div>
  );
}

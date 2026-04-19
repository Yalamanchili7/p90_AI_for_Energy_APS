"use client";

import dynamic from "next/dynamic";
import type { PlotParams } from "react-plotly.js";

const Plot = dynamic(() => import("react-plotly.js"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center text-sm text-ink-400">
      Loading chart…
    </div>
  ),
});

export function PlotlyChart(props: PlotParams) {
  return <Plot {...props} />;
}

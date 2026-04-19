"use client";

import dynamic from "next/dynamic";
import type { BusInfo, TopologyEdge, BusForecast } from "@/lib/api";

// Load the whole inner map component dynamically (SSR off).
// This wrapper is the only thing imported by the dashboard.
const InnerMap = dynamic(
  () => import("./arizona-map-inner").then((m) => m.InnerMap),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full w-full items-center justify-center text-sm text-ink-400">
        Loading map…
      </div>
    ),
  }
);

export function ArizonaMap(props: {
  buses: BusInfo[];
  edges: TopologyEdge[];
  busForecasts?: BusForecast[];
  selectedBusName?: string | null;
  onSelectBus?: (name: string) => void;
}) {
  return <InnerMap {...props} />;
}
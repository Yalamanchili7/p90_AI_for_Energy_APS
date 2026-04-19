"use client";

import { useMemo, useState, useEffect } from "react";
import {
  useTopology,
  useSamples,
  useForecast,
  useBaselineForecast,
} from "@/lib/hooks";
import { api } from "@/lib/api";
import { formatKw, formatPct } from "@/lib/utils";
import {
  Card,
  CardHeader,
  CardTitle,
  CardBody,
  MetricCard,
  Badge,
} from "@/components/ui";
import { Slider } from "@/components/slider";
import { FeederMap } from "@/components/feeder-map";
import { ArizonaMap } from "@/components/arizona-map";
import { BusForecastChart, TotalLoadChart } from "@/components/charts";
import {
  InterventionTable,
  computeInterventions,
} from "@/components/interventions";
import { SampleTimeline } from "@/components/sample-timeline";
import {
  Thermometer,
  Car,
  RefreshCw,
  Map as MapIcon,
  Network,
  Info,
  CheckCircle2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { BusForecast } from "@/lib/api";

export default function DashboardPage() {
  // ─── State ────────────────────────────────────────────────
  const [tempDelta, setTempDelta] = useState(0);
  const [evGrowth, setEvGrowth] = useState(0);
  const [selectedBusName, setSelectedBusName] = useState<string | null>(null);
  const [sampleIdx, setSampleIdx] = useState<number | null>(null);
  const [mapView, setMapView] = useState<"geo" | "graph">("geo");
  const [modelMetrics, setModelMetrics] = useState<{
    overall_mape: number;
    overall_coverage: number;
    hot_mape: number;
  } | null>(null);

  // ─── Data ────────────────────────────────────────────────
  const topology = useTopology();
  const samples = useSamples(50);

  const effectiveSampleIdx = useMemo(() => {
    if (sampleIdx !== null) return sampleIdx;
    return samples.data?.[0]?.sample_idx ?? null;
  }, [sampleIdx, samples.data]);

  const baseline = useBaselineForecast(effectiveSampleIdx);
  const stressed = useForecast(
    effectiveSampleIdx !== null && (tempDelta !== 0 || evGrowth !== 0)
      ? {
          sample_idx: effectiveSampleIdx,
          temp_delta_f: tempDelta,
          ev_growth_pct: evGrowth,
        }
      : null
  );

  const displayForecast = stressed.data ?? baseline.data;
  const isStressed = tempDelta !== 0 || evGrowth !== 0;

  // Load model evaluation metrics once
  useEffect(() => {
    api
      .metrics()
      .then((m) => {
        const overall = (m as any)?.overall;
        const stress = (m as any)?.stress_stratified;
        if (overall) {
          setModelMetrics({
            overall_mape: overall.p50_mape_pct ?? 0,
            overall_coverage: overall.p80_coverage ?? 0,
            hot_mape: stress?.hot_hours?.p50_mape_pct ?? 0,
          });
        }
      })
      .catch(() => {
        /* silently ignore — fallback to hard-coded numbers */
      });
  }, []);

  // Default-select the biggest bus once data loads
  useEffect(() => {
    if (!selectedBusName && displayForecast) {
      const biggest = [...displayForecast.buses].sort(
        (a, b) => b.base_kw - a.base_kw
      )[0];
      if (biggest) setSelectedBusName(biggest.bus_name);
    }
  }, [displayForecast, selectedBusName]);

  // Derived metrics
  const baselinePeak = baseline.data?.total_peak_kw ?? 0;
  const stressedPeak = displayForecast?.total_peak_kw ?? baselinePeak;
  const deltaKw = stressedPeak - baselinePeak;
  const deltaPct = baselinePeak > 0 ? (deltaKw / baselinePeak) * 100 : 0;

  const peakHour =
    displayForecast?.total_peak_hour ?? baseline.data?.total_peak_hour ?? 0;

  // Interventions
  const interventions = useMemo(() => {
    if (!baseline.data || !stressed.data) return [];
    return computeInterventions(baseline.data.buses, stressed.data.buses);
  }, [baseline.data, stressed.data]);

  // Selected bus forecasts
  const selectedBusStressed = useMemo(() => {
    if (!displayForecast || !selectedBusName) return null;
    return (
      displayForecast.buses.find((b) => b.bus_name === selectedBusName) ?? null
    );
  }, [displayForecast, selectedBusName]);

  const selectedBusBaseline = useMemo(() => {
    if (!baseline.data || !selectedBusName || !isStressed) return null;
    return (
      baseline.data.buses.find((b) => b.bus_name === selectedBusName) ?? null
    );
  }, [baseline.data, selectedBusName, isStressed]);

  const loading = topology.loading || samples.loading || baseline.loading;
  const error = topology.error ?? samples.error ?? baseline.error;

  // ─── Render ──────────────────────────────────────────────
  return (
    <div className="mx-auto max-w-[1440px] px-6 py-6">
      {/* ═══ HEADER ROW ═══ */}
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink">
            Operator dashboard
          </h1>
          <p className="mt-1 text-sm text-ink-600">
            IEEE 34-bus Arizona feeder · 24-hour probabilistic forecast
          </p>
        </div>
        {baseline.data && (
          <div className="text-right text-xs text-ink-500">
            <div>Forecast start</div>
            <div className="mt-0.5 tabular-nums text-sm font-semibold text-ink">
              {new Date(baseline.data.forecast_start).toLocaleString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </div>
            <div className="mt-0.5">
              Baseline: {baseline.data.baseline_temp_f.toFixed(0)}°F
              {isStressed && (
                <span className="ml-1 font-semibold text-accent-heat">
                  → {(baseline.data.baseline_temp_f + tempDelta).toFixed(0)}°F
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          Error loading data: {error.message}. Is the backend running on{" "}
          <code>localhost:8001</code>?
        </div>
      )}

      {loading && !baseline.data && (
        <div className="flex items-center gap-2 text-sm text-ink-500">
          <RefreshCw className="h-4 w-4 animate-spin" />
          Loading forecast…
        </div>
      )}

      {baseline.data && (
        <>
          {/* ═══ METRIC STRIP ═══ */}
          <div className="mb-4 grid grid-cols-1 gap-3 lg:grid-cols-12">
            {/* Peak load comparison — prominent card with baseline vs stressed side by side */}
            <Card className="lg:col-span-6 p-5">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-500">
                Feeder peak load · 24h forecast
              </div>
              <div className="mt-3 flex items-end gap-6">
                <div className="flex-1">
                  <div className="text-[11px] font-medium uppercase tracking-wider text-ink-400">
                    Baseline
                  </div>
                  <div className="mt-1 flex items-baseline gap-1.5">
                    <span className="text-3xl font-semibold tabular-nums text-ink-700">
                      {formatKw(baselinePeak)}
                    </span>
                    <span className="text-sm text-ink-500">kW</span>
                  </div>
                  <div className="mt-1 text-xs text-ink-500">
                    On {baseline.data.baseline_temp_f.toFixed(0)}°F day
                  </div>
                </div>

                <div className="text-2xl text-ink-300">→</div>

                <div className="flex-1">
                  <div
                    className={cn(
                      "text-[11px] font-medium uppercase tracking-wider",
                      isStressed ? "text-accent-danger" : "text-ink-400"
                    )}
                  >
                    {isStressed ? "Stressed" : "No scenario"}
                  </div>
                  <div className="mt-1 flex items-baseline gap-1.5">
                    <span
                      className={cn(
                        "text-3xl font-semibold tabular-nums",
                        deltaPct > 10
                          ? "text-accent-danger"
                          : deltaPct > 5
                          ? "text-accent-warn"
                          : "text-ink"
                      )}
                    >
                      {formatKw(stressedPeak)}
                    </span>
                    <span className="text-sm text-ink-500">kW</span>
                  </div>
                  <div className="mt-1 text-xs">
                    {isStressed ? (
                      <span
                        className={cn(
                          "font-medium",
                          deltaKw > 0
                            ? "text-accent-danger"
                            : deltaKw < 0
                            ? "text-accent-ok"
                            : "text-ink-500"
                        )}
                      >
                        {deltaKw > 0 ? "↑" : deltaKw < 0 ? "↓" : "→"}{" "}
                        {formatPct(deltaPct, 1)} ({deltaKw > 0 ? "+" : ""}
                        {formatKw(deltaKw)} kW)
                      </span>
                    ) : (
                      <span className="text-ink-500">
                        Move sliders to stress test
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </Card>

            <MetricCard
              label="Peak hour"
              value={`+${peakHour}`}
              unit="h ahead"
              caption={
                baseline.data
                  ? `~${new Date(
                      new Date(baseline.data.forecast_start).getTime() +
                        peakHour * 3600 * 1000
                    ).toLocaleTimeString("en-US", {
                      hour: "numeric",
                    })}`
                  : ""
              }
            />

            <MetricCard
              label="Buses at risk"
              value={stressed.data?.n_stressed_buses ?? 0}
              caption={
                isStressed
                  ? "> 5% peak uplift"
                  : "Adjust sliders to stress test"
              }
              tone={
                (stressed.data?.n_stressed_buses ?? 0) > 5 ? "warn" : "default"
              }
            />

            <div className="lg:col-span-3">
              <Card className="p-5 h-full">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-500">
                  Model performance
                </div>
                <div className="mt-3 space-y-1.5 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-ink-500">P50 MAPE</span>
                    <span className="tabular-nums font-semibold text-ink">
                      {modelMetrics?.overall_mape?.toFixed(2) ?? "4.61"}%
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-ink-500">Hot-hour MAPE</span>
                    <span className="tabular-nums font-semibold text-ink">
                      {modelMetrics?.hot_mape?.toFixed(2) ?? "4.71"}%
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-ink-500">P80 coverage</span>
                    <span className="tabular-nums font-semibold text-ink">
                      {((modelMetrics?.overall_coverage ?? 0.804) * 100).toFixed(
                        1
                      )}
                      %
                    </span>
                  </div>
                </div>
                <div className="mt-2 border-t border-ink-100 pt-2 text-[10px] text-ink-400">
                  Held-out test data · 1,081 samples
                </div>
              </Card>
            </div>
          </div>

          {/* ═══ TIMELINE (at top for easy access) ═══ */}
          <Card className="mb-4">
            <CardBody className="py-3">
              {samples.data && (
                <SampleTimeline
                  samples={samples.data}
                  value={effectiveSampleIdx}
                  onChange={setSampleIdx}
                />
              )}
            </CardBody>
          </Card>

          {/* ═══ MAIN 3-COLUMN LAYOUT ═══ */}
          <div className="grid gap-4 lg:grid-cols-12">
            {/* ─── Controls column ─── */}
            <div className="lg:col-span-3">
              <Card>
                <CardHeader>
                  <CardTitle>Scenario controls</CardTitle>
                </CardHeader>
                <CardBody className="space-y-5">
                  <div>
                    <div className="mb-1.5 flex items-center gap-2 text-xs font-medium text-ink-500">
                      <Thermometer className="h-3.5 w-3.5" />
                      HEAT STRESS
                    </div>
                    <Slider
                      label="Temperature"
                      value={tempDelta}
                      onChange={setTempDelta}
                      min={-5}
                      max={25}
                      unit="°F"
                      description="Shift all temperatures. CDH + heatwave counter auto-recomputed."
                    />
                  </div>

                  <div>
                    <div className="mb-1.5 flex items-center gap-2 text-xs font-medium text-ink-500">
                      <Car className="h-3.5 w-3.5" />
                      EV GROWTH
                    </div>
                    <Slider
                      label="Evening load boost"
                      value={evGrowth}
                      onChange={setEvGrowth}
                      min={0}
                      max={100}
                      step={5}
                      unit="%"
                      description="Boost 6–9 PM load on residential-heavy buses."
                    />
                  </div>

                  {isStressed && (
                    <button
                      onClick={() => {
                        setTempDelta(0);
                        setEvGrowth(0);
                      }}
                      className="w-full rounded-lg border border-ink-200 bg-white px-3 py-2 text-xs font-medium text-ink-700 transition hover:bg-ink-50"
                    >
                      Reset scenario
                    </button>
                  )}

                  {(stressed.loading || baseline.loading) && (
                    <div className="flex items-center gap-2 text-xs text-ink-500">
                      <RefreshCw className="h-3 w-3 animate-spin" />
                      Running inference…
                    </div>
                  )}
                </CardBody>
              </Card>
            </div>

            {/* ─── Map column ─── */}
            <div className="lg:col-span-6">
              <Card className="h-full">
                <CardHeader className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <CardTitle>Feeder map</CardTitle>
                    <span className="text-xs text-ink-500">
                      {mapView === "geo"
                        ? "West Phoenix · synthetic positions"
                        : "Electrical topology"}
                    </span>
                    {isStressed && (
                      <Badge tone="danger">SCENARIO ACTIVE</Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-ink-500">Click a bus</span>
                    <div className="flex rounded-md border border-ink-200 bg-ink-50 p-0.5">
                      <button
                        type="button"
                        onClick={() => setMapView("geo")}
                        className={cn(
                          "flex items-center gap-1 rounded px-2 py-1 text-xs font-medium transition",
                          mapView === "geo"
                            ? "bg-white text-ink shadow-sm"
                            : "text-ink-500 hover:text-ink"
                        )}
                      >
                        <MapIcon className="h-3 w-3" /> Map
                      </button>
                      <button
                        type="button"
                        onClick={() => setMapView("graph")}
                        className={cn(
                          "flex items-center gap-1 rounded px-2 py-1 text-xs font-medium transition",
                          mapView === "graph"
                            ? "bg-white text-ink shadow-sm"
                            : "text-ink-500 hover:text-ink"
                        )}
                      >
                        <Network className="h-3 w-3" /> Graph
                      </button>
                    </div>
                  </div>
                </CardHeader>
                <CardBody className="p-2">
                  <div style={{ height: 520 }}>
                    {topology.data && displayForecast && (
                      mapView === "geo" ? (
                        <ArizonaMap
                          buses={topology.data.buses}
                          edges={topology.data.edges}
                          busForecasts={displayForecast.buses}
                          selectedBusName={selectedBusName}
                          onSelectBus={setSelectedBusName}
                        />
                      ) : (
                        <FeederMap
                          buses={topology.data.buses}
                          edges={topology.data.edges}
                          busForecasts={displayForecast.buses}
                          selectedBusName={selectedBusName}
                          onSelectBus={setSelectedBusName}
                        />
                      )
                    )}
                  </div>
                </CardBody>
              </Card>
            </div>

            {/* ─── Drill-down column ─── */}
            <div className="lg:col-span-3">
              <Card className="h-full">
                <CardHeader>
                  <CardTitle>Bus drill-down</CardTitle>
                </CardHeader>
                <CardBody>
                  {selectedBusName && displayForecast ? (
                    <BusDrillDown
                      name={selectedBusName}
                      stressed={selectedBusStressed}
                      baseline={selectedBusBaseline}
                    />
                  ) : (
                    <div className="py-8 text-center text-sm text-ink-500">
                      Click a bus on the map to see its 24h forecast
                    </div>
                  )}
                </CardBody>
              </Card>
            </div>
          </div>

          {/* ═══ BOTTOM ROW: TOTAL LOAD + INTERVENTIONS ═══ */}
          <div className="mt-4 grid gap-4 lg:grid-cols-5">
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>Total feeder load</CardTitle>
              </CardHeader>
              <CardBody>
                {baseline.data && (
                  <TotalLoadChart
                    baselineTotal={baseline.data.total_load_p50_kw}
                    stressedTotal={
                      isStressed ? stressed.data?.total_load_p50_kw : undefined
                    }
                    height={220}
                  />
                )}
              </CardBody>
            </Card>

            <Card className="lg:col-span-3">
              <CardHeader className="flex items-center justify-between">
                <CardTitle>Recommended interventions</CardTitle>
                {isStressed && interventions.length > 0 && (
                  <Badge tone="danger">{interventions.length} actions</Badge>
                )}
              </CardHeader>
              <CardBody>
                {isStressed ? (
                  <InterventionTable
                    interventions={interventions}
                    onSelectBus={setSelectedBusName}
                  />
                ) : (
                  <div className="flex items-center gap-3 rounded-lg bg-ink-50 p-4 text-sm text-ink-600">
                    <Info className="h-4 w-4 shrink-0 text-ink-400" />
                    <span>
                      Move the scenario sliders or pick a heatwave day to see
                      recommended utility interventions.
                    </span>
                  </div>
                )}
              </CardBody>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}

function BusDrillDown({
  name,
  stressed,
  baseline,
}: {
  name: string;
  stressed: BusForecast | null;
  baseline: BusForecast | null;
}) {
  if (!stressed) {
    return (
      <div className="text-sm text-ink-500">
        Bus {name} has no forecast (non-load-bearing or outside sample window).
      </div>
    );
  }

  const peak = Math.max(...stressed.p50);
  const basePeak = baseline ? Math.max(...baseline.p50) : peak;
  const delta = peak - basePeak;
  const deltaPct = basePeak > 0 ? (delta / basePeak) * 100 : 0;

  return (
    <div>
      <div className="flex items-baseline gap-2">
        <span className="text-xl font-semibold text-ink">Bus {name}</span>
        <span className="text-xs text-ink-500">
          base {stressed.base_kw.toFixed(0)} kW
        </span>
      </div>
      <div className="mt-1 text-xs text-ink-500">
        Residential {Math.round(stressed.frac_res * 100)}% · Commercial{" "}
        {Math.round(stressed.frac_com * 100)}%
      </div>

      <div className="mt-3 rounded-lg bg-ink-50 p-3">
        <div className="text-[11px] font-medium uppercase tracking-wider text-ink-500">
          24h peak
        </div>
        <div className="mt-1 flex items-baseline gap-1.5">
          <span className="text-2xl font-semibold tabular-nums text-ink">
            {peak.toFixed(0)}
          </span>
          <span className="text-sm text-ink-500">kW</span>
          {baseline && delta !== 0 && (
            <span
              className={cn(
                "ml-1 text-xs font-medium",
                delta > 0 ? "text-accent-danger" : "text-accent-ok"
              )}
            >
              {delta > 0 ? "↑" : "↓"}
              {Math.abs(deltaPct).toFixed(1)}%
            </span>
          )}
        </div>
      </div>

      <div className="mt-3">
        <BusForecastChart
          forecast={stressed}
          baseline={baseline ?? undefined}
          height={220}
        />
      </div>
    </div>
  );
}
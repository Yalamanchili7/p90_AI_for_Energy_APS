"use client";

import type { BusForecast } from "@/lib/api";
import { Badge } from "./ui";
import { AlertTriangle, Zap } from "lucide-react";

interface InterventionRow {
  bus_name: string;
  severity: "high" | "medium" | "low";
  peak_baseline_kw: number;
  peak_stressed_kw: number;
  uplift_pct: number;
  uplift_kw: number;
  frac_res: number;
  intervention: string;
  reason: string;
}

export function computeInterventions(
  baseline: BusForecast[],
  stressed: BusForecast[],
  topN = 5
): InterventionRow[] {
  const baseByName = new Map(baseline.map((b) => [b.bus_name, b]));
  const rows: InterventionRow[] = [];

  for (const s of stressed) {
    const b = baseByName.get(s.bus_name);
    if (!b) continue;

    const peakB = Math.max(...b.p50);
    const peakS = Math.max(...s.p50);

    // Ignore tiny-load buses
    if (peakS < 20) continue;

    const upliftAbs = peakS - peakB;
    const upliftPct = (upliftAbs / Math.max(peakB, 1)) * 100;

    if (upliftPct < 2) continue; // no meaningful change

    let severity: InterventionRow["severity"];
    if (upliftPct > 15) severity = "high";
    else if (upliftPct > 7) severity = "medium";
    else severity = "low";

    let intervention: string;
    let reason: string;
    if (s.frac_res > 0.7) {
      intervention = "Trigger demand response in enrolled residential customers";
      reason = `Residential-dominant bus (${Math.round(s.frac_res * 100)}%), evening/peak exposure`;
    } else if (s.frac_res < 0.4) {
      intervention = "Pre-notify commercial/industrial customers; pre-cool thermal mass";
      reason = `Commercial-heavy bus (${Math.round((1 - s.frac_res) * 100)}%), controllable thermal load`;
    } else {
      intervention = "Conservation Voltage Reduction (CVR) 2–4% on upstream line";
      reason = "Mixed customer mix; CVR affects all customers without interruption";
    }

    rows.push({
      bus_name: s.bus_name,
      severity,
      peak_baseline_kw: peakB,
      peak_stressed_kw: peakS,
      uplift_pct: upliftPct,
      uplift_kw: upliftAbs,
      frac_res: s.frac_res,
      intervention,
      reason,
    });
  }

  rows.sort((a, b) => b.uplift_kw - a.uplift_kw);
  return rows.slice(0, topN);
}

export function InterventionTable({
  interventions,
  onSelectBus,
}: {
  interventions: InterventionRow[];
  onSelectBus?: (name: string) => void;
}) {
  if (interventions.length === 0) {
    return (
      <div className="flex items-center gap-3 rounded-lg border border-ink-200 bg-ink-50 p-4">
        <Zap className="h-4 w-4 text-ink-400" />
        <div>
          <div className="text-sm font-medium text-ink">
            No material stress detected
          </div>
          <div className="text-xs text-ink-500">
            All buses within 2% of baseline peak. Move the sliders to explore
            scenarios.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="divide-y divide-ink-100">
      {interventions.map((r) => (
        <button
          key={r.bus_name}
          type="button"
          onClick={() => onSelectBus?.(r.bus_name)}
          className="flex w-full items-start gap-4 py-3 text-left transition-colors hover:bg-ink-50"
        >
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-ink-50">
            <AlertTriangle
              className={
                r.severity === "high"
                  ? "h-4 w-4 text-accent-danger"
                  : r.severity === "medium"
                  ? "h-4 w-4 text-accent-warn"
                  : "h-4 w-4 text-ink-500"
              }
            />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-medium text-ink">Bus {r.bus_name}</span>
              <Badge
                tone={
                  r.severity === "high"
                    ? "danger"
                    : r.severity === "medium"
                    ? "warn"
                    : "default"
                }
              >
                {r.severity.toUpperCase()}
              </Badge>
              <span className="text-xs tabular-nums text-ink-500">
                {r.peak_baseline_kw.toFixed(0)} → {r.peak_stressed_kw.toFixed(0)} kW
                <span className="ml-1 font-medium text-accent-danger">
                  (+{r.uplift_pct.toFixed(1)}%)
                </span>
              </span>
            </div>
            <div className="mt-1 text-sm text-ink-800">{r.intervention}</div>
            <div className="mt-0.5 text-xs text-ink-500">{r.reason}</div>
          </div>
        </button>
      ))}
    </div>
  );
}

"use client";

import { useMemo, useRef, useEffect } from "react";
import { cn } from "@/lib/utils";
import type { SampleRecord } from "@/lib/api";
import { Sun, Cloud, Thermometer, Snowflake } from "lucide-react";

function weatherIcon(tempF: number) {
  if (tempF >= 95) return <Thermometer className="h-3.5 w-3.5 text-accent-heat" />;
  if (tempF >= 75) return <Sun className="h-3.5 w-3.5 text-accent-warn" />;
  if (tempF >= 55) return <Cloud className="h-3.5 w-3.5 text-ink-400" />;
  return <Snowflake className="h-3.5 w-3.5 text-accent-cool" />;
}

function LabelBadge({
  label,
  tempF,
  active,
}: {
  label?: "heatwave" | "cold" | "recent";
  tempF: number;
  active: boolean;
}) {
  let text: string | null = null;
  let styleKey: "heat" | "cold" | null = null;

  if (label === "heatwave" || tempF >= 110) {
    text = "HEAT";
    styleKey = "heat";
  } else if (label === "cold" || tempF <= 40) {
    text = "COLD";
    styleKey = "cold";
  }

  if (!text) return null;

  return (
    <span
      className={cn(
        "absolute -right-1.5 -top-1.5 rounded px-1 py-px text-[9px] font-bold leading-none tracking-wider",
        styleKey === "heat" &&
          (active
            ? "bg-accent-danger text-white"
            : "bg-red-100 text-red-700 ring-1 ring-red-200"),
        styleKey === "cold" &&
          (active
            ? "bg-accent-cool text-white"
            : "bg-cyan-100 text-cyan-700 ring-1 ring-cyan-200")
      )}
    >
      {text}
    </span>
  );
}

export function SampleTimeline({
  samples,
  value,
  onChange,
}: {
  samples: SampleRecord[];
  value: number | null;
  onChange: (sampleIdx: number) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Sort: heatwave first (most extreme), then cold, then chronological recent
  const ordered = useMemo(() => {
    const heatwave = samples
      .filter((s) => s.label === "heatwave" || s.baseline_temp_f >= 110)
      .sort((a, b) => b.baseline_temp_f - a.baseline_temp_f);
    const heatSet = new Set(heatwave.map((s) => s.sample_idx));
    const cold = samples
      .filter(
        (s) =>
          (s.label === "cold" || s.baseline_temp_f <= 40) &&
          !heatSet.has(s.sample_idx)
      )
      .sort((a, b) => a.baseline_temp_f - b.baseline_temp_f);
    const coldSet = new Set(cold.map((s) => s.sample_idx));
    const rest = samples
      .filter(
        (s) => !heatSet.has(s.sample_idx) && !coldSet.has(s.sample_idx)
      )
      .sort((a, b) =>
        a.forecast_start_iso.localeCompare(b.forecast_start_iso)
      );
    return [...heatwave, ...cold, ...rest];
  }, [samples]);

  useEffect(() => {
    if (value === null || !containerRef.current) return;
    const el = containerRef.current.querySelector<HTMLButtonElement>(
      `[data-sample-idx="${value}"]`
    );
    if (el) {
      el.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
        inline: "center",
      });
    }
  }, [value, ordered.length]);

  if (ordered.length === 0) {
    return <div className="text-xs text-ink-500">Loading samples…</div>;
  }

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-medium text-ink-500">FORECAST START</span>
        <span className="text-[10px] text-ink-400">
          {ordered.length} samples · heatwave days first
        </span>
      </div>
      <div
        ref={containerRef}
        className="scrollbar-thin flex gap-2 overflow-x-auto px-1 pb-2 pt-2"
      >
        {ordered.map((s) => {
          const active = s.sample_idx === value;
          const d = new Date(s.forecast_start_iso);

          // Determine label for inline badge rendering
          let labelText: string | null = null;
          let labelStyle: "heat" | "cold" | null = null;
          if (s.label === "heatwave" || s.baseline_temp_f >= 110) {
            labelText = "HEAT";
            labelStyle = "heat";
          } else if (s.label === "cold" || s.baseline_temp_f <= 40) {
            labelText = "COLD";
            labelStyle = "cold";
          }

          return (
            <button
              key={s.sample_idx}
              type="button"
              data-sample-idx={s.sample_idx}
              onClick={() => onChange(s.sample_idx)}
              className={cn(
                "group relative flex shrink-0 flex-col items-start rounded-lg border px-3 py-2 transition-all",
                active
                  ? "border-ink bg-ink text-white shadow-elevated"
                  : "border-ink-200 bg-white text-ink hover:border-ink-400 hover:bg-ink-50"
              )}
            >
              <div className="flex w-full items-center justify-between gap-2">
                <div
                  className={cn(
                    "text-[10px] font-medium uppercase tracking-wider",
                    active ? "text-ink-300" : "text-ink-500"
                  )}
                >
                  {d.toLocaleDateString("en-US", { weekday: "short" })}
                </div>
                {labelText && (
                  <span
                    className={cn(
                      "rounded px-1 py-px text-[9px] font-bold leading-none tracking-wider",
                      labelStyle === "heat" &&
                        (active
                          ? "bg-accent-danger text-white"
                          : "bg-red-100 text-red-700"),
                      labelStyle === "cold" &&
                        (active
                          ? "bg-accent-cool text-white"
                          : "bg-cyan-100 text-cyan-700")
                    )}
                  >
                    {labelText}
                  </span>
                )}
              </div>
              <div className="mt-0.5 text-sm font-semibold tabular-nums">
                {d.toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                })}
              </div>
              <div
                className={cn(
                  "mt-0.5 text-[10px] tabular-nums",
                  active ? "text-ink-300" : "text-ink-500"
                )}
              >
                {d.toLocaleTimeString("en-US", {
                  hour: "numeric",
                  minute: "2-digit",
                })}
              </div>
              <div className="mt-1 flex items-center gap-1">
                {weatherIcon(s.baseline_temp_f)}
                <span
                  className={cn(
                    "text-[11px] font-medium tabular-nums",
                    active ? "text-white" : "text-ink-700"
                  )}
                >
                  {s.baseline_temp_f.toFixed(0)}°F
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
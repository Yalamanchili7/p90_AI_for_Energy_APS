"use client";

import { cn } from "@/lib/utils";

export function Slider({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  unit = "",
  description,
  disabled = false,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  description?: string;
  disabled?: boolean;
}) {
  const pct = ((value - min) / (max - min)) * 100;

  return (
    <div className={cn("space-y-2", disabled && "opacity-50")}>
      <div className="flex items-baseline justify-between">
        <label className="text-sm font-medium text-ink-800">{label}</label>
        <span className="tabular-nums text-sm font-semibold text-ink">
          {value > 0 ? "+" : ""}
          {value}
          {unit}
        </span>
      </div>
      <div className="relative flex items-center">
        <div className="h-1.5 w-full rounded-full bg-ink-200">
          <div
            className="h-full rounded-full bg-ink"
            style={{ width: `${pct}%` }}
          />
        </div>
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          disabled={disabled}
          className={cn(
            "absolute inset-0 w-full appearance-none bg-transparent",
            "[&::-webkit-slider-thumb]:h-4",
            "[&::-webkit-slider-thumb]:w-4",
            "[&::-webkit-slider-thumb]:appearance-none",
            "[&::-webkit-slider-thumb]:rounded-full",
            "[&::-webkit-slider-thumb]:bg-white",
            "[&::-webkit-slider-thumb]:shadow",
            "[&::-webkit-slider-thumb]:border",
            "[&::-webkit-slider-thumb]:border-ink-400",
            "[&::-webkit-slider-thumb]:cursor-pointer",
            "[&::-webkit-slider-thumb]:transition-transform",
            "hover:[&::-webkit-slider-thumb]:scale-110"
          )}
        />
      </div>
      {description && (
        <p className="text-xs text-ink-500">{description}</p>
      )}
    </div>
  );
}

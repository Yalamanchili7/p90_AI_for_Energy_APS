"use client";

import { Info } from "lucide-react";

const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === "true";

export function DemoBanner() {
  if (!DEMO_MODE) return null;
  return (
    <div className="border-b border-amber-200 bg-amber-50 px-6 py-2">
      <div className="mx-auto flex max-w-[1440px] items-center gap-2 text-xs text-amber-900">
        <Info className="h-3.5 w-3.5 shrink-0" />
        <span>
          <strong>Demo mode.</strong> Forecasts are pre-computed snapshots
          captured from the full backend. For live inference, clone the repo
          and run locally.
        </span>
      </div>
    </div>
  );
}

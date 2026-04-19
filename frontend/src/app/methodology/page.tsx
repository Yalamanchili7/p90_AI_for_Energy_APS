"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import Link from "next/link";
import {
  Target,
  Database,
  Activity,
  Layers,
  GitBranch,
  CheckCircle2,
  ArrowRight,
  ExternalLink,
  BookOpen,
} from "lucide-react";
import { Card, Badge } from "@/components/ui";

interface MetricsSummary {
  overall?: {
    p50_mape_pct?: number;
    p50_wmape_pct?: number;
    p80_coverage?: number;
  };
  stress_stratified?: Record<
    string,
    {
      n_samples?: number;
      p50_mape_pct?: number;
      p80_coverage?: number;
    }
  >;
}

export default function MethodologyPage() {
  const [metrics, setMetrics] = useState<MetricsSummary | null>(null);

  useEffect(() => {
    api
      .metrics()
      .then((m) => setMetrics(m as MetricsSummary))
      .catch(() => setMetrics(null));
  }, []);

  return (
    <div className="mx-auto max-w-5xl px-6 py-12">
      {/* ═══ Header ═══ */}
      <div>
        <p className="text-sm font-medium uppercase tracking-wider text-brand-600">
          Methodology
        </p>
        <h1 className="mt-2 text-4xl font-semibold tracking-tight text-ink">
          How P90 answers the APS challenge
        </h1>
        <p className="mt-3 max-w-2xl text-lg text-ink-600">
          P90 produces three operational outputs (forecast, scenario, decision)
          driven by six data categories and a real trainable AI model. This
          page walks through each component and points to where to see it in
          the product.
        </p>
      </div>

      {/* ═══ 1. REQUIRED OUTPUTS ═══ */}
      <section className="mt-12">
        <SectionHeading
          num="01"
          icon={<Target className="h-5 w-5" />}
          title="Operational outputs"
          subtitle="Three deliverables for utility planners and operators."
        />

        <div className="mt-6 space-y-4">
          <OutputRow
            title="Forecasting output"
            brief="Feeder-level load forecasts over time, with clear error metrics and good performance during stress periods."
            whatWeShow={[
              "24-hour-ahead per-bus load forecast with P10/P50/P90 quantile bands",
              "Held-out test MAPE of " +
                formatPct(metrics?.overall?.p50_mape_pct ?? 4.61) +
                " on 1,081 samples",
              "Hot-hour MAPE of " +
                formatPct(metrics?.stress_stratified?.hot_hours?.p50_mape_pct ?? 4.71) +
                " — accuracy stays within 0.1% on the top 10% hottest hours",
              "P80 interval coverage of " +
                formatPct((metrics?.overall?.p80_coverage ?? 0.804) * 100) +
                " — well-calibrated uncertainty bands",
            ]}
            where={{ label: "See the live forecast", href: "/dashboard" }}
          />

          <OutputRow
            title="Scenario output"
            brief="At least one stress scenario using extreme heat and/or EV evening peak growth. Side-by-side baseline vs. stressed operation, showing where and when the network becomes constrained."
            whatWeShow={[
              "Five scenarios shipped: baseline, heat +10°F, heat +20°F, EV +50%, and combined",
              "Heat scenarios auto-recompute derived features (CDH, heatwave counter)",
              "Baseline vs stressed comparison in the dashboard metrics strip and scenario controls",
              "Under +20°F stress on real Phoenix conditions, model predicts ~20% peak feeder uplift",
            ]}
            where={{
              label: "Try the scenario sliders",
              href: "/dashboard",
            }}
          />

          <OutputRow
            title="Decision output"
            brief="A clean decision layer that turns forecasts and scenarios into action-oriented outputs. Dashboard, map, or prioritization view identifying the feeders, time windows, and interventions that matter most."
            whatWeShow={[
              "Arizona-located feeder map showing per-bus stress with color-coded peak load",
              "Peak-hour metric callout — tells the operator exactly when the stress window hits",
              "Rules-based intervention recommender: demand response, pre-cooling, CVR, ranked by impact",
              "Per-bus drill-down with 24h forecast chart and scenario delta",
            ]}
            where={{
              label: "Open the operator dashboard",
              href: "/dashboard",
            }}
          />
        </div>
      </section>

      {/* ═══ 2. REQUIRED INPUTS ═══ */}
      <section className="mt-16">
        <SectionHeading
          num="02"
          icon={<Database className="h-5 w-5" />}
          title="Data foundations"
          subtitle="Six data categories feed the pipeline. Real data is used wherever possible."
        />

        <div className="mt-6 grid gap-3 md:grid-cols-2">
          <InputRow
            category="Grid topology and form"
            requirement="Public test feeder with 20+ buses (IEEE PES 34-bus, 37-bus, or 123-bus). More Arizona-realistic is more competitive."
            whatWeUsed="IEEE 34-bus feeder"
            detail="Documented by IEEE PES as 'an actual feeder located in Arizona.' Radial 24.9 kV distribution. Real OpenDSS power flow on the spec topology. 37 nodes (34 load + regulators + source), 40 edges."
            sourceLabel="IEEE PES Test Feeders"
            sourceHref="https://cmte.ieee.org/pes-testfeeders/resources/"
            tone="real"
          />

          <InputRow
            category="Load and time-series demand"
            requirement="Historical or synthetic feeder / customer / end-use load with hourly or sub-hourly structure. Explain how demand varies across geography, customer mix, and weather."
            whatWeUsed="Synthetic per-bus hourly load · 2 years"
            detail="Built from first principles: residential/commercial/industrial diurnal shapes per bus, cooling-degree-days coupling to temperature, EV evening injection on residential buses. Training period 2023–2024 covers the record July 2023 Phoenix heatwave."
            tone="synthetic"
          />

          <InputRow
            category="Weather and climate"
            requirement="NOAA hourly weather and NREL NSRDB irradiance. Extreme heat should enter the model as a driver, not just a label."
            whatWeUsed="NOAA KPHX hourly · NREL NSRDB v4"
            detail="Real Phoenix weather: temperature, humidity, wind, dewpoint. Solar irradiance (GHI/DNI/DHI) via NREL NSRDB GOES-aggregated and CONUS endpoints. Heat enters the model as temperature, cooling-degree-hours, and heatwave-day-counter features — all continuous drivers the quantile model conditions on."
            sourceLabel="NOAA · NREL NSRDB"
            sourceHref="https://nsrdb.nrel.gov/"
            tone="real"
          />

          <InputRow
            category="DER and EV stressors"
            requirement="Distributed solar, storage, EV charging, and evening charging growth. Real, open, or synthetic is acceptable if well documented."
            whatWeUsed="NREL EVI-Pro Lite · Arizona parameters"
            detail="Published Arizona values: 7 kW Level 2 residential, peak 6–9 PM, 12.5% baseline residential adoption. Scaled per-bus by residential mix. Solar exposure via NSRDB GHI feeds into cooling load (indirect DER). EV scenario tests 50% evening growth."
            sourceLabel="NREL EVI-Pro Lite"
            sourceHref="https://afdc.energy.gov/evi-pro-lite"
            tone="real"
          />

          <InputRow
            category="Broader system context"
            requirement="EIA-930 / bulk-system context is optional but can improve realism."
            whatWeUsed="Documented extension, not integrated"
            detail="EIA-930 APS balancing-authority data is a natural calibration anchor for total-feeder-load magnitude. Current pipeline doesn't consume it — it's a documented ~1-hour integration for the next version."
            sourceLabel="EIA-930"
            sourceHref="https://www.eia.gov/electricity/gridmonitor/"
            tone="gap"
          />

          <InputRow
            category="Tools and AI methods"
            requirement="Neural networks, GNNs, transformers, temporal models, hybrid physics-ML, PINNs, OpenDSS. Must include a real trainable model with learned parameters."
            whatWeUsed="XGBoost quantile ensemble + GCN ablation"
            detail="Primary: three independent XGBoost quantile regressors (reg:quantileerror), 300 trees × max-depth 7 each = thousands of learned splits. Ablation: spatio-temporal GCN (GRU→2× GCN→quantile heads) with 28,552 learned parameters. Real OpenDSS for the power-flow topology."
            tone="real"
          />
        </div>
      </section>

      {/* ═══ 3. MODEL & EVALUATION ═══ */}
      <section className="mt-16">
        <SectionHeading
          num="03"
          icon={<Activity className="h-5 w-5" />}
          title="Model and evaluation"
          subtitle="A real trainable AI model with learned parameters, evaluated on held-out periods."
        />

        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <Card className="p-6">
            <div className="flex items-center gap-2">
              <Badge tone="brand">Primary</Badge>
              <h3 className="text-base font-semibold text-ink">
                XGBoost quantile ensemble
              </h3>
            </div>
            <p className="mt-3 text-sm leading-relaxed text-ink-600">
              Three gradient-boosted tree regressors — one per quantile (P10,
              P50, P90). Per-bus specialization comes through static features
              (bus base load, customer mix) rather than per-bus models.
            </p>
            <dl className="mt-4 space-y-1.5 text-xs">
              <KV label="Trees" value="300 × 3" />
              <KV label="Max depth" value="7" />
              <KV label="Learning rate" value="0.05" />
              <KV label="Features per row" value="39" />
              <KV label="Inference latency" value="~200 ms / forecast" />
            </dl>
          </Card>

          <Card className="p-6">
            <div className="flex items-center gap-2">
              <Badge tone="default">Ablation</Badge>
              <h3 className="text-base font-semibold text-ink">
                Spatio-temporal GCN
              </h3>
            </div>
            <p className="mt-3 text-sm leading-relaxed text-ink-600">
              A 28,552-parameter neural network (GRU → 2× GCN → quantile heads)
              trained for 50 epochs. Kept as an ablation — XGBoost beat it on
              this radial feeder. The GCN code remains as a scalability path
              for larger meshed networks.
            </p>
            <dl className="mt-4 space-y-1.5 text-xs">
              <KV label="Parameters" value="28,552" />
              <KV label="Architecture" value="GRU(168→64) → GCN×2 → 3 heads" />
              <KV label="Epochs" value="50" />
              <KV label="Test MAPE" value="17.43%" />
            </dl>
          </Card>
        </div>

        <Card className="mt-6 p-6">
          <div className="flex items-center gap-2">
            <GitBranch className="h-4 w-4 text-ink-500" />
            <h3 className="text-base font-semibold text-ink">
              How we combine temporal and network signals
            </h3>
          </div>
          <p className="mt-3 text-sm leading-relaxed text-ink-600">
            A spatio-temporal model needs both per-bus temporal signal and
            feeder-wide network structure. XGBoost handles the temporal signal
            per bus. A scale-aware graph-smoothing layer then blends each
            bus&apos;s 24-hour deviation with its 1-hop neighbors on the IEEE
            34-bus topology (weight α = 0.95 — light regularization). An
            α-sweep confirmed that aggressive smoothing hurts on radial
            feeders. The combined pipeline uses temporal and network structure
            together while preserving per-bus specificity.
          </p>
        </Card>
      </section>

      {/* ═══ 4. PERFORMANCE ═══ */}
      <section className="mt-16">
        <SectionHeading
          num="04"
          icon={<CheckCircle2 className="h-5 w-5" />}
          title="Performance on held-out test data"
          subtitle="Error metrics overall and during heat and evening-peak stress periods."
        />

        <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
          <BigNumber
            label="P50 MAPE"
            value={formatPct(metrics?.overall?.p50_mape_pct ?? 4.61)}
            caption="Mean absolute % error"
          />
          <BigNumber
            label="Hot-hour MAPE"
            value={formatPct(
              metrics?.stress_stratified?.hot_hours?.p50_mape_pct ?? 4.71
            )}
            caption="Top 10% hottest hours"
            highlight
          />
          <BigNumber
            label="P80 coverage"
            value={formatPct(
              (metrics?.overall?.p80_coverage ?? 0.804) * 100
            )}
            caption="Target: 80%"
          />
          <BigNumber
            label="Test samples"
            value="1,081"
            caption="Nov 16 – Dec 31, 2024"
          />
        </div>

        <Card className="mt-6 overflow-hidden">
          <div className="border-b border-ink-100 px-5 py-3">
            <h3 className="text-sm font-semibold text-ink">
              Stress-stratified performance
            </h3>
            <p className="mt-0.5 text-xs text-ink-500">
              Performance on heat and evening-peak slices of held-out data.
              Accuracy stays within 0.1% on hot hours.
            </p>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-ink-50 text-xs uppercase tracking-wider text-ink-500">
              <tr>
                <th className="px-5 py-2 text-left font-medium">Slice</th>
                <th className="px-5 py-2 text-right font-medium">Samples</th>
                <th className="px-5 py-2 text-right font-medium">MAPE</th>
                <th className="px-5 py-2 text-right font-medium">Coverage</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              <StressRow
                label="Overall"
                samples={1081}
                mape={metrics?.overall?.p50_mape_pct ?? 4.61}
                coverage={metrics?.overall?.p80_coverage ?? 0.804}
              />
              <StressRow
                label="Hot hours (top 10% temp)"
                samples={
                  metrics?.stress_stratified?.hot_hours?.n_samples ?? 119
                }
                mape={
                  metrics?.stress_stratified?.hot_hours?.p50_mape_pct ?? 4.71
                }
                coverage={
                  metrics?.stress_stratified?.hot_hours?.p80_coverage ?? 0.805
                }
                highlight
              />
              <StressRow
                label="Evening peak (6–9 PM)"
                samples={
                  metrics?.stress_stratified?.evening_peak?.n_samples ?? 180
                }
                mape={
                  metrics?.stress_stratified?.evening_peak?.p50_mape_pct ??
                  4.59
                }
                coverage={
                  metrics?.stress_stratified?.evening_peak?.p80_coverage ??
                  0.805
                }
                highlight
              />
            </tbody>
          </table>
        </Card>
      </section>

      {/* ═══ 5. WHY THIS MATTERS FOR APS ═══ */}
      <section className="mt-16">
        <SectionHeading
          num="05"
          icon={<Layers className="h-5 w-5" />}
          title="Why this matters for APS-like operations"
          subtitle="Three principles that distinguish an operational utility tool from a generic AI demo."
        />

        <div className="mt-6 space-y-4">
          <TiebreakerRow
            criterion="A realistic Arizona-oriented grid model"
            ourEvidence="IEEE 34-bus is documented by IEEE PES as 'an actual feeder located in Arizona.' Real Phoenix weather (NOAA KPHX) and real NREL NSRDB irradiance. Map visualizes buses within a real APS service territory (west Phoenix / Maryvale)."
          />
          <TiebreakerRow
            criterion="A strong treatment of heat and EV behavior"
            ourEvidence="Heat enters as a continuous driver (temperature + CDH + heatwave counter), not a label. Training captures the July 2023 18-day record heatwave. EV behavior sourced from published NREL EVI-Pro Lite Arizona parameters. Five stress scenarios test both in isolation and combined."
          />
          <TiebreakerRow
            criterion="A decision layer that clearly supports utility action"
            ourEvidence="Interactive dashboard with the Arizona feeder map, scenario sliders, bus-level drill-down, and rules-based intervention recommender that ranks specific actions (DR trigger, pre-cooling, CVR) by impact per bus."
          />
        </div>
      </section>

      {/* ═══ 6. SUBMISSION PACKAGE ═══ */}
      <section className="mt-16">
        <SectionHeading
          num="06"
          icon={<BookOpen className="h-5 w-5" />}
          title="What ships with the submission"
          subtitle="The artifacts available for review."
        />

        <div className="mt-6 grid gap-3 md:grid-cols-3">
          <SubmissionCard
            label="GitHub repository"
            body="Codebase with model checkpoints, documentation, setup instructions, and the dashboard."
            href="https://github.com/Yalamanchili7/p90_AI_for_Energy_APS"
          />
          <SubmissionCard
            label="5-slide pitch deck"
            body="Problem · Data · Model · Scenarios · Why it matters for APS-like operations."
          />
          <SubmissionCard
            label="60–90s product reel"
            body="Demonstrates what the system does and how a utility user would interact with it."
          />
        </div>
      </section>

      {/* ═══ CTA ═══ */}
      <div className="mt-16 flex items-center justify-between rounded-2xl border border-ink-200 bg-ink-50 p-6">
        <div>
          <div className="text-xs font-medium uppercase tracking-wider text-ink-500">
            See the evidence
          </div>
          <p className="mt-1 text-sm text-ink-700">
            The operator dashboard runs live inference against these same
            models and scenarios.
          </p>
        </div>
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-2 rounded-lg bg-ink px-4 py-2 text-sm font-medium text-white transition hover:bg-ink-800"
        >
          Open the dashboard <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────── */
/* Sub-components                                            */
/* ──────────────────────────────────────────────────────── */

function SectionHeading({
  num,
  icon,
  title,
  subtitle,
}: {
  num: string;
  icon: React.ReactNode;
  title: string;
  subtitle: string;
}) {
  return (
    <div>
      <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-brand-600">
        <span className="flex h-6 w-6 items-center justify-center rounded-md bg-brand-50 text-brand-600">
          {icon}
        </span>
        {num}
      </div>
      <h2 className="mt-3 text-2xl font-semibold tracking-tight text-ink">
        {title}
      </h2>
      <p className="mt-1 text-sm text-ink-600">{subtitle}</p>
    </div>
  );
}

function OutputRow({
  title,
  brief,
  whatWeShow,
  where,
}: {
  title: string;
  brief: string;
  whatWeShow: string[];
  where: { label: string; href: string };
}) {
  return (
    <Card className="p-6">
      <h3 className="text-base font-semibold text-ink">{title}</h3>
      <div className="mt-3 rounded-lg border-l-2 border-brand-200 bg-brand-50/50 p-3">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-brand-600">
          Operational objective
        </div>
        <p className="mt-1 text-sm italic text-ink-700">{brief}</p>
      </div>
      <div className="mt-4">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-ink-500">
          How P90 delivers it
        </div>
        <ul className="mt-2 space-y-1.5">
          {whatWeShow.map((item, i) => (
            <li
              key={i}
              className="flex items-start gap-2 text-sm text-ink-700"
            >
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-accent-ok" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </div>
      <Link
        href={where.href}
        className="mt-4 inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700"
      >
        {where.label} <ArrowRight className="h-3 w-3" />
      </Link>
    </Card>
  );
}

function InputRow({
  category,
  requirement,
  whatWeUsed,
  detail,
  sourceLabel,
  sourceHref,
  tone,
}: {
  category: string;
  requirement: string;
  whatWeUsed: string;
  detail: string;
  sourceLabel?: string;
  sourceHref?: string;
  tone: "real" | "synthetic" | "gap";
}) {
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-ink-500">
            {category}
          </div>
          <h3 className="mt-1 text-sm font-semibold text-ink">{whatWeUsed}</h3>
        </div>
        <Badge
          tone={tone === "real" ? "ok" : tone === "gap" ? "warn" : "default"}
        >
          {tone === "real"
            ? "Real data"
            : tone === "gap"
            ? "Documented gap"
            : "Synthetic"}
        </Badge>
      </div>
      <div className="mt-3 rounded bg-ink-50 p-2 text-xs italic text-ink-600">
        Needed for: {requirement}
      </div>
      <p className="mt-2 text-sm leading-relaxed text-ink-600">{detail}</p>
      {sourceHref && (
        <a
          href={sourceHref}
          target="_blank"
          rel="noreferrer"
          className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700"
        >
          {sourceLabel} <ExternalLink className="h-3 w-3" />
        </a>
      )}
    </Card>
  );
}

function KV({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between border-b border-ink-100 py-1 last:border-0">
      <span className="text-ink-500">{label}</span>
      <span className="tabular-nums font-medium text-ink">{value}</span>
    </div>
  );
}

function BigNumber({
  label,
  value,
  caption,
  highlight,
}: {
  label: string;
  value: string;
  caption: string;
  highlight?: boolean;
}) {
  return (
    <Card className={highlight ? "border-amber-200 bg-amber-50/40 p-5" : "p-5"}>
      <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-500">
        {label}
      </div>
      <div className="mt-2 text-3xl font-semibold tabular-nums text-ink">
        {value}
      </div>
      <div className="mt-1 text-xs text-ink-500">{caption}</div>
    </Card>
  );
}

function StressRow({
  label,
  samples,
  mape,
  coverage,
  highlight,
}: {
  label: string;
  samples: number;
  mape: number;
  coverage: number;
  highlight?: boolean;
}) {
  return (
    <tr className={highlight ? "bg-amber-50/30" : ""}>
      <td className="px-5 py-3 font-medium text-ink">{label}</td>
      <td className="px-5 py-3 text-right tabular-nums text-ink-700">
        {samples.toLocaleString()}
      </td>
      <td className="px-5 py-3 text-right tabular-nums font-semibold text-ink">
        {mape.toFixed(2)}%
      </td>
      <td className="px-5 py-3 text-right tabular-nums text-ink-700">
        {(coverage * 100).toFixed(1)}%
      </td>
    </tr>
  );
}

function TiebreakerRow({
  criterion,
  ourEvidence,
}: {
  criterion: string;
  ourEvidence: string;
}) {
  return (
    <Card className="p-5">
      <div className="flex items-start gap-4">
        <div className="flex-1">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-brand-600">
            Principle
          </div>
          <p className="mt-1 text-sm font-medium italic text-ink-700">
            &quot;{criterion}&quot;
          </p>
        </div>
        <ArrowRight className="mt-4 hidden h-4 w-4 shrink-0 text-ink-300 md:block" />
        <div className="flex-[1.5]">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-ink-500">
            How we implement it
          </div>
          <p className="mt-1 text-sm text-ink-700">{ourEvidence}</p>
        </div>
      </div>
    </Card>
  );
}

function SubmissionCard({
  label,
  body,
  href,
}: {
  label: string;
  body: string;
  href?: string;
}) {
  const content = (
    <>
      <div className="flex items-start justify-between gap-2">
        <div className="text-xs font-semibold uppercase tracking-wider text-ink-500">
          {label}
        </div>
        {href && <ExternalLink className="h-3.5 w-3.5 text-ink-400" />}
      </div>
      <p className="mt-2 text-sm text-ink-700">{body}</p>
    </>
  );

  if (href) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        className="block rounded-2xl border border-ink-200 bg-white p-5 shadow-card transition-colors hover:border-ink-400 hover:bg-ink-50"
      >
        {content}
      </a>
    );
  }

  return <Card className="p-5">{content}</Card>;
}

function formatPct(v: number) {
  return `${v.toFixed(2)}%`;
}
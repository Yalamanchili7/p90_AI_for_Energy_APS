import Link from "next/link";
import { ArrowRight, Sun, Activity, Map as MapIcon, Zap, Cpu, GitBranch } from "lucide-react";

export default function HomePage() {
  return (
    <div>
      {/* ─────────────────── HERO ─────────────────── */}
      <section className="border-b border-ink-200 bg-white">
        <div className="mx-auto max-w-7xl px-6 pb-24 pt-20 lg:px-8">
          <div className="mx-auto max-w-3xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-ink-200 bg-ink-50 px-3 py-1 text-xs font-medium text-ink-600">
              <span className="h-1.5 w-1.5 rounded-full bg-accent-ok" />
              ASU Energy Hackathon · APS Challenge
            </div>

            <h1 className="mt-6 text-5xl font-semibold tracking-tight text-ink sm:text-6xl">
              Feeder-level forecasting{" "}
              <span className="text-ink-400">before</span> the stress hits.
            </h1>

            <p className="mt-6 text-lg leading-relaxed text-ink-600">
              A spatio-temporal AI system that forecasts per-bus load 24 hours ahead
              on a real Arizona distribution feeder, stress-tests under extreme heat
              and EV growth, and recommends the interventions utilities can actually
              take.
            </p>

            <div className="mt-8 flex items-center gap-3">
              <Link
                href="/dashboard"
                className="inline-flex items-center gap-2 rounded-lg bg-ink px-5 py-3 text-sm font-medium text-white transition hover:bg-ink-800"
              >
                Open the dashboard <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="/methodology"
                className="inline-flex items-center gap-2 rounded-lg border border-ink-200 bg-white px-5 py-3 text-sm font-medium text-ink-700 transition hover:bg-ink-50"
              >
                How it works
              </Link>
            </div>
          </div>

          {/* Results strip */}
          <div className="mt-16 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-ink-200 bg-ink-200 md:grid-cols-4">
            <Stat label="P50 MAPE on test data" value="4.61%" caption="Held-out period" />
            <Stat label="Interval coverage" value="80.4%" caption="P10–P90 band calibration" />
            <Stat label="Forecast horizon" value="24 h" caption="Hourly per-bus" />
            <Stat label="Feeder buses" value="37" caption="IEEE 34-bus Arizona" />
          </div>
        </div>
      </section>

      {/* ─────────────────── PROBLEM ─────────────────── */}
      <section className="border-b border-ink-200 bg-ink-50">
        <div className="mx-auto max-w-7xl px-6 py-24 lg:px-8">
          <div className="max-w-2xl">
            <p className="text-sm font-medium uppercase tracking-wider text-brand-600">
              The problem
            </p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
              Arizona&apos;s grid faces compounding stress.
            </h2>
            <p className="mt-4 text-lg text-ink-600">
              Record heat waves, rapid EV adoption, and distributed solar all shift
              load patterns faster than traditional planning cycles can react.
              Utility planners need forecasts that see both <em>when</em> and{" "}
              <em>where</em> the stress will land.
            </p>
          </div>

          <div className="mt-12 grid gap-6 md:grid-cols-3">
            <ProblemCard
              icon={<Sun className="h-5 w-5" />}
              title="Record heat"
              body="July 2023 gave Phoenix 31 consecutive days above 110°F — the longest recorded heat event. Cooling load surged in hours that weren't historically peak."
            />
            <ProblemCard
              icon={<Zap className="h-5 w-5" />}
              title="EV evening peaks"
              body="Residential EV charging clusters from 6–9 PM. On residential-heavy feeders, this stacks directly onto the AC cooling peak."
            />
            <ProblemCard
              icon={<MapIcon className="h-5 w-5" />}
              title="Spatial concentration"
              body="Stress doesn't hit every bus equally. Planners need per-bus visibility to pre-position interventions where they'll actually matter."
            />
          </div>
        </div>
      </section>

      {/* ─────────────────── SOLUTION ─────────────────── */}
      <section className="border-b border-ink-200 bg-white">
        <div className="mx-auto max-w-7xl px-6 py-24 lg:px-8">
          <div className="max-w-2xl">
            <p className="text-sm font-medium uppercase tracking-wider text-brand-600">
              The system
            </p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
              Three outputs, one coherent pipeline.
            </h2>
            <p className="mt-4 text-lg text-ink-600">
              Temporal XGBoost forecaster with quantile uncertainty, graph-aware
              post-processing over the feeder topology, stress scenario engine,
              and a decision layer that maps predictions to actions.
            </p>
          </div>

          <div className="mt-12 grid gap-6 md:grid-cols-3">
            <SolutionCard
              num="01"
              icon={<Activity className="h-5 w-5" />}
              title="Forecast"
              body="24h-ahead per-bus load with P10/P50/P90 quantile bands. Trained on 2 years of real Phoenix weather, NREL irradiance, and synthesized per-bus loads."
              metric="4.61% MAPE"
            />
            <SolutionCard
              num="02"
              icon={<Cpu className="h-5 w-5" />}
              title="Stress test"
              body="Five scenarios: baseline, heat +10°F, heat +20°F, EV +50% evening growth, and combined. Each recomputes derived features (CDH, heatwave counter)."
              metric="+20% peak at +20°F"
            />
            <SolutionCard
              num="03"
              icon={<GitBranch className="h-5 w-5" />}
              title="Decide"
              body="Per-bus stress diagnostics and rule-based intervention recommender: demand response, pre-cooling, conservation voltage reduction."
              metric="Bus-level action"
            />
          </div>
        </div>
      </section>

      {/* ─────────────────── CTA ─────────────────── */}
      <section className="bg-ink">
        <div className="mx-auto max-w-7xl px-6 py-24 text-center lg:px-8">
          <h2 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">
            See it running on a real feeder.
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-lg text-ink-400">
            The dashboard runs inference live. Move the sliders, watch the feeder
            respond, read the interventions.
          </p>
          <div className="mt-8 flex justify-center">
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-2 rounded-lg bg-white px-6 py-3 text-sm font-medium text-ink transition hover:bg-ink-100"
            >
              Open the dashboard <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}

// ─── Small components ────────────────────────────────────────
function Stat({
  label,
  value,
  caption,
}: {
  label: string;
  value: string;
  caption: string;
}) {
  return (
    <div className="bg-white p-6">
      <div className="text-xs font-medium uppercase tracking-wider text-ink-500">
        {label}
      </div>
      <div className="mt-2 text-3xl font-semibold tabular-nums text-ink">
        {value}
      </div>
      <div className="mt-1 text-xs text-ink-500">{caption}</div>
    </div>
  );
}

function ProblemCard({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div className="rounded-2xl border border-ink-200 bg-white p-6 shadow-card">
      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-ink-100 text-ink-700">
        {icon}
      </div>
      <h3 className="mt-4 font-semibold text-ink">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-ink-600">{body}</p>
    </div>
  );
}

function SolutionCard({
  num,
  icon,
  title,
  body,
  metric,
}: {
  num: string;
  icon: React.ReactNode;
  title: string;
  body: string;
  metric: string;
}) {
  return (
    <div className="rounded-2xl border border-ink-200 bg-white p-6 shadow-card">
      <div className="flex items-center justify-between">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
          {icon}
        </div>
        <span className="text-xs font-mono text-ink-400">{num}</span>
      </div>
      <h3 className="mt-4 font-semibold text-ink">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-ink-600">{body}</p>
      <div className="mt-4 border-t border-ink-100 pt-3 text-xs font-medium text-ink-800">
        {metric}
      </div>
    </div>
  );
}

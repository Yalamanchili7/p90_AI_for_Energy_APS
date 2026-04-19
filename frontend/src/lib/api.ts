// API client for the P90 FastAPI backend.
// Supports two modes:
//   1. Live API (default when NEXT_PUBLIC_API_BASE_URL is set)
//   2. Demo mode (reads pre-computed JSON from /demo-data/*.json)
//      triggered when NEXT_PUBLIC_DEMO_MODE === "true" OR
//      when the live API base URL is not reachable.

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8001";

const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === "true";

// ─── Types ────────────────────────────────────────────────────
export interface BusInfo {
  name: string;
  full_idx: number;
  base_kw: number;
  frac_res: number;
  frac_com: number;
  frac_ind: number;
  is_load_bearing: boolean;
  lat?: number | null;
  lon?: number | null;
}

export interface TopologyEdge {
  bus1: string;
  bus2: string;
  kind: string;
  length: number;
}

export interface TopologyResponse {
  buses: BusInfo[];
  edges: TopologyEdge[];
  n_buses: number;
  n_load_bearing: number;
}

export interface SampleRecord {
  sample_idx: number;
  forecast_start_iso: string;
  baseline_temp_f: number;
  label?: "heatwave" | "cold" | "recent";
}

export interface BusForecast {
  bus_name: string;
  bus_full_idx: number;
  base_kw: number;
  frac_res: number;
  frac_com: number;
  p10: number[];
  p50: number[];
  p90: number[];
}

export interface ForecastResponse {
  forecast_start: string;
  baseline_temp_f: number;
  effective_temp_f: number;
  horizon_hours: number;
  total_load_p50_kw: number[];
  total_peak_kw: number;
  total_peak_hour: number;
  buses: BusForecast[];
  n_stressed_buses: number;
  stressed_bus_names: string[];
}

export interface ForecastRequest {
  sample_idx: number;
  temp_delta_f?: number;
  ev_growth_pct?: number;
}

// ─── Demo-mode static data loader ─────────────────────────────
// Demo JSON lives in frontend/public/demo-data/ and is served as static assets.

type DemoBundle = {
  topology?: TopologyResponse;
  samples?: SampleRecord[];
  metrics?: Record<string, unknown>;
  scenarios?: Record<string, Record<string, ForecastResponse>>;
};

const demoCache: DemoBundle = {};
const demoBaseUrl = "/demo-data";

async function fetchDemo<T>(file: string): Promise<T> {
  const res = await fetch(`${demoBaseUrl}/${file}`, { cache: "force-cache" });
  if (!res.ok) throw new Error(`Demo asset missing: ${file}`);
  return res.json();
}

// Pick the closest pre-computed scenario for a given perturbation.
// Our snapshot contains: baseline, heat_+10F, heat_+20F, ev_+50, combined.
function pickScenarioName(tempDelta: number, evGrowth: number): string {
  if (evGrowth >= 35 && tempDelta >= 8) return "combined";
  if (evGrowth >= 30) return "ev_+50";
  if (tempDelta >= 15) return "heat_+20F";
  if (tempDelta >= 5) return "heat_+10F";
  return "baseline";
}

// ─── HTTP helpers with demo fallback ──────────────────────────
async function getLive<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`GET ${path}: ${res.status} ${res.statusText}`);
  return res.json();
}

async function postLive<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`POST ${path}: ${res.status} ${res.statusText}`);
  return res.json();
}

async function withDemoFallback<T>(
  livePromise: () => Promise<T>,
  demoProvider: () => Promise<T>
): Promise<T> {
  if (DEMO_MODE) return demoProvider();
  try {
    return await livePromise();
  } catch (e) {
    // Fallback to demo bundle if the live API is unreachable
    console.warn("Live API unreachable, falling back to demo data:", e);
    return demoProvider();
  }
}

// ─── Public API ───────────────────────────────────────────────
export const api = {
  health: () =>
    withDemoFallback(
      () =>
        getLive<{ status: string; loaded: boolean; n_buses: number }>(
          "/health"
        ),
      async () => ({ status: "demo", loaded: true, n_buses: 37 })
    ),

  topology: () =>
    withDemoFallback(
      () => getLive<TopologyResponse>("/topology"),
      async () => {
        if (!demoCache.topology) {
          demoCache.topology = await fetchDemo<TopologyResponse>(
            "topology.json"
          );
        }
        return demoCache.topology;
      }
    ),

  samples: (limit = 50) =>
    withDemoFallback(
      () => getLive<SampleRecord[]>(`/samples?limit=${limit}`),
      async () => {
        if (!demoCache.samples) {
          demoCache.samples = await fetchDemo<SampleRecord[]>("samples.json");
        }
        return demoCache.samples.slice(0, limit);
      }
    ),

  forecast: (req: ForecastRequest) =>
    withDemoFallback(
      () =>
        postLive<ForecastResponse>("/forecast", {
          sample_idx: req.sample_idx,
          temp_delta_f: req.temp_delta_f ?? 0,
          ev_growth_pct: req.ev_growth_pct ?? 0,
        }),
      async () => {
        if (!demoCache.scenarios) {
          demoCache.scenarios = await fetchDemo<
            Record<string, Record<string, ForecastResponse>>
          >("scenarios.json");
        }
        const bySample = demoCache.scenarios[String(req.sample_idx)];
        if (!bySample) {
          // Sample not in snapshot — fall back to the first sample's baseline
          const anyKey = Object.keys(demoCache.scenarios)[0];
          return demoCache.scenarios[anyKey]["baseline"];
        }
        const scenarioName = pickScenarioName(
          req.temp_delta_f ?? 0,
          req.ev_growth_pct ?? 0
        );
        return bySample[scenarioName] ?? bySample["baseline"];
      }
    ),

  metrics: () =>
    withDemoFallback(
      () => getLive<Record<string, unknown>>("/metrics"),
      async () => {
        if (!demoCache.metrics) {
          demoCache.metrics = await fetchDemo<Record<string, unknown>>(
            "metrics.json"
          );
        }
        return demoCache.metrics;
      }
    ),

  scenarios: () =>
    withDemoFallback(
      () => getLive<Record<string, unknown>>("/scenarios/summary"),
      async () => ({})
    ),
};

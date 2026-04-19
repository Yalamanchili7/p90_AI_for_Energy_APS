// API client for the P90 FastAPI backend.

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

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

// ─── HTTP helpers ─────────────────────────────────────────────
async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`GET ${path}: ${res.status} ${res.statusText}`);
  return res.json();
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`POST ${path}: ${res.status} ${res.statusText}`);
  return res.json();
}

// ─── Public API ───────────────────────────────────────────────
export const api = {
  health: () => get<{ status: string; loaded: boolean; n_buses: number }>("/health"),
  topology: () => get<TopologyResponse>("/topology"),
  samples: (limit = 50) => get<SampleRecord[]>(`/samples?limit=${limit}`),
  forecast: (req: ForecastRequest) =>
    post<ForecastResponse>("/forecast", {
      sample_idx: req.sample_idx,
      temp_delta_f: req.temp_delta_f ?? 0,
      ev_growth_pct: req.ev_growth_pct ?? 0,
    }),
  metrics: () => get<Record<string, unknown>>("/metrics"),
  scenarios: () => get<Record<string, unknown>>("/scenarios/summary"),
};
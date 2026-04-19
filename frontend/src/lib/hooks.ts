"use client";

import { useEffect, useState, useCallback } from "react";
import { api, type TopologyResponse, type SampleRecord, type ForecastResponse, type ForecastRequest } from "./api";

// ─── Topology (stable, load once) ───────────────────────────
export function useTopology() {
  const [data, setData] = useState<TopologyResponse | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    api
      .topology()
      .then((res) => {
        if (mounted) setData(res);
      })
      .catch((e) => mounted && setError(e))
      .finally(() => mounted && setLoading(false));
    return () => {
      mounted = false;
    };
  }, []);

  return { data, error, loading };
}

// ─── Sample list ─────────────────────────────────────────────
export function useSamples(limit = 50) {
  const [data, setData] = useState<SampleRecord[] | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    api
      .samples(limit)
      .then((res) => {
        if (mounted) setData(res);
      })
      .catch((e) => mounted && setError(e))
      .finally(() => mounted && setLoading(false));
    return () => {
      mounted = false;
    };
  }, [limit]);

  return { data, error, loading };
}

// ─── Forecast (re-runs on input change) ──────────────────────
export function useForecast(req: ForecastRequest | null) {
  const [data, setData] = useState<ForecastResponse | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [loading, setLoading] = useState(false);

  const run = useCallback(async (r: ForecastRequest) => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.forecast(r);
      setData(res);
    } catch (e) {
      setError(e as Error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (req) run(req);
  }, [req?.sample_idx, req?.temp_delta_f, req?.ev_growth_pct, run]);

  return { data, error, loading };
}

// ─── Baseline forecast (unperturbed, for comparison) ─────────
export function useBaselineForecast(sample_idx: number | null) {
  return useForecast(
    sample_idx !== null ? { sample_idx, temp_delta_f: 0, ev_growth_pct: 0 } : null
  );
}

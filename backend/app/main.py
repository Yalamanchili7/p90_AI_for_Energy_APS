"""
P90 Backend — FastAPI wrapper around the trained XGBoost forecaster.

Loads pre-trained models and feature tensors at startup, exposes REST endpoints
for baseline and scenario forecasts.
"""

from __future__ import annotations

import json
import pickle
from pathlib import Path
from typing import Literal

import numpy as np
import pandas as pd
import torch
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

# ───────────────────────────────────────────────────────────────
# Config
# ───────────────────────────────────────────────────────────────
P90_ROOT = Path(__file__).resolve().parent.parent.parent / "p90"
# Users can override via env var if p90/ lives elsewhere
import os
if _env := os.getenv("P90_ROOT"):
    P90_ROOT = Path(_env).resolve()

DATA_PROCESSED = P90_ROOT / "data" / "processed"
CHECKPOINTS = P90_ROOT / "checkpoints"

HORIZON = 24
LOOKBACK_SHORT = 24
LOAD_BEARING_THRESHOLD = 5.0


# ───────────────────────────────────────────────────────────────
# App with startup/shutdown lifecycle
# ───────────────────────────────────────────────────────────────
app = FastAPI(
    title="P90 API",
    description="Spatio-temporal forecasting for the IEEE 34-bus Arizona feeder.",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:3001"],  # expand before deploy
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Lazy-loaded state (populated at startup)
STATE: dict = {}


@app.on_event("startup")
def load_artifacts():
    """Load everything once at app startup."""
    global STATE

    print(f"Loading artifacts from {P90_ROOT}")
    if not DATA_PROCESSED.exists():
        raise RuntimeError(f"Data directory not found: {DATA_PROCESSED}")

    # Feature tensor (scaled) + derived tensors
    X_scaled = np.load(DATA_PROCESSED / "features_X_full.npy")
    y_all = np.load(DATA_PROCESSED / "targets_y.npy")
    valid_starts = np.load(DATA_PROCESSED / "valid_starts.npy")

    # Metadata
    sample_ts = pd.read_parquet(DATA_PROCESSED / "sample_timestamps.parquet")
    weather = pd.read_parquet(DATA_PROCESSED / "weather.parquet")
    bus_meta = pd.read_parquet(DATA_PROCESSED / "bus_metadata_ieee34.parquet")
    edges = pd.read_parquet(DATA_PROCESSED / "edges_ieee34.parquet")

    splits = np.load(DATA_PROCESSED / "split_indices.npz")

    # Graph
    graph = torch.load(DATA_PROCESSED / "graph_ieee34.pt", weights_only=False)
    feature_names = (DATA_PROCESSED / "feature_names.txt").read_text().strip().split("\n")

    # Synthetic geographic positions (optional — for the Arizona-map visualization)
    positions_path = DATA_PROCESSED / "bus_positions_synthetic.parquet"
    if positions_path.exists():
        bus_positions = pd.read_parquet(positions_path)
        bus_positions = bus_positions.set_index("name")
    else:
        print(f"  ⚠ No bus_positions_synthetic.parquet — map will fall back to graph view")
        bus_positions = None

    # Feature scaler
    with open(DATA_PROCESSED / "feature_scaler.pkl", "rb") as f:
        scaler = pickle.load(f)

    # XGBoost quantile models
    with open(CHECKPOINTS / "xgb_p10.pkl", "rb") as f:
        xgb_p10 = pickle.load(f)
    with open(CHECKPOINTS / "xgb_p50.pkl", "rb") as f:
        xgb_p50 = pickle.load(f)
    with open(CHECKPOINTS / "xgb_p90.pkl", "rb") as f:
        xgb_p90 = pickle.load(f)

    # Pre-computed metrics and scenario summary
    with open(DATA_PROCESSED / "metrics_summary.json") as f:
        metrics = json.load(f)
    try:
        with open(DATA_PROCESSED / "scenario_summary.json") as f:
            scenario_summary = json.load(f)
    except FileNotFoundError:
        scenario_summary = {}

    # Un-scale features to real units (for perturbation logic)
    n_time, n_bus, n_feat = X_scaled.shape
    X_real = scaler.inverse_transform(X_scaled.reshape(-1, n_feat)).reshape(n_time, n_bus, n_feat)

    # Load-bearing buses
    load_bearing_bus_idx = np.where(bus_meta["base_kw"].values > LOAD_BEARING_THRESHOLD)[0]

    STATE.update({
        "X_real": X_real,
        "X_scaled": X_scaled,
        "y_all": y_all,
        "valid_starts": valid_starts,
        "sample_ts": sample_ts,
        "weather": weather,
        "bus_meta": bus_meta,
        "edges": edges,
        "splits": splits,
        "graph": graph,
        "feature_names": feature_names,
        "scaler": scaler,
        "xgb_p10": xgb_p10,
        "xgb_p50": xgb_p50,
        "xgb_p90": xgb_p90,
        "metrics": metrics,
        "scenario_summary": scenario_summary,
        "load_bearing_bus_idx": load_bearing_bus_idx,
        "bus_positions": bus_positions,
        "n_time": n_time,
        "n_bus": n_bus,
        "n_feat": n_feat,
    })

    print(f"  ✅ Loaded feeder: {graph.num_nodes} buses, {graph.edge_index.shape[1]} directed edges")
    print(f"  ✅ Test samples: {len(splits['test'])}")
    print(f"  ✅ Load-bearing buses: {len(load_bearing_bus_idx)}")
    if bus_positions is not None:
        print(f"  ✅ Geographic positions: {len(bus_positions)} buses")
    print(f"  ✅ API ready on /docs")


# ───────────────────────────────────────────────────────────────
# Inference helpers
# ───────────────────────────────────────────────────────────────
def col_idx(name: str) -> int:
    return STATE["feature_names"].index(name)


def apply_perturbations(X_real: np.ndarray, temp_delta: float, ev_growth_pct: float) -> np.ndarray:
    """Apply temperature and EV perturbations to un-scaled feature tensor."""
    X = X_real.copy()
    idx_temp = col_idx("temp_f")
    idx_cdh = col_idx("cooling_degree_hours")
    idx_hw = col_idx("heatwave_day_counter")
    idx_load = col_idx("load_kw_history")
    idx_res = col_idx("frac_res")

    if temp_delta != 0:
        X[:, :, idx_temp] = X[:, :, idx_temp] + temp_delta
        X[:, :, idx_cdh] = np.maximum(0, X[:, :, idx_temp] - 65)

        hot_mask = (X[:, 0, idx_temp] > 110).astype(np.float32)
        counter = np.zeros_like(hot_mask)
        running = 0.0
        for t in range(len(hot_mask)):
            running = running + 1.0 / 24.0 if hot_mask[t] > 0 else 0.0
            counter[t] = running
        X[:, :, idx_hw] = counter[:, None]

    if ev_growth_pct != 0:
        residential_mask = X[0, :, idx_res] > 0.5
        res_bus_idx = np.where(residential_mask)[0]
        weather = STATE["weather"]
        hours_of_day = weather.index.hour.values
        evening_mask = (hours_of_day >= 18) & (hours_of_day <= 21)
        mult = np.ones((X.shape[0], X.shape[1]), dtype=np.float32)
        for b in res_bus_idx:
            mult[evening_mask, b] = 1.0 + ev_growth_pct / 100.0
        X[:, :, idx_load] = X[:, :, idx_load] * mult

    return X


def build_flat_for_sample(X_real: np.ndarray, sample_idx: int) -> np.ndarray:
    """Build flat (n_buses × 24, 39) matrix for one test sample."""
    n_feat = X_real.shape[-1]
    idx_load = col_idx("load_kw_history")
    X_scaled = STATE["scaler"].transform(X_real.reshape(-1, n_feat)).reshape(X_real.shape)

    valid_starts = STATE["valid_starts"]
    load_bearing = STATE["load_bearing_bus_idx"]

    forecast_start = valid_starts[sample_idx]
    hist = X_scaled[forecast_start - LOOKBACK_SHORT:forecast_start]
    hist_load = hist[:, :, idx_load]

    rows = []
    for b in load_bearing:
        bus_load_hist = hist_load[:, b]
        bus_static = X_scaled[forecast_start - 1, b, 11:14]
        for h in range(HORIZON):
            future_hour_idx = forecast_start + h
            weather_time = X_scaled[future_hour_idx, b, :11]
            feat = np.concatenate([bus_load_hist, weather_time, bus_static, [h / HORIZON]])
            rows.append(feat)
    return np.array(rows, dtype=np.float32)


def predict_flat(X_flat: np.ndarray) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """XGBoost inference on flat matrix. Returns (24, n_load_bus) arrays for P10/P50/P90."""
    p10 = STATE["xgb_p10"].predict(X_flat)
    p50 = STATE["xgb_p50"].predict(X_flat)
    p90 = STATE["xgb_p90"].predict(X_flat)

    # Enforce monotonicity
    stacked = np.stack([p10, p50, p90], axis=1)
    stacked.sort(axis=1)
    p10, p50, p90 = stacked[:, 0], stacked[:, 1], stacked[:, 2]

    n_load_bus = len(STATE["load_bearing_bus_idx"])
    p10 = np.maximum(p10.reshape(n_load_bus, HORIZON).T, 0)
    p50 = np.maximum(p50.reshape(n_load_bus, HORIZON).T, 0)
    p90 = np.maximum(p90.reshape(n_load_bus, HORIZON).T, 0)
    return p10, p50, p90


# ───────────────────────────────────────────────────────────────
# Schemas
# ───────────────────────────────────────────────────────────────
class ForecastRequest(BaseModel):
    sample_idx: int = Field(..., description="Test sample index (0 = first test sample)")
    temp_delta_f: float = Field(0.0, ge=-10, le=30, description="Temperature perturbation in °F")
    ev_growth_pct: float = Field(0.0, ge=0, le=100, description="EV evening load growth %")


class BusForecast(BaseModel):
    bus_name: str
    bus_full_idx: int
    base_kw: float
    frac_res: float
    frac_com: float
    p10: list[float]
    p50: list[float]
    p90: list[float]


class ForecastResponse(BaseModel):
    forecast_start: str
    baseline_temp_f: float
    effective_temp_f: float
    horizon_hours: int
    total_load_p50_kw: list[float]
    total_peak_kw: float
    total_peak_hour: int
    buses: list[BusForecast]
    n_stressed_buses: int
    stressed_bus_names: list[str]


class BusInfo(BaseModel):
    name: str
    full_idx: int
    base_kw: float
    frac_res: float
    frac_com: float
    frac_ind: float
    is_load_bearing: bool
    lat: float | None = None
    lon: float | None = None


class TopologyEdge(BaseModel):
    bus1: str
    bus2: str
    kind: str
    length: float


class TopologyResponse(BaseModel):
    buses: list[BusInfo]
    edges: list[TopologyEdge]
    n_buses: int
    n_load_bearing: int


# ───────────────────────────────────────────────────────────────
# Endpoints
# ───────────────────────────────────────────────────────────────
@app.get("/health")
def health():
    """Service health check."""
    return {"status": "ok", "loaded": bool(STATE), "n_buses": STATE.get("n_bus", 0)}


@app.get("/topology", response_model=TopologyResponse)
def topology():
    """Full feeder topology — buses + edges."""
    graph = STATE["graph"]
    bus_meta = STATE["bus_meta"]
    edges_df = STATE["edges"]
    load_bearing_set = set(int(i) for i in STATE["load_bearing_bus_idx"])
    bus_positions = STATE.get("bus_positions")

    buses = []
    for i in range(graph.num_nodes):
        name = graph.bus_names[i]
        lat, lon = None, None
        if bus_positions is not None and name in bus_positions.index:
            lat = float(bus_positions.loc[name, "lat"])
            lon = float(bus_positions.loc[name, "lon"])
        buses.append(BusInfo(
            name=name,
            full_idx=i,
            base_kw=float(bus_meta.iloc[i]["base_kw"]),
            frac_res=float(bus_meta.iloc[i]["frac_res"]),
            frac_com=float(bus_meta.iloc[i]["frac_com"]),
            frac_ind=float(bus_meta.iloc[i]["frac_ind"]),
            is_load_bearing=i in load_bearing_set,
            lat=lat,
            lon=lon,
        ))

    edges = [
        TopologyEdge(
            bus1=str(row["bus1"]),
            bus2=str(row["bus2"]),
            kind=str(row.get("kind", "line")),
            length=float(row["length"]),
        )
        for _, row in edges_df.iterrows()
    ]

    return TopologyResponse(
        buses=buses,
        edges=edges,
        n_buses=graph.num_nodes,
        n_load_bearing=len(load_bearing_set),
    )


@app.get("/samples")
def list_samples(limit: int = 50):
    """Return a curated set of forecast-start times spanning baseline + extreme days.

    Mix of ~15 hottest days (July 2023 heatwave), ~5 coldest (winter extremes),
    and recent test-set samples so judges can pick any kind of day.
    """
    sample_ts = STATE["sample_ts"]
    weather = STATE["weather"]
    tz = weather.index.tz

    # Look up temperatures for ALL valid forecast-starts
    all_ts = pd.to_datetime(sample_ts["forecast_start"].values, utc=True).tz_convert(tz)
    all_temps = weather.loc[all_ts, "temp_f"].values

    records: list[dict] = []
    seen: set[int] = set()

    def add_sample(idx: int, label: str):
        if idx in seen:
            return
        seen.add(idx)
        records.append({
            "sample_idx": int(idx),
            "forecast_start_iso": all_ts[idx].isoformat(),
            "baseline_temp_f": float(all_temps[idx]),
            "label": label,
        })

    # 1. Top 15 hottest — July 2023 heatwave days
    hot_order = np.argsort(-all_temps)[:15]
    for i in hot_order:
        add_sample(int(i), "heatwave")

    # 2. Top 5 coldest — winter context
    cold_order = np.argsort(all_temps)[:5]
    for i in cold_order:
        add_sample(int(i), "cold")

    # 3. Fill remainder with most-recent test samples
    remaining = max(limit - len(records), 0)
    test_idx = STATE["splits"]["test"]
    recent = sample_ts.loc[test_idx].copy()
    recent["forecast_start"] = pd.to_datetime(recent["forecast_start"])
    recent = recent.sort_values("forecast_start", ascending=False).head(remaining * 2)

    for orig_idx, row in recent.iterrows():
        if int(orig_idx) in seen:
            continue
        add_sample(int(orig_idx), "recent")
        if len(records) >= limit:
            break

    return records[:limit]


@app.post("/forecast", response_model=ForecastResponse)
def forecast(req: ForecastRequest):
    """Run a forecast with optional scenario perturbation."""
    valid_starts = STATE["valid_starts"]
    sample_ts = STATE["sample_ts"]
    weather = STATE["weather"]

    if req.sample_idx < 0 or req.sample_idx >= len(valid_starts):
        raise HTTPException(status_code=400, detail=f"sample_idx {req.sample_idx} out of range")

    # Apply perturbations (or not)
    if req.temp_delta_f == 0 and req.ev_growth_pct == 0:
        X = STATE["X_real"]
    else:
        X = apply_perturbations(STATE["X_real"], req.temp_delta_f, req.ev_growth_pct)

    # Inference
    X_flat = build_flat_for_sample(X, req.sample_idx)
    p10, p50, p90 = predict_flat(X_flat)  # each (24, n_load_bus)

    # Baseline for stress comparison (if perturbation active)
    if req.temp_delta_f != 0 or req.ev_growth_pct != 0:
        X_flat_base = build_flat_for_sample(STATE["X_real"], req.sample_idx)
        _, base_p50, _ = predict_flat(X_flat_base)
        stressed_per_bus_uplift = (p50.max(axis=0) / np.maximum(base_p50.max(axis=0), 1.0) - 1) * 100
        stressed_mask = stressed_per_bus_uplift > 5.0
    else:
        stressed_mask = np.zeros(p50.shape[1], dtype=bool)

    # Build response
    load_bearing = STATE["load_bearing_bus_idx"]
    graph = STATE["graph"]
    bus_meta = STATE["bus_meta"]

    forecast_start_ts = sample_ts.iloc[req.sample_idx]["forecast_start"]
    tz = weather.index.tz
    forecast_start_aware = pd.to_datetime(forecast_start_ts, utc=True).tz_convert(tz)
    baseline_temp = float(weather.loc[forecast_start_aware, "temp_f"])

    total_p50 = p50.sum(axis=1)
    bus_forecasts = []
    stressed_names = []
    for i, full_b in enumerate(load_bearing):
        bus_name = graph.bus_names[int(full_b)]
        bus_row = bus_meta.iloc[int(full_b)]
        bus_forecasts.append(BusForecast(
            bus_name=bus_name,
            bus_full_idx=int(full_b),
            base_kw=float(bus_row["base_kw"]),
            frac_res=float(bus_row["frac_res"]),
            frac_com=float(bus_row["frac_com"]),
            p10=[float(x) for x in p10[:, i]],
            p50=[float(x) for x in p50[:, i]],
            p90=[float(x) for x in p90[:, i]],
        ))
        if stressed_mask[i]:
            stressed_names.append(bus_name)

    return ForecastResponse(
        forecast_start=forecast_start_aware.isoformat(),
        baseline_temp_f=baseline_temp,
        effective_temp_f=baseline_temp + req.temp_delta_f,
        horizon_hours=HORIZON,
        total_load_p50_kw=[float(x) for x in total_p50],
        total_peak_kw=float(total_p50.max()),
        total_peak_hour=int(total_p50.argmax()),
        buses=bus_forecasts,
        n_stressed_buses=int(stressed_mask.sum()),
        stressed_bus_names=stressed_names,
    )


@app.get("/metrics")
def metrics():
    """Return pre-computed model evaluation metrics."""
    return STATE["metrics"]


@app.get("/scenarios/summary")
def scenarios_summary():
    """Return pre-computed 5-scenario summary from Notebook 07."""
    return STATE["scenario_summary"]
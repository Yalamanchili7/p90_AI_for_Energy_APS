"""
P90 — Feeder Stress Dashboard
Streamlit UI for per-bus load forecasts and stress scenario exploration.

Run from the repo root with:
    streamlit run src/ui/app.py

The app loads all pre-computed artifacts from data/processed/ and checkpoints/,
so no training happens at runtime. Interactive scenario sliders perform inference
on the pre-trained XGBoost models in real-time (< 500 ms per scenario).
"""

from __future__ import annotations

import json
import pickle
from pathlib import Path
from typing import Tuple

import numpy as np
import pandas as pd
import plotly.graph_objects as go
import streamlit as st
import torch
from plotly.subplots import make_subplots


# ──────────────────────────────────────────────────────────────────────
# Paths
# ──────────────────────────────────────────────────────────────────────
REPO_ROOT = Path(__file__).resolve().parent.parent.parent
DATA_PROCESSED = REPO_ROOT / "data" / "processed"
CHECKPOINTS = REPO_ROOT / "checkpoints"


# ──────────────────────────────────────────────────────────────────────
# Page config
# ──────────────────────────────────────────────────────────────────────
st.set_page_config(
    page_title="P90 — Feeder Stress Dashboard",
    page_icon="⚡",
    layout="wide",
    initial_sidebar_state="expanded",
)

# Styling tweaks
st.markdown(
    """
    <style>
        .stApp header { display: none; }
        .big-metric { font-size: 2.2rem; font-weight: 700; color: #1F3A5F; }
        .metric-label { font-size: 0.9rem; color: #666; text-transform: uppercase; }
        .stress-badge {
            display: inline-block; padding: 0.25rem 0.6rem; border-radius: 0.4rem;
            font-size: 0.85rem; font-weight: 600;
        }
        .stress-low    { background: #D4F4DD; color: #0E6B2F; }
        .stress-medium { background: #FFF0C4; color: #8A5A00; }
        .stress-high   { background: #F9C9C9; color: #8B1A1A; }
    </style>
    """,
    unsafe_allow_html=True,
)


# ──────────────────────────────────────────────────────────────────────
# Data loading (cached)
# ──────────────────────────────────────────────────────────────────────
@st.cache_resource
def load_everything():
    """Load all artifacts once at app startup. Cached across reruns."""
    # Core tensors (scaled and real)
    X_full_scaled = np.load(DATA_PROCESSED / "features_X_full.npy")
    y_all = np.load(DATA_PROCESSED / "targets_y.npy")
    valid_starts = np.load(DATA_PROCESSED / "valid_starts.npy")

    # Metadata
    sample_ts = pd.read_parquet(DATA_PROCESSED / "sample_timestamps.parquet")
    weather = pd.read_parquet(DATA_PROCESSED / "weather.parquet")
    bus_meta = pd.read_parquet(DATA_PROCESSED / "bus_metadata_ieee34.parquet")
    edges = pd.read_parquet(DATA_PROCESSED / "edges_ieee34.parquet")

    splits = np.load(DATA_PROCESSED / "split_indices.npz")

    # Graph + feature names
    graph = torch.load(DATA_PROCESSED / "graph_ieee34.pt", weights_only=False)
    feature_names = (DATA_PROCESSED / "feature_names.txt").read_text().strip().split("\n")

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

    # Metrics and scenario summaries from previous notebooks
    with open(DATA_PROCESSED / "metrics_summary.json") as f:
        metrics = json.load(f)
    with open(DATA_PROCESSED / "scenario_summary.json") as f:
        scenario_summary = json.load(f)

    # Load-bearing buses
    LOAD_BEARING_THRESHOLD = 5.0
    load_bearing_bus_idx = np.where(bus_meta["base_kw"].values > LOAD_BEARING_THRESHOLD)[0]

    # Unscale X_full back to real units (so we can perturb in real units)
    n_time, n_bus, n_feat = X_full_scaled.shape
    X_full_real = scaler.inverse_transform(
        X_full_scaled.reshape(-1, n_feat)
    ).reshape(n_time, n_bus, n_feat)

    return {
        "X_full_real": X_full_real,
        "X_full_scaled": X_full_scaled,
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
        "n_time": n_time,
        "n_bus": n_bus,
        "n_feat": n_feat,
    }


# ──────────────────────────────────────────────────────────────────────
# Inference helpers
# ──────────────────────────────────────────────────────────────────────
HORIZON = 24
LOOKBACK_SHORT = 24  # XGBoost uses 24h of history features


def _col_idx(feature_names, name):
    return feature_names.index(name)


def apply_perturbations(X_full_real, temp_delta: float, ev_growth_pct: float, feature_names, weather):
    """Apply temperature and EV perturbations in real units.

    - temp_delta: °F added to temp_f column; cooling_degree_hours and heatwave_counter recomputed
    - ev_growth_pct: % boost to load_kw_history on residential buses during evening hours (6-9 PM)
    """
    X = X_full_real.copy()

    idx_temp = _col_idx(feature_names, "temp_f")
    idx_cdh = _col_idx(feature_names, "cooling_degree_hours")
    idx_hw = _col_idx(feature_names, "heatwave_day_counter")
    idx_load = _col_idx(feature_names, "load_kw_history")
    idx_res = _col_idx(feature_names, "frac_res")

    # Heat perturbation
    if temp_delta != 0:
        X[:, :, idx_temp] = X[:, :, idx_temp] + temp_delta
        X[:, :, idx_cdh] = np.maximum(0, X[:, :, idx_temp] - 65)

        # Recompute heatwave counter
        hot_mask = (X[:, 0, idx_temp] > 110).astype(np.float32)
        counter = np.zeros_like(hot_mask)
        running = 0.0
        for t in range(len(hot_mask)):
            if hot_mask[t] > 0:
                running += 1.0 / 24.0
            else:
                running = 0.0
            counter[t] = running
        X[:, :, idx_hw] = counter[:, None]

    # EV perturbation
    if ev_growth_pct != 0:
        residential_mask = X[0, :, idx_res] > 0.5
        res_bus_idx = np.where(residential_mask)[0]
        hours_of_day = weather.index.hour.values
        evening_mask = (hours_of_day >= 18) & (hours_of_day <= 21)
        mult = np.ones((X.shape[0], X.shape[1]), dtype=np.float32)
        for b in res_bus_idx:
            mult[evening_mask, b] = 1.0 + ev_growth_pct / 100.0
        X[:, :, idx_load] = X[:, :, idx_load] * mult

    return X


def build_flat_for_sample(X_full_real, valid_starts, sample_idx, load_bearing_bus_idx, scaler, feature_names):
    """Build the flat (n_buses × 24, 39) matrix for a single test sample."""
    n_feat = X_full_real.shape[-1]
    idx_load = _col_idx(feature_names, "load_kw_history")

    # Re-scale (model was trained on scaled data)
    X_scaled = scaler.transform(X_full_real.reshape(-1, n_feat)).reshape(X_full_real.shape)

    forecast_start = valid_starts[sample_idx]
    hist = X_scaled[forecast_start - LOOKBACK_SHORT : forecast_start]
    hist_load = hist[:, :, idx_load]

    rows = []
    for b in load_bearing_bus_idx:
        bus_load_hist = hist_load[:, b]
        bus_static = X_scaled[forecast_start - 1, b, 11:14]
        for h in range(HORIZON):
            future_hour_idx = forecast_start + h
            weather_time = X_scaled[future_hour_idx, b, :11]
            feat = np.concatenate(
                [bus_load_hist, weather_time, bus_static, [h / HORIZON]]
            )
            rows.append(feat)
    return np.array(rows, dtype=np.float32)


def predict_sample(X_flat, xgb_p10, xgb_p50, xgb_p90, n_load_bus):
    """Run XGBoost inference on flat matrix, return (24, n_load_bus) P10/P50/P90 arrays."""
    p10 = xgb_p10.predict(X_flat)
    p50 = xgb_p50.predict(X_flat)
    p90 = xgb_p90.predict(X_flat)

    # Enforce monotonic quantile order
    stacked = np.stack([p10, p50, p90], axis=1)
    stacked.sort(axis=1)
    p10, p50, p90 = stacked[:, 0], stacked[:, 1], stacked[:, 2]

    # Reshape (n_bus × 24) -> (24, n_bus)
    p10 = np.maximum(p10.reshape(n_load_bus, HORIZON).T, 0)
    p50 = np.maximum(p50.reshape(n_load_bus, HORIZON).T, 0)
    p90 = np.maximum(p90.reshape(n_load_bus, HORIZON).T, 0)
    return p10, p50, p90


# ──────────────────────────────────────────────────────────────────────
# Intervention recommender
# ──────────────────────────────────────────────────────────────────────
def recommend_interventions(
    baseline_p50, stressed_p50, bus_names, bus_meta, load_bearing_bus_idx, top_n=5
):
    """Rules-based intervention recommender.

    Returns a list of (bus_name, severity, reason, intervention) tuples.
    """
    # Per-bus peak uplift
    baseline_peak = baseline_p50.max(axis=0)  # (n_load_bus,)
    stressed_peak = stressed_p50.max(axis=0)
    uplift_pct = (stressed_peak - baseline_peak) / np.maximum(baseline_peak, 1.0) * 100
    uplift_kw = stressed_peak - baseline_peak

    bus_meta_load = bus_meta.iloc[load_bearing_bus_idx].reset_index(drop=True)

    records = []
    for i in range(len(load_bearing_bus_idx)):
        if stressed_peak[i] < 20:  # too-small buses ignored
            continue

        bus_name = bus_names[load_bearing_bus_idx[i]]
        frac_res = bus_meta_load.iloc[i]["frac_res"]
        uplift = float(uplift_pct[i])
        uplift_abs = float(uplift_kw[i])

        # Severity tier
        if uplift > 15:
            severity = "high"
        elif uplift > 7:
            severity = "medium"
        elif uplift > 2:
            severity = "low"
        else:
            continue  # no meaningful change

        # Intervention selection (rules)
        if frac_res > 0.7:
            intervention = "Trigger demand response in enrolled residential customers"
            reason = f"Residential-dominant bus ({frac_res*100:.0f}%), evening/peak exposure"
        elif frac_res < 0.4:
            intervention = "Pre-notify commercial/industrial customers; pre-cool thermal mass"
            reason = f"Commercial-heavy bus ({(1-frac_res)*100:.0f}%), controllable thermal load"
        else:
            intervention = "Circuit-level Conservation Voltage Reduction (CVR) 2-4% on upstream line"
            reason = "Mixed customer mix; CVR affects all customers without interruption"

        records.append(
            {
                "bus": bus_name,
                "severity": severity,
                "peak_baseline_kw": float(baseline_peak[i]),
                "peak_stressed_kw": float(stressed_peak[i]),
                "uplift_pct": uplift,
                "uplift_kw": uplift_abs,
                "reason": reason,
                "intervention": intervention,
            }
        )

    # Sort by absolute uplift (kW) — biggest absolute impact first
    records.sort(key=lambda r: r["uplift_kw"], reverse=True)
    return records[:top_n]


# ──────────────────────────────────────────────────────────────────────
# Plot builders
# ──────────────────────────────────────────────────────────────────────
def make_feeder_map(graph, bus_names, edges, per_bus_load, selected_bus_idx=None,
                    color_label="Peak load (kW)"):
    """Build a Plotly feeder topology map colored by per-bus load."""
    import networkx as nx
    from torch_geometric.utils import to_networkx

    G_nx = to_networkx(graph, to_undirected=True)
    pos = nx.spring_layout(G_nx, seed=42, k=2.0 / np.sqrt(graph.num_nodes))

    # Edge trace
    edge_x, edge_y = [], []
    for u, v in G_nx.edges():
        x0, y0 = pos[u]
        x1, y1 = pos[v]
        edge_x.extend([x0, x1, None])
        edge_y.extend([y0, y1, None])

    edge_trace = go.Scatter(
        x=edge_x, y=edge_y,
        line=dict(width=1, color="#888"),
        hoverinfo="none",
        mode="lines",
        showlegend=False,
    )

    # Node trace
    node_x, node_y, node_colors, node_text = [], [], [], []
    node_sizes = []
    for i in range(graph.num_nodes):
        node_x.append(pos[i][0])
        node_y.append(pos[i][1])
        load = per_bus_load[i] if per_bus_load[i] is not None else 0
        node_colors.append(load)
        size = 14 + min(28, np.sqrt(max(load, 0)) / 2)
        if selected_bus_idx is not None and i == selected_bus_idx:
            size = 32
        node_sizes.append(size)
        node_text.append(f"<b>Bus {bus_names[i]}</b><br>Peak load: {load:.0f} kW")

    node_trace = go.Scatter(
        x=node_x, y=node_y,
        mode="markers+text",
        text=[bus_names[i] for i in range(graph.num_nodes)],
        textposition="top center",
        textfont=dict(size=8, color="#333"),
        marker=dict(
            size=node_sizes,
            color=node_colors,
            colorscale="YlOrRd",
            showscale=True,
            colorbar=dict(title=color_label, thickness=14, len=0.7),
            line=dict(width=1, color="#333"),
        ),
        hovertext=node_text,
        hoverinfo="text",
        showlegend=False,
    )

    fig = go.Figure(data=[edge_trace, node_trace])
    fig.update_layout(
        title=None,
        showlegend=False,
        hovermode="closest",
        margin=dict(b=0, l=0, r=0, t=10),
        xaxis=dict(showgrid=False, zeroline=False, showticklabels=False),
        yaxis=dict(showgrid=False, zeroline=False, showticklabels=False),
        height=500,
        plot_bgcolor="white",
    )
    return fig


def make_forecast_plot(p10, p50, p90, actual=None, title=""):
    """24h forecast plot with P10-P90 band for a single bus."""
    hours = np.arange(HORIZON)
    fig = go.Figure()

    # P90 upper
    fig.add_trace(go.Scatter(
        x=hours, y=p90, mode="lines", line=dict(width=0),
        showlegend=False, hoverinfo="skip",
    ))
    # P10 lower with fill to P90
    fig.add_trace(go.Scatter(
        x=hours, y=p10, mode="lines", line=dict(width=0),
        fill="tonexty", fillcolor="rgba(31, 58, 95, 0.25)",
        name="P10–P90 uncertainty", hoverinfo="skip",
    ))
    # P50 median
    fig.add_trace(go.Scatter(
        x=hours, y=p50, mode="lines", line=dict(color="#1F3A5F", width=3),
        name="P50 forecast",
        hovertemplate="Hour +%{x}<br>P50: %{y:.1f} kW<extra></extra>",
    ))
    if actual is not None:
        fig.add_trace(go.Scatter(
            x=hours, y=actual, mode="lines", line=dict(color="#E24B4A", width=2, dash="dash"),
            name="Actual",
            hovertemplate="Hour +%{x}<br>Actual: %{y:.1f} kW<extra></extra>",
        ))
    fig.update_layout(
        title=title,
        xaxis_title="Hour ahead",
        yaxis_title="Load (kW)",
        hovermode="x unified",
        height=350,
        margin=dict(t=40, r=20),
        legend=dict(x=0.01, y=0.99),
    )
    return fig


def make_total_load_plot(scenarios_p50, scenario_labels, colors):
    """Total feeder load comparison across scenarios, for the selected sample."""
    hours = np.arange(HORIZON)
    fig = go.Figure()
    for lbl, p50 in zip(scenario_labels, scenarios_p50):
        total = p50.sum(axis=1)
        fig.add_trace(go.Scatter(
            x=hours, y=total, mode="lines+markers",
            line=dict(color=colors[lbl], width=2.5),
            marker=dict(size=6),
            name=lbl,
        ))
    fig.update_layout(
        xaxis_title="Hour ahead",
        yaxis_title="Total feeder load (kW)",
        hovermode="x unified",
        height=320,
        margin=dict(t=20, r=20, b=40),
    )
    return fig


# ──────────────────────────────────────────────────────────────────────
# Main app
# ──────────────────────────────────────────────────────────────────────
def main():
    # Header
    col1, col2 = st.columns([0.1, 0.9])
    with col1:
        st.markdown("# ⚡")
    with col2:
        st.markdown(
            "### P90 — Feeder Stress Dashboard\n"
            "<span style='color:#666; font-size:0.95rem'>IEEE 34-bus (Arizona) — 24-hour forecasts, stress scenarios, and recommended interventions</span>",
            unsafe_allow_html=True,
        )
    st.markdown("---")

    # Load everything
    with st.spinner("Loading pre-trained models and cached data..."):
        data = load_everything()

    graph = data["graph"]
    bus_names = graph.bus_names
    bus_meta = data["bus_meta"]
    edges = data["edges"]
    load_bearing_bus_idx = data["load_bearing_bus_idx"]
    n_load_bus = len(load_bearing_bus_idx)
    scaler = data["scaler"]
    weather = data["weather"]
    feature_names = data["feature_names"]
    sample_ts = data["sample_ts"]
    splits = data["splits"]

    # ──────────── Sidebar: controls ────────────
    st.sidebar.markdown("### 🎛 Scenario controls")
    temp_delta = st.sidebar.slider(
        "Temperature perturbation (°F)", -5, 25, 0, step=1,
        help="Add this many °F to every hour's temperature. Heatwave counter + cooling degree hours auto-recomputed."
    )
    ev_growth = st.sidebar.slider(
        "EV evening growth (%)", 0, 100, 0, step=5,
        help="Boost residential-bus evening (6-9 PM) load history by this percentage."
    )
    st.sidebar.markdown("---")
    st.sidebar.markdown("### 📅 Forecast start")
    test_idx_arr = splits["test"]
    test_ts = pd.to_datetime(sample_ts.loc[test_idx_arr, "forecast_start"].values, utc=True).tz_convert(weather.index.tz)
    test_temps = weather.loc[test_ts, "temp_f"].values

    sample_option = st.sidebar.selectbox(
        "Pick a test sample",
        options=list(range(len(test_idx_arr))),
        index=0,
        format_func=lambda i: f"{pd.Timestamp(test_ts[i]).strftime('%Y-%m-%d %H:%M')} ({test_temps[i]:.0f}°F)",
    )
    selected_sample_idx = int(test_idx_arr[sample_option])
    selected_ts = pd.Timestamp(test_ts[sample_option])
    baseline_temp = test_temps[sample_option]

    # ──────────── Compute scenarios ────────────
    # Baseline (no perturbation)
    X_real = data["X_full_real"]

    X_baseline_flat = build_flat_for_sample(
        X_real, data["valid_starts"], selected_sample_idx,
        load_bearing_bus_idx, scaler, feature_names,
    )
    base_p10, base_p50, base_p90 = predict_sample(
        X_baseline_flat, data["xgb_p10"], data["xgb_p50"], data["xgb_p90"], n_load_bus
    )

    # Stressed (user's slider values)
    if temp_delta == 0 and ev_growth == 0:
        stress_p10, stress_p50, stress_p90 = base_p10, base_p50, base_p90
    else:
        X_stressed = apply_perturbations(X_real, temp_delta, ev_growth, feature_names, weather)
        X_stress_flat = build_flat_for_sample(
            X_stressed, data["valid_starts"], selected_sample_idx,
            load_bearing_bus_idx, scaler, feature_names,
        )
        stress_p10, stress_p50, stress_p90 = predict_sample(
            X_stress_flat, data["xgb_p10"], data["xgb_p50"], data["xgb_p90"], n_load_bus
        )

    # ──────────── Top metrics strip ────────────
    mcol1, mcol2, mcol3, mcol4 = st.columns(4)
    baseline_peak = base_p50.sum(axis=1).max()
    stressed_peak = stress_p50.sum(axis=1).max()
    delta_pct = (stressed_peak / baseline_peak - 1) * 100 if baseline_peak > 0 else 0
    delta_kw = stressed_peak - baseline_peak

    n_stressed_buses = int(
        ((stress_p50.max(axis=0) / np.maximum(base_p50.max(axis=0), 1.0) - 1) * 100 > 5).sum()
    )

    with mcol1:
        st.markdown(f"<div class='metric-label'>Forecast for</div>", unsafe_allow_html=True)
        st.markdown(f"<div class='big-metric' style='font-size:1.3rem;'>{selected_ts.strftime('%b %d, %Y %H:%M')}</div>", unsafe_allow_html=True)
        st.caption(f"Baseline temp: {baseline_temp:.0f}°F")
    with mcol2:
        st.markdown(f"<div class='metric-label'>Baseline peak</div>", unsafe_allow_html=True)
        st.markdown(f"<div class='big-metric'>{baseline_peak:,.0f} <span style='font-size:1rem;color:#666'>kW</span></div>", unsafe_allow_html=True)
    with mcol3:
        st.markdown(f"<div class='metric-label'>Stressed peak</div>", unsafe_allow_html=True)
        arrow = "↑" if delta_kw > 0 else ("↓" if delta_kw < 0 else "→")
        color = "#E24B4A" if delta_kw > 0 else "#0E6B2F"
        st.markdown(
            f"<div class='big-metric'>{stressed_peak:,.0f} <span style='font-size:1rem;color:{color}'>{arrow}{abs(delta_pct):.1f}%</span></div>",
            unsafe_allow_html=True,
        )
    with mcol4:
        st.markdown(f"<div class='metric-label'>Buses stressed (&gt;5% peak uplift)</div>", unsafe_allow_html=True)
        st.markdown(f"<div class='big-metric'>{n_stressed_buses} <span style='font-size:1rem;color:#666'>of {n_load_bus}</span></div>", unsafe_allow_html=True)

    st.markdown("---")

    # ──────────── Main two-column layout ────────────
    col_map, col_right = st.columns([0.55, 0.45])

    # Full per-bus peak loads (all 37 buses, NaN for non-load-bearing)
    per_bus_peak = np.zeros(graph.num_nodes)
    for i, b in enumerate(load_bearing_bus_idx):
        per_bus_peak[b] = stress_p50.max(axis=0)[i]

    with col_map:
        st.markdown("#### Feeder topology — peak load by bus")
        st.caption("Circle size + color = peak P50 load under current scenario. Hover for details.")
        fig_map = make_feeder_map(graph, bus_names, edges, per_bus_peak)
        st.plotly_chart(fig_map, use_container_width=True)

    with col_right:
        st.markdown("#### Scenario comparison — total feeder load")
        st.caption("Stress effect on total feeder load for the 24-hour forecast horizon.")
        fig_total = make_total_load_plot(
            scenarios_p50=[base_p50, stress_p50],
            scenario_labels=["Baseline", "Stressed"],
            colors={"Baseline": "#1F3A5F", "Stressed": "#E24B4A"},
        )
        st.plotly_chart(fig_total, use_container_width=True)

        st.markdown("#### Scenario summary")
        summary_table = pd.DataFrame(
            [
                {"Metric": "Peak load (kW)", "Baseline": f"{baseline_peak:,.0f}", "Stressed": f"{stressed_peak:,.0f}",
                 "Δ": f"{delta_pct:+.1f}%"},
                {"Metric": "Mean load (kW)", "Baseline": f"{base_p50.sum(axis=1).mean():,.0f}",
                 "Stressed": f"{stress_p50.sum(axis=1).mean():,.0f}",
                 "Δ": f"{(stress_p50.sum(axis=1).mean() / base_p50.sum(axis=1).mean() - 1) * 100:+.1f}%"},
                {"Metric": "Stressed buses", "Baseline": "0", "Stressed": f"{n_stressed_buses}",
                 "Δ": f"of {n_load_bus}"},
            ]
        )
        st.dataframe(summary_table, use_container_width=True, hide_index=True)

    st.markdown("---")

    # ──────────── Bus drill-down ────────────
    st.markdown("### 🔍 Bus drill-down")
    top_buses_by_size = bus_meta.iloc[load_bearing_bus_idx].sort_values("base_kw", ascending=False)
    bus_choices = top_buses_by_size["name"].tolist()

    drill_col1, drill_col2 = st.columns([0.25, 0.75])
    with drill_col1:
        selected_bus_name = st.selectbox("Pick a bus", bus_choices, index=0)
        selected_bus_row = bus_meta[bus_meta["name"] == selected_bus_name].iloc[0]
        selected_bus_full_idx = bus_names.index(selected_bus_name)
        selected_bus_position = np.where(load_bearing_bus_idx == selected_bus_full_idx)[0][0]

        st.markdown(f"**Base load:** {selected_bus_row['base_kw']:.0f} kW")
        st.markdown(f"**Customer mix:**")
        st.markdown(f"- Residential: {selected_bus_row['frac_res']*100:.0f}%")
        st.markdown(f"- Commercial: {selected_bus_row['frac_com']*100:.0f}%")
        st.markdown(f"- Industrial: {selected_bus_row['frac_ind']*100:.0f}%")

    with drill_col2:
        fig_bus = go.Figure()
        hours = np.arange(HORIZON)

        # Baseline forecast
        fig_bus.add_trace(go.Scatter(
            x=hours, y=base_p90[:, selected_bus_position], mode="lines", line=dict(width=0),
            showlegend=False, hoverinfo="skip",
        ))
        fig_bus.add_trace(go.Scatter(
            x=hours, y=base_p10[:, selected_bus_position], mode="lines", line=dict(width=0),
            fill="tonexty", fillcolor="rgba(31,58,95,0.2)",
            name="Baseline P10–P90", hoverinfo="skip",
        ))
        fig_bus.add_trace(go.Scatter(
            x=hours, y=base_p50[:, selected_bus_position], mode="lines",
            line=dict(color="#1F3A5F", width=3),
            name="Baseline P50",
            hovertemplate="Hour +%{x}<br>Baseline P50: %{y:.1f} kW<extra></extra>",
        ))

        # Stressed forecast (if different)
        if temp_delta != 0 or ev_growth != 0:
            fig_bus.add_trace(go.Scatter(
                x=hours, y=stress_p50[:, selected_bus_position], mode="lines",
                line=dict(color="#E24B4A", width=3, dash="dash"),
                name="Stressed P50",
                hovertemplate="Hour +%{x}<br>Stressed P50: %{y:.1f} kW<extra></extra>",
            ))

        fig_bus.update_layout(
            title=f"Bus {selected_bus_name} — 24-hour forecast",
            xaxis_title="Hour ahead",
            yaxis_title="Load (kW)",
            height=380,
            hovermode="x unified",
        )
        st.plotly_chart(fig_bus, use_container_width=True)

    st.markdown("---")

    # ──────────── Intervention recommendations ────────────
    st.markdown("### 🛠 Recommended interventions")
    if temp_delta == 0 and ev_growth == 0:
        st.info("Set the scenario sliders in the sidebar to see interventions for stressed buses.")
    else:
        interventions = recommend_interventions(
            base_p50, stress_p50, bus_names, bus_meta, load_bearing_bus_idx, top_n=5
        )
        if not interventions:
            st.success("No material bus-level stress under the current scenario — all buses within 2% of baseline peak.")
        else:
            for r in interventions:
                badge = f"<span class='stress-badge stress-{r['severity']}'>{r['severity'].upper()}</span>"
                col_a, col_b = st.columns([0.3, 0.7])
                with col_a:
                    st.markdown(f"**Bus {r['bus']}** — {badge}", unsafe_allow_html=True)
                    st.caption(f"Peak: {r['peak_baseline_kw']:.0f} → {r['peak_stressed_kw']:.0f} kW ({r['uplift_pct']:+.1f}%)")
                with col_b:
                    st.markdown(f"**Recommended:** {r['intervention']}")
                    st.caption(f"Reason: {r['reason']}")
                st.markdown("---")

    # ──────────── Footer: model provenance ────────────
    with st.expander("ℹ️  Model provenance and evaluation"):
        metrics = data["metrics"]
        st.markdown(
            f"""
**Primary model:** XGBoost quantile regression (P10/P50/P90 ensemble)
**Architecture:** Three independent XGBoost regressors with `reg:quantileerror` objective
**Training data:** 2 years (2023–2024) synthesized per-bus load, real NOAA + NREL NSRDB Phoenix weather
**Feeder:** IEEE 34-bus — designated by IEEE PES as an actual Arizona distribution feeder

**Headline test metrics (held-out 2024-11-16 → 2024-12-31):**
- P50 MAPE: **{metrics['overall']['p50_mape_pct']:.2f}%**
- Weighted MAPE: **{metrics['overall']['p50_wmape_pct']:.2f}%**
- MAE: **{metrics['overall']['p50_mae_kw']:.2f} kW**
- P80 interval coverage: **{metrics['overall']['p80_coverage']*100:.1f}%**  (target 80%)

**Stress performance:**
- Hot hours (top 10% temp): {metrics['stress_stratified']['hot_hours']['p50_mape_pct']:.2f}% MAPE
- Evening peak (6–9 PM): {metrics['stress_stratified']['evening_peak']['p50_mape_pct']:.2f}% MAPE

**Ablation:** We also trained a 28K-parameter spatio-temporal GCN (GRU → 2× GCN → quantile heads). On this radial feeder, XGBoost outperformed the GCN (17.4% MAPE). We ship what works; the GCN code is in the repo for meshed/larger network experiments.
            """
        )


if __name__ == "__main__":
    main()
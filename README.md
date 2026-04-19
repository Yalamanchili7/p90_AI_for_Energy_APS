# P90 — Spatio-Temporal AI for an APS-like Distribution Grid

ASU Energy Hackathon submission. A graph-based quantile load forecaster for a realistic APS-like distribution feeder, paired with a counterfactual decision layer that lets utility planners simulate interventions under extreme-heat and EV-peak stress.

## What it does

- **Forecasting.** Hourly 24-hour-ahead load forecasts at every bus on the IEEE 123-bus feeder, output as quantile bands (P50 / P90 / P99) — utilities plan to risk, not averages.
- **Scenarios.** Baseline vs. stressed operation under extreme-heat and EV-evening-peak-growth scenarios, showing where and when the grid becomes constrained.
- **Decisions.** A dashboard that ranks feeders and time windows by exceedance risk and lets a planner ask "if I curtail X MW on feeder Y at hour T, which violations disappear?"

## Stack

- **Modeling:** PyTorch + PyTorch Geometric (spatio-temporal GNN with quantile head)
- **Power system:** OpenDSS (IEEE 123-bus test feeder)
- **Data:** NREL SMART-DS feeder traces, NREL EVI-Pro EV profiles, NOAA Phoenix hourly weather
- **Serving:** FastAPI
- **Dashboard:** React

## Repo layout

```
data/         Raw and processed data (gitignored)
grid/         OpenDSS feeder files
src/p90/      Python package (data, models, train, scenarios, decisions)
checkpoints/  Trained model weights
api/          FastAPI backend
dashboard/    React frontend
scripts/      One-off data download / preprocess scripts
notebooks/    EDA and experiments
```

## Setup

_TBD — will be filled in as the project takes shape._

## Status

Early scaffolding.

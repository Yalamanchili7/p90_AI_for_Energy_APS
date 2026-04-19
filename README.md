<div align="center">

# P90 — Spatio-Temporal AI for an APS-like Distribution Grid

**Feeder-level forecasting before the stress hits.**

A graph-aware quantile load forecaster for a realistic APS-like distribution feeder, paired with a scenario-based decision layer that lets utility planners simulate stress under extreme heat and EV evening-peak growth.

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)
![Python](https://img.shields.io/badge/python-3.11-blue.svg)
![Next.js](https://img.shields.io/badge/next.js-14-black.svg)
![FastAPI](https://img.shields.io/badge/fastapi-0.115-009688.svg)
![Status](https://img.shields.io/badge/status-submission--ready-brightgreen.svg)

*ASU Energy Hackathon 2026 · APS AI for Energy challenge · Built by [Sundeep Yalamanchili](https://github.com/Yalamanchili7)*

</div>

---

## Table of contents

- [What it does](#what-it-does)
- [Headline results](#headline-results)
- [Architecture](#architecture)
- [Stack](#stack)
- [Repository layout](#repository-layout)
- [Running locally](#running-locally)
- [API endpoints](#api-endpoints)
- [Data sources](#data-sources)
- [Honest limitations](#honest-limitations)
- [How to cite](#how-to-cite)
- [License](#license)
- [Acknowledgments](#acknowledgments)

---

## What it does

- **Forecasting.** 24-hour-ahead load forecasts at every bus on the IEEE 34-bus Arizona test feeder, output as P10 / P50 / P90 quantile bands — *utilities plan to risk, not averages.*
- **Scenarios.** Baseline vs. stressed operation under extreme-heat (+20 °F) and EV evening-peak growth (+50 %), showing where and when the feeder becomes constrained.
- **Decisions.** An operator dashboard on real west-Phoenix map tiles identifies the buses at risk, the hour of peak stress, and produces a rules-based intervention recommendation per affected bus (demand response, pre-cooling, CVR).

## Headline results

| Metric | Value | Notes |
| --- | --- | --- |
| **P50 MAPE** | **4.61 %** | Held-out test · 1,081 samples |
| Hot-hour MAPE | 4.71 % | Top 10 % hottest test hours |
| Evening-peak MAPE | 4.59 % | 6–9 PM slice |
| P80 interval coverage | 80.4 % | Target 80 % |
| Inference latency | ~200 ms | Per 24 h × 37-bus forecast |

## Architecture

```
Data → 39 features → 3 XGBoost quantile models → Graph smoothing (α=0.95) → Per-bus forecast
```

The **primary model** is an XGBoost quantile ensemble — three independent gradient-boosted trees trained with `reg:quantileerror` for P10 / P50 / P90.
A **spatio-temporal GCN** (28,552 params, GRU → 2× GCN → quantile heads) is retained as an ablation.
**Post-processing** applies scale-aware graph smoothing using the IEEE 34-bus topology, combining per-bus temporal forecasts with 1-hop neighbor deviations.

## Stack

| Layer | Tools |
| --- | --- |
| Modeling | XGBoost (primary), PyTorch + PyTorch Geometric (GCN ablation), OpenDSS for power flow |
| Data | IEEE PES 34-bus feeder, NOAA KPHX, NREL NSRDB, NREL EVI-Pro Lite |
| Backend | FastAPI + uvicorn (Python 3.11) |
| Frontend | Next.js 14, TypeScript, Tailwind, Plotly, Leaflet |

## Repository layout

```
.
├── notebooks/              # Full ML pipeline (01 – 07.5)
│   ├── 01_grid_topology.ipynb
│   ├── 02_weather.ipynb
│   ├── 03_synthetic_load.ipynb
│   ├── 04_features.ipynb
│   ├── 05_train_gcn.ipynb           # ablation
│   ├── 06_xgboost_primary.ipynb     # shipped model
│   ├── 07_scenarios.ipynb
│   └── 07.5_graph_smoothing.ipynb
├── data/processed/         # Feature tensors, targets, splits, metrics
├── checkpoints/            # Trained XGBoost quantile models + GCN
├── backend/                # FastAPI inference server (port 8001)
│   ├── app/main.py
│   └── scripts/generate_positions.py
├── frontend/               # Next.js dashboard (port 3001)
│   └── src/
│       ├── app/            # landing, /dashboard, /methodology
│       └── components/
├── LICENSE
└── README.md
```

## Running locally

### Prerequisites
- Python **3.11**
- Node.js **18+**
- macOS / Linux (Windows works via WSL)

### 1. Clone

```bash
git clone https://github.com/Yalamanchili7/p90_AI_for_Energy_APS.git
cd p90_AI_for_Energy_APS
```

### 2. Backend

```bash
cd backend
python3.11 -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# One-time: generate synthetic Phoenix coordinates for the map
export P90_ROOT="$(cd .. && pwd)"
python scripts/generate_positions.py

# Run on port 8001
uvicorn app.main:app --reload --port 8001
```

Smoke test from another terminal:

```bash
curl http://localhost:8001/health
# {"status":"ok","loaded":true,"n_buses":37}
```

### 3. Frontend

```bash
cd frontend
npm install
echo 'NEXT_PUBLIC_API_BASE_URL=http://localhost:8001' > .env.local
npm run dev
```

Open **http://localhost:3001/dashboard**

### 4. Try a demo

1. Click a July 2023 heatwave day in the timeline (115 °F+)
2. Move the **Temperature** slider to +15 °F
3. Watch the map colors shift red and the interventions panel populate

## API endpoints

| Endpoint | Method | Purpose |
| --- | --- | --- |
| `/health` | GET | Service status |
| `/topology` | GET | Buses (+ coordinates) and edges |
| `/samples` | GET | Curated forecast-start times (heatwave / cold / recent) |
| `/metrics` | GET | Held-out test metrics, overall + stress-stratified |
| `/forecast` | POST | Run XGBoost inference with scenario perturbations |
| `/scenarios/summary` | GET | Pre-computed scenario results |

Interactive Swagger docs live at `http://localhost:8001/docs` once the backend is running.

## Data sources

All downstream of public, documented sources:

- **[IEEE PES Test Feeders](https://cmte.ieee.org/pes-testfeeders/resources/)** — IEEE 34-bus, documented as *"an actual feeder located in Arizona"*
- **[NOAA NCEI](https://www.ncei.noaa.gov/)** — Phoenix KPHX hourly weather, 2023–2024 (includes July 2023 18-day 110 °F+ heatwave)
- **[NREL NSRDB](https://nsrdb.nrel.gov/)** — solar irradiance (GHI / DNI / DHI)
- **[NREL EVI-Pro Lite](https://afdc.energy.gov/evi-pro-lite)** — EV charging parameters (Arizona)
- **[EIA-930](https://www.eia.gov/electricity/gridmonitor/)** — bulk-system reference *(documented extension, not integrated)*

## Honest limitations

> A reviewer should know what this system does **not** yet do.

- **Out-of-distribution heat.** Training tops at ~118 °F; the +20 °F scenario probes beyond the training distribution.
- **EV scenario depth.** EV perturbation shifts recent-history load; a fuller pipeline would re-synthesize forward load under higher EV adoption.
- **Synthetic load.** Per-bus hourly load is synthesized from customer-mix shapes, CDD coupling, and published EV profiles — real feeder-level AMI data was not available to us.
- **Synthetic geographic coordinates.** IEEE 34-bus doesn't ship with lat/lon. Bus positions are placed within a real APS service area (west Phoenix / Maryvale) and clearly labeled as synthetic in the UI.

## How to cite

If you reference this work, please cite as:

```bibtex
@misc{yalamanchili2026p90,
  author       = {Yalamanchili, Sundeep},
  title        = {P90: Spatio-Temporal AI for an APS-like Distribution Grid},
  year         = {2026},
  howpublished = {ASU Energy Hackathon · APS AI for Energy challenge},
  url          = {https://github.com/Yalamanchili7/p90_AI_for_Energy_APS}
}
```

## License

Released under the [MIT License](./LICENSE). Data sourced from the above providers remains under their respective licenses.

## Acknowledgments

Built during the ASU Energy Hackathon, April 2026. Thanks to APS for the AI for Energy challenge and to IEEE PES, NREL, and NOAA for making the underlying data public.

---

<div align="center">

Made with ⚡ in Phoenix, AZ

</div>

# P90 Backend

FastAPI wrapper around the trained XGBoost forecaster.

## Prerequisites

- Python 3.11
- The main `p90/` repo one level up with trained artifacts in `p90/data/processed/` and `p90/checkpoints/`

The backend expects the following structure by default:

```
parent/
├── p90/                            # main repo with trained artifacts
│   ├── data/processed/
│   └── checkpoints/
└── p90-web/
    └── backend/                    # this directory
```

Override the path with `P90_ROOT=/path/to/p90` if yours differs.

## Setup

```bash
cd backend
python3.11 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

## Run

```bash
uvicorn app.main:app --reload --port 8000
```

Then visit:

- http://localhost:8000/docs — interactive API docs
- http://localhost:8000/health — quick health check

## Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/health` | Service status |
| GET | `/topology` | Full feeder topology (buses + edges) |
| GET | `/samples?limit=50` | Available test forecast-start times |
| POST | `/forecast` | Run forecast with optional scenario perturbation |
| GET | `/metrics` | Pre-computed test-set evaluation metrics |
| GET | `/scenarios/summary` | Pre-computed 5-scenario summary |

## Quick test

```bash
curl http://localhost:8000/health
curl http://localhost:8000/samples?limit=3
curl -X POST http://localhost:8000/forecast \
  -H "Content-Type: application/json" \
  -d '{"sample_idx": 0, "temp_delta_f": 10, "ev_growth_pct": 50}'
```

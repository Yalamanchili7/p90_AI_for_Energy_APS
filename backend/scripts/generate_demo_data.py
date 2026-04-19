"""
Generate static demo data for the Vercel-deployed frontend.

This script calls your LOCAL running backend (http://localhost:8001) and
snapshots the results as JSON files bundled with the frontend build.

Run this ONCE with the backend running, then the frontend can serve these
snapshots without a live backend.

Output goes to: frontend/public/demo-data/
  - topology.json
  - samples.json
  - metrics.json
  - scenarios.json (every forecast × every scenario)
"""

from __future__ import annotations

import json
import time
from pathlib import Path

import requests

API = "http://localhost:8001"

# Which forecast-start samples to snapshot.
# We'll pull the curated list from /samples and snapshot the top 8.
MAX_SAMPLES = 8

# Five stress scenarios to pre-compute per sample.
SCENARIOS = [
    {"name": "baseline", "temp_delta_f": 0, "ev_growth_pct": 0},
    {"name": "heat_+10F", "temp_delta_f": 10, "ev_growth_pct": 0},
    {"name": "heat_+20F", "temp_delta_f": 20, "ev_growth_pct": 0},
    {"name": "ev_+50", "temp_delta_f": 0, "ev_growth_pct": 50},
    {"name": "combined", "temp_delta_f": 15, "ev_growth_pct": 50},
]


def main():
    # Frontend location - assumes script is in backend/scripts/ and frontend
    # is a sibling directory under p90/
    script_dir = Path(__file__).resolve().parent
    root = script_dir.parent.parent  # p90/
    out_dir = root / "frontend" / "public" / "demo-data"
    out_dir.mkdir(parents=True, exist_ok=True)

    # Check backend is up
    r = requests.get(f"{API}/health", timeout=5)
    r.raise_for_status()
    print(f"✅ Backend healthy: {r.json()}")

    # 1. Topology (static)
    print("\n→ /topology")
    topology = requests.get(f"{API}/topology", timeout=10).json()
    (out_dir / "topology.json").write_text(json.dumps(topology, separators=(",", ":")))
    print(f"  ✅ {len(topology['buses'])} buses, {len(topology['edges'])} edges")

    # 2. Curated samples list
    print("\n→ /samples?limit=20")
    samples = requests.get(f"{API}/samples?limit=20", timeout=10).json()
    (out_dir / "samples.json").write_text(json.dumps(samples, separators=(",", ":")))
    print(f"  ✅ {len(samples)} samples")

    # 3. Metrics
    print("\n→ /metrics")
    metrics = requests.get(f"{API}/metrics", timeout=10).json()
    (out_dir / "metrics.json").write_text(json.dumps(metrics, separators=(",", ":")))
    print(f"  ✅ metrics snapshot")

    # 4. Precompute scenarios for top N samples
    print(f"\n→ /forecast × {MAX_SAMPLES} samples × {len(SCENARIOS)} scenarios")
    snapshot_samples = samples[:MAX_SAMPLES]

    scenario_data: dict[str, dict[str, dict]] = {}
    total = len(snapshot_samples) * len(SCENARIOS)
    done = 0
    t0 = time.time()

    for s in snapshot_samples:
        sid = str(s["sample_idx"])
        scenario_data[sid] = {}
        for sc in SCENARIOS:
            payload = {
                "sample_idx": s["sample_idx"],
                "temp_delta_f": sc["temp_delta_f"],
                "ev_growth_pct": sc["ev_growth_pct"],
            }
            r = requests.post(f"{API}/forecast", json=payload, timeout=30)
            r.raise_for_status()
            scenario_data[sid][sc["name"]] = r.json()
            done += 1
            elapsed = time.time() - t0
            eta = (total - done) * (elapsed / done)
            print(
                f"  {done:>3}/{total} · sample {s['sample_idx']:>6} · {sc['name']:<12} "
                f"· eta {eta:.0f}s"
            )

    (out_dir / "scenarios.json").write_text(
        json.dumps(scenario_data, separators=(",", ":"))
    )

    # Summary
    total_bytes = sum(f.stat().st_size for f in out_dir.glob("*.json"))
    print(f"\n✅ Generated demo data in {out_dir}")
    print(f"   Total size: {total_bytes / 1024:.0f} KB")
    for f in sorted(out_dir.glob("*.json")):
        print(f"     {f.name:<18} {f.stat().st_size / 1024:>8.1f} KB")


if __name__ == "__main__":
    main()

"""
Generate synthetic Phoenix-area geographic coordinates for IEEE 34-bus nodes.

Rationale: IEEE 34-bus is documented by IEEE PES as 'an actual feeder located in
Arizona', but specific geographic positions aren't public. For visualization
purposes we place nodes within a plausible APS service area footprint:

    West Phoenix / Maryvale — a real APS residential service area, roughly
    bounded by I-10 (south), Thomas Rd (north), 51st Ave (east), 91st Ave (west)

The layout preserves electrical adjacency from the IEEE 34-bus spec — connected
buses appear physically close. This is clearly labeled as a visualization choice
in the UI.

Footprint centered roughly at (33.482, -112.188) — Maryvale, Phoenix.
Extent: ~4.5 miles E-W, ~2.5 miles N-S.
"""

from __future__ import annotations

from pathlib import Path

import numpy as np
import pandas as pd
import torch


# Footprint center (Maryvale, Phoenix) and extent
CENTER_LAT = 33.482
CENTER_LON = -112.188

# ~0.065° ≈ 4.5 miles at this latitude
LAT_SPAN = 0.036   # ~2.5 miles N-S
LON_SPAN = 0.065   # ~4.5 miles E-W


def generate_positions(
    graph_path: Path,
    buses_path: Path,
    out_path: Path,
    seed: int = 42,
) -> pd.DataFrame:
    """Produce a parquet with columns: name, lat, lon, full_idx."""
    graph = torch.load(graph_path, weights_only=False)
    buses_df = pd.read_parquet(buses_path)

    names = graph.bus_names
    n = len(names)
    edge_index = graph.edge_index.numpy()

    # Build adjacency
    adj = [[] for _ in range(n)]
    for s, d in zip(edge_index[0], edge_index[1]):
        adj[int(s)].append(int(d))
    adj = [sorted(set(a)) for a in adj]

    # Seed layout: grid-ish initial positions
    rng = np.random.default_rng(seed)
    pos = rng.uniform(-1, 1, size=(n, 2)) * 0.5

    # Force-directed layout — we want the resulting shape to feel like a radial feeder
    k = 1.2 / np.sqrt(n)
    iterations = 400
    temperature = 0.10

    for _ in range(iterations):
        disp = np.zeros_like(pos)

        # Repulsion between all pairs
        for i in range(n):
            for j in range(i + 1, n):
                d = pos[i] - pos[j]
                dist = np.linalg.norm(d) + 1e-3
                force = (k * k) / dist
                unit = d / dist
                disp[i] += unit * force
                disp[j] -= unit * force

        # Attraction along edges
        for i in range(n):
            for j in adj[i]:
                if j > i:
                    d = pos[i] - pos[j]
                    dist = np.linalg.norm(d) + 1e-3
                    force = (dist * dist) / k
                    unit = d / dist
                    disp[i] -= unit * force
                    disp[j] += unit * force

        # Limit motion by temperature
        for i in range(n):
            d = np.linalg.norm(disp[i]) + 1e-3
            capped = min(d, temperature)
            pos[i] += (disp[i] / d) * capped

        temperature *= 0.98

    # Normalize positions to [0, 1] x [0, 1]
    pos_min = pos.min(axis=0)
    pos_max = pos.max(axis=0)
    pos_norm = (pos - pos_min) / (pos_max - pos_min + 1e-9)

    # Map into the geographic footprint (rotate slightly for aesthetic variety)
    theta = np.deg2rad(12)  # slight rotation
    rot = np.array([[np.cos(theta), -np.sin(theta)], [np.sin(theta), np.cos(theta)]])
    pos_rot = (pos_norm - 0.5) @ rot.T + 0.5

    lats = CENTER_LAT + (pos_rot[:, 1] - 0.5) * LAT_SPAN
    lons = CENTER_LON + (pos_rot[:, 0] - 0.5) * LON_SPAN

    # Add a small jitter so nodes don't overlap exactly
    jitter_mag = 0.0008
    lats = lats + rng.uniform(-jitter_mag, jitter_mag, n)
    lons = lons + rng.uniform(-jitter_mag, jitter_mag, n)

    df = pd.DataFrame({
        "name": names,
        "full_idx": np.arange(n),
        "lat": lats,
        "lon": lons,
    })

    out_path.parent.mkdir(parents=True, exist_ok=True)
    df.to_parquet(out_path)
    print(f"Wrote {len(df)} positions to {out_path}")
    print(f"  Lat range: {df['lat'].min():.4f} to {df['lat'].max():.4f}")
    print(f"  Lon range: {df['lon'].min():.4f} to {df['lon'].max():.4f}")

    return df


if __name__ == "__main__":
    import os
    root = Path(os.environ.get("P90_ROOT", "/Users/sundeepyalamanchili/Documents/Projects/p90"))
    generate_positions(
        graph_path=root / "data" / "processed" / "graph_ieee34.pt",
        buses_path=root / "data" / "processed" / "buses_ieee34.parquet",
        out_path=root / "data" / "processed" / "bus_positions_synthetic.parquet",
    )

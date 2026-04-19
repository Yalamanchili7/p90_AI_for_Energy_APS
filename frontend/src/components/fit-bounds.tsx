"use client";

import { useEffect } from "react";
import { useMap } from "react-leaflet";
import type { LatLngBoundsLiteral } from "leaflet";

/**
 * Calls invalidateSize() after mount to fix sizing issues when the map
 * is inside a flex/grid container that measures differently after layout.
 * Also fits the map viewport to the provided bounds.
 */
export function FitBounds({ bounds }: { bounds: LatLngBoundsLiteral | null }) {
  const map = useMap();

  useEffect(() => {
    // Fire on next tick so the container has its final computed size
    const t = setTimeout(() => {
      map.invalidateSize();
      if (bounds) {
        map.fitBounds(bounds, { padding: [30, 30] });
      }
    }, 50);
    return () => clearTimeout(t);
  }, [map, bounds]);

  // Also listen for window resizes
  useEffect(() => {
    const handler = () => map.invalidateSize();
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, [map]);

  return null;
}

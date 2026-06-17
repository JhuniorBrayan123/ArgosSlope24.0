/**
 * ARGOS SLOPE 4.0 — Heatmap Effect (Stub).
 *
 * Placeholder for a future heat overlay that visualizes deformation
 * magnitude as a color gradient on the terrain surface.
 *
 * Will be filled when real per-vertex deformation data is available
 * from the backend (currently a future feature).
 *
 * For now, renders an empty group as a no-op so the 4-layer
 * architecture (Scene → Controls → Effects → UI) is complete
 * from the start and wiring is in place.
 */

'use client';

// ── Props ────────────────────────────────────────────────────────────

export interface HeatmapEffectProps {
  /** Future: deformation data per vertex */
  // deformationData?: Float32Array;
}

// ── Component ─────────────────────────────────────────────────────────

/**
 * Heat overlay on the slope terrain.
 *
 * TODO: When deformation data becomes available:
 * 1. Accept a Float32Array of deformation values (one per terrain vertex)
 * 2. Compute color gradient (green → yellow → red) based on normalized values
 * 3. Create a second mesh with the same geometry but using vertexColors
 *    driven by deformation values, rendered with transparency blend
 * 4. Toggle visibility via a prop or store state
 */
export default function HeatmapEffect(_props: HeatmapEffectProps) {
  // Stub: return empty group — ready for future heat overlay implementation
  return <group />;
}

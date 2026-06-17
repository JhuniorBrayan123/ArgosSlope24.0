/**
 * ARGOS SLOPE 4.0 — Slope 3D Viewer Store.
 *
 * Zustand store for 3D viewer state: point cloud, crack detections,
 * timeline, view modes, and crack selection.
 */

import { create } from 'zustand';

// ── Types ────────────────────────────────────────────────────────────

export interface CrackData {
  x: number;
  y: number;
  w: number;
  h: number;
  classification: string;
  roi_id: string;
}

export type ViewMode = 'live' | 'playback' | 'comparison';

// ── Store Interface ─────────────────────────────────────────────────

export interface SlopeStore {
  /** Point cloud as array of [x, y, z, r, g, b] tuples */
  points: number[][];
  /** Current fissure detections */
  cracks: CrackData[];
  /** ISO-8601 timestamp of latest point cloud */
  timestamp: string | null;
  /** Path to the most recent frame image */
  imagePath: string;
  /** Currently selected crack ID (roi_id) */
  selectedCrackId: string | null;
  /** Timeline slider position (index into historical snapshots) */
  timelineIndex: number;
  /** Viewer mode */
  viewMode: ViewMode;

  // ── Actions ──────────────────────────────────────────────────────

  /** Replace point cloud data and update timestamp/imagePath */
  setPointCloud: (points: number[][], timestamp: string, cracks: CrackData[], imagePath: string) => void;
  /** Replace crack list */
  setCracks: (cracks: CrackData[]) => void;
  /** Select a crack by roi_id (null to deselect) */
  selectCrack: (roiId: string | null) => void;
  /** Set timeline slider index */
  setTimelineIndex: (index: number) => void;
  /** Switch viewer mode */
  setViewMode: (mode: ViewMode) => void;
  /** Reset store to initial state */
  reset: () => void;
}

// ── Initial State ────────────────────────────────────────────────────

const initialState = {
  points: [] as number[][],
  cracks: [] as CrackData[],
  timestamp: null as string | null,
  imagePath: '',
  selectedCrackId: null as string | null,
  timelineIndex: 0,
  viewMode: 'live' as ViewMode,
};

// ── Store ────────────────────────────────────────────────────────────

export const useSlopeStore = create<SlopeStore>()((set) => ({
  ...initialState,

  setPointCloud: (points, timestamp, cracks, imagePath) =>
    set({ points, timestamp, cracks, imagePath }),

  setCracks: (cracks) => set({ cracks }),

  selectCrack: (roiId) => set({ selectedCrackId: roiId }),

  setTimelineIndex: (index) => set({ timelineIndex: index }),

  setViewMode: (mode) => set({ viewMode: mode }),

  reset: () => set({ ...initialState }),
}));

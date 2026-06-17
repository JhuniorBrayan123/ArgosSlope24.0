/**
 * ARGOS SLOPE 4.0 — Geotechnical Store.
 *
 * Zustand store for geotechnical calculations: RQD, deformation,
 * and crack growth analysis.
 */

import { create } from 'zustand';
import type {
  RqdResult,
  DeformationResult,
  GrowthResult,
} from '@/services/api-client';

// ── Store Interface ─────────────────────────────────────────────────

export interface GeotechnicalStore {
  /** Result from RQD calculation */
  rqdResult: RqdResult | null;
  /** Result from deformation calculation */
  deformationResult: DeformationResult | null;
  /** Result from growth check */
  growthResult: GrowthResult | null;
  loading: boolean;
  error: string | null;

  // ── Actions ──────────────────────────────────────────────────────

  /** Calculate Rock Quality Designation (RQD) */
  calculateRqd: (data: {
    pieceLengthsCm: number[];
    coreLengthM: number;
    minBlockCm?: number;
  }) => Promise<void>;
  /** Calculate deformation analysis */
  calculateDeformation: (data: {
    displacementPx: number;
    daysElapsed: number;
    zMeters: number;
    fMm: number;
  }) => Promise<void>;
  /** Check crack growth status */
  checkGrowth: (data: {
    fisuraId: number;
    mediciones: { fecha: string; largoMm: number; anchoMm: number }[];
  }) => Promise<void>;
  /** Reset store to initial state */
  reset: () => void;
}

// ── Initial State ────────────────────────────────────────────────────

const initialState = {
  rqdResult: null as RqdResult | null,
  deformationResult: null as DeformationResult | null,
  growthResult: null as GrowthResult | null,
  loading: false,
  error: null as string | null,
};

// ── Store ────────────────────────────────────────────────────────────

export const useGeotechnicalStore = create<GeotechnicalStore>()((set) => ({
  ...initialState,

  calculateRqd: async (data) => {
    set({ loading: true, error: null });
    try {
      const { geotechnicalService } = await import('@/services/geotechnical.service');
      const result = await geotechnicalService.calculateRqd(data);
      set({ rqdResult: result as RqdResult, loading: false });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error al calcular RQD';
      set({ error: message, loading: false });
    }
  },

  calculateDeformation: async (data) => {
    set({ loading: true, error: null });
    try {
      const { geotechnicalService } = await import('@/services/geotechnical.service');
      const result = await geotechnicalService.calculateDeformation(data);
      set({ deformationResult: result as DeformationResult, loading: false });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error al calcular deformación';
      set({ error: message, loading: false });
    }
  },

  checkGrowth: async (data) => {
    set({ loading: true, error: null });
    try {
      const { geotechnicalService } = await import('@/services/geotechnical.service');
      const result = await geotechnicalService.checkGrowth(data);
      set({ growthResult: result as GrowthResult, loading: false });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error al verificar crecimiento';
      set({ error: message, loading: false });
    }
  },

  reset: () => set({ ...initialState }),
}));

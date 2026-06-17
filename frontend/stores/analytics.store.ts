/**
 * ARGOS SLOPE 4.0 — Analytics Store.
 *
 * Zustand store for analytics dashboard: period selection, custom date
 * ranges, selected fissures for comparison, and chart data.
 */

import { create } from 'zustand';

// ── Types ────────────────────────────────────────────────────────────

export type AnalyticsPeriod = '7d' | '30d' | '90d' | '1y' | 'custom';

export interface CustomDateRange {
  start: string;
  end: string;
}

export interface ChartDataPoint {
  fecha: string;
  [key: string]: number | string;
}

// ── Store Interface ─────────────────────────────────────────────────

export interface AnalyticsStore {
  /** Selected time period */
  period: AnalyticsPeriod;
  /** Custom date range (only used when period === 'custom') */
  customRange: CustomDateRange | null;
  /** Selected fissure IDs for multi-fissure comparison */
  selectedFissures: number[];
  /** Chart data fetched from analytics endpoint */
  chartData: ChartDataPoint[];
  loading: boolean;
  error: string | null;

  // ── Actions ──────────────────────────────────────────────────────

  /** Set the time period (resets customRange unless 'custom') */
  setPeriod: (period: AnalyticsPeriod) => void;
  /** Set a custom date range (also switches period to 'custom') */
  setCustomRange: (range: CustomDateRange) => void;
  /** Toggle a fissure ID for multi-fissure comparison */
  toggleFissure: (id: number) => void;
  /** Fetch analytics data from the API */
  fetchAnalytics: () => Promise<void>;
  /** Reset store to initial state */
  reset: () => void;
}

// ── Initial State ────────────────────────────────────────────────────

const initialState = {
  period: '7d' as AnalyticsPeriod,
  customRange: null as CustomDateRange | null,
  selectedFissures: [] as number[],
  chartData: [] as ChartDataPoint[],
  loading: false,
  error: null as string | null,
};

// ── Store ────────────────────────────────────────────────────────────

export const useAnalyticsStore = create<AnalyticsStore>()((set, get) => ({
  ...initialState,

  setPeriod: (period) =>
    set({
      period,
      customRange: period !== 'custom' ? null : get().customRange,
    }),

  setCustomRange: (range) =>
    set({ period: 'custom', customRange: range }),

  toggleFissure: (id) =>
    set((state) => ({
      selectedFissures: state.selectedFissures.includes(id)
        ? state.selectedFissures.filter((fid) => fid !== id)
        : [...state.selectedFissures, id],
    })),

  fetchAnalytics: async () => {
    const { period, customRange } = get();
    set({ loading: true, error: null });
    try {
      // Build query params
      const params = new URLSearchParams();
      if (period !== 'custom') {
        params.set('period', period);
      } else if (customRange) {
        params.set('start', customRange.start);
        params.set('end', customRange.end);
      }

      const res = await fetch(
        `${
          process.env.NEXT_PUBLIC_DOTNET_API_URL || 'http://localhost:5000'
        }/api/analytics?${params.toString()}`
      );
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const data: ChartDataPoint[] = await res.json();
      set({ chartData: data, loading: false });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error al cargar analytics';
      set({ error: message, loading: false });
    }
  },

  reset: () => set({ ...initialState }),
}));

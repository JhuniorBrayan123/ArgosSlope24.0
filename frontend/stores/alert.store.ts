/**
 * ARGOS SLOPE 4.0 — Alert Store.
 *
 * Zustand store for alerts with filtering, pagination, bulk operations,
 * and escalation support.
 * Types match the .NET DTOs from AlertasController.
 */

import { create } from 'zustand';
import type { AlertaResponse } from '@/services/api-client';

// ── Types ────────────────────────────────────────────────────────────

export type AlertTipoFilter = 'todas' | 'critico' | 'advertencia' | 'informativo';
export type AlertEstadoFilter = 'todas' | 'pendientes' | 'reconocidas';

export interface AlertFilters {
  tipo: AlertTipoFilter;
  estado: AlertEstadoFilter;
  busqueda: string;
  dateRange: { start: string; end: string } | null;
}

export interface AlertPagination {
  page: number;
  pageSize: number;
  total: number;
}

// ── Store Interface ─────────────────────────────────────────────────

export interface AlertStore {
  /** List of alerts from the API */
  alerts: AlertaResponse[];
  /** Current filter values */
  filters: AlertFilters;
  /** Pagination state */
  pagination: AlertPagination;
  /** Set of selected alert IDs for bulk operations */
  selection: Set<number>;
  loading: boolean;
  error: string | null;

  // ── Actions ──────────────────────────────────────────────────────

  /** Fetch alerts from the API */
  fetchAlerts: () => Promise<void>;
  /** Acknowledge a single alert */
  acknowledgeAlerta: (id: number) => Promise<void>;
  /** Acknowledge multiple selected alerts */
  acknowledgeMultiple: () => Promise<void>;
  /** Escalate an alert (placeholder for future escalation logic) */
  escalateAlerta: (id: number) => Promise<void>;
  /** Update filters (resets page to 1) */
  setFilters: (filters: Partial<AlertFilters>) => void;
  /** Set current page number */
  setPage: (page: number) => void;
  /** Toggle selection of a single alert ID */
  toggleSelection: (id: number) => void;
  /** Select all currently loaded alerts */
  selectAll: () => void;
  /** Clear all selections */
  clearSelection: () => void;
  /** Reset store to initial state */
  reset: () => void;
}

// ── Initial State ────────────────────────────────────────────────────

const initialFilters: AlertFilters = {
  tipo: 'todas',
  estado: 'todas',
  busqueda: '',
  dateRange: null,
};

const initialPagination: AlertPagination = {
  page: 1,
  pageSize: 20,
  total: 0,
};

const initialState = {
  alerts: [] as AlertaResponse[],
  filters: { ...initialFilters },
  pagination: { ...initialPagination },
  selection: new Set<number>(),
  loading: false,
  error: null as string | null,
};

// ── Store ────────────────────────────────────────────────────────────

export const useAlertStore = create<AlertStore>()((set, get) => ({
  ...initialState,

  fetchAlerts: async () => {
    const { filters } = get();
    set({ loading: true, error: null });
    try {
      const { alertsService } = await import('@/services/alerts.service');
      const soloNoReconocidas = filters.estado === 'pendientes';
      const response = await alertsService.getAll(soloNoReconocidas);
      const data = Array.isArray(response) ? response : [];
      set({
        alerts: data as AlertaResponse[],
        pagination: { ...get().pagination, total: data.length },
        loading: false,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error al cargar alertas';
      set({ error: message, loading: false });
    }
  },

  acknowledgeAlerta: async (id: number) => {
    try {
      const { alertsService } = await import('@/services/alerts.service');
      await alertsService.acknowledge(id);
      set((state) => ({
        alerts: state.alerts.map((a) =>
          a.id === id ? { ...a, reconocida: true } : a
        ),
      }));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error al reconocer alerta';
      set({ error: message });
    }
  },

  acknowledgeMultiple: async () => {
    const { selection } = get();
    if (selection.size === 0) return;

    try {
      const { alertsService } = await import('@/services/alerts.service');
      const ids = Array.from(selection);
      await Promise.all(ids.map((id) => alertsService.acknowledge(id)));
      set((state) => ({
        alerts: state.alerts.map((a) =>
          selection.has(a.id) ? { ...a, reconocida: true } : a
        ),
        selection: new Set<number>(),
      }));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error al reconocer alertas';
      set({ error: message });
    }
  },

  escalateAlerta: async (id: number) => {
    try {
      set({ loading: true });
      // Placeholder: in the future, this could POST to an escalation endpoint
      // For now, log and mark as acknowledged
      console.info(`[AlertStore] Escalating alert #${id}`);
      const { alertsService } = await import('@/services/alerts.service');
      await alertsService.acknowledge(id);
      set((state) => ({
        alerts: state.alerts.map((a) =>
          a.id === id ? { ...a, reconocida: true } : a
        ),
        loading: false,
      }));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error al escalar alerta';
      set({ error: message, loading: false });
    }
  },

  setFilters: (partial) =>
    set((state) => ({
      filters: { ...state.filters, ...partial },
      pagination: { ...state.pagination, page: 1 },
    })),

  setPage: (page) =>
    set((state) => ({ pagination: { ...state.pagination, page } })),

  toggleSelection: (id) =>
    set((state) => {
      const next = new Set(state.selection);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return { selection: next };
    }),

  selectAll: () =>
    set((state) => ({
      selection: new Set(state.alerts.map((a) => a.id)),
    })),

  clearSelection: () => set({ selection: new Set<number>() }),

  reset: () =>
    set({
      ...initialState,
      filters: { ...initialFilters },
      pagination: { ...initialPagination },
      selection: new Set<number>(),
    }),
}));

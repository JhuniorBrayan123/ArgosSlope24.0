/**
 * ARGOS SLOPE 4.0 — Fissure CRUD Store.
 *
 * Zustand store for managing fissures (fisuras): list, detail,
 * create, update, archive, delete, filters, and pagination.
 * Types match the .NET DTOs from FissuresController.
 */

import { create } from 'zustand';
import type {
  FisuraResponse,
  FisuraDetalleResponse,
} from '@/services/api-client';

// ── Filter Interface ─────────────────────────────────────────────────

export interface FissureFilters {
  search: string;
  tipo: string;
  estado: string;
  dateRange: { start: string; end: string } | null;
}

export interface FissurePagination {
  page: number;
  pageSize: number;
  total: number;
}

// ── Store Interface ─────────────────────────────────────────────────

export interface FissureStore {
  /** List of fissures from the API */
  fissures: FisuraResponse[];
  /** Full detail of the selected fissure (includes mediciones, alertas) */
  selectedFissureDetail: FisuraDetalleResponse | null;
  selectedFissureId: number | null;
  filters: FissureFilters;
  pagination: FissurePagination;
  loading: boolean;
  error: string | null;

  // ── Actions ──────────────────────────────────────────────────────

  /** Replace the fissure list */
  setFissures: (fissures: FisuraResponse[]) => void;
  /** Fetch fissures from the API (calls fissuresService.getAll) */
  fetchFissures: () => Promise<void>;
  /** Fetch full detail for a specific fissure */
  fetchFissureDetail: (id: number) => Promise<void>;
  /** Create a new fissure via API */
  createFissure: (data: Partial<FisuraResponse>) => Promise<void>;
  /** Update an existing fissure */
  updateFissure: (id: number, data: Partial<FisuraResponse>) => Promise<void>;
  /** Archive a fissure (soft delete) */
  archiveFissure: (id: number) => Promise<void>;
  /** Delete a fissure permanently */
  deleteFissure: (id: number) => Promise<void>;
  /** Update filter values (resets page to 1) */
  setFilters: (filters: Partial<FissureFilters>) => void;
  /** Set current page number */
  setPage: (page: number) => void;
  /** Select a fissure by ID */
  selectFissure: (id: number | null) => void;
  /** Reset store to initial state */
  reset: () => void;
}

// ── Initial State ────────────────────────────────────────────────────

const initialFilters: FissureFilters = {
  search: '',
  tipo: '',
  estado: '',
  dateRange: null,
};

const initialPagination: FissurePagination = {
  page: 1,
  pageSize: 20,
  total: 0,
};

const initialState = {
  fissures: [] as FisuraResponse[],
  selectedFissureDetail: null as FisuraDetalleResponse | null,
  selectedFissureId: null as number | null,
  filters: { ...initialFilters },
  pagination: { ...initialPagination },
  loading: false,
  error: null as string | null,
};

// ── Store ────────────────────────────────────────────────────────────

export const useFissureStore = create<FissureStore>()((set, get) => ({
  ...initialState,

  setFissures: (fissures) => set({ fissures }),

  fetchFissures: async () => {
    const { filters, pagination } = get();
    set({ loading: true, error: null });
    try {
      const { fissuresService } = await import('@/services/fissures.service');
      const response = await fissuresService.getAll({
        search: filters.search || undefined,
        tipo: filters.tipo || undefined,
        estado: filters.estado || undefined,
        page: pagination.page,
        pageSize: pagination.pageSize,
      });
      set({ 
        fissures: response.items, 
        pagination: { ...pagination, total: response.totalCount },
        loading: false 
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error al cargar fisuras';
      set({ error: message, loading: false });
    }
  },

  fetchFissureDetail: async (id: number) => {
    set({ loading: true, error: null, selectedFissureId: id });
    try {
      const { fissuresService } = await import('@/services/fissures.service');
      const detail = await fissuresService.getById(id);
      set({ selectedFissureDetail: detail as FisuraDetalleResponse, loading: false });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error al cargar detalle';
      set({ error: message, loading: false });
    }
  },

  createFissure: async (data) => {
    set({ loading: true, error: null });
    try {
      const { fissuresService } = await import('@/services/fissures.service');
      await fissuresService.create(data);
      await get().fetchFissures();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error al crear fisura';
      set({ error: message, loading: false });
      throw err;
    }
  },

  updateFissure: async (id, data) => {
    set({ loading: true, error: null });
    try {
      const { fissuresService } = await import('@/services/fissures.service');
      await fissuresService.update(id, data);
      await get().fetchFissures();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error al actualizar fisura';
      set({ error: message, loading: false });
      throw err;
    }
  },

  archiveFissure: async (id) => {
    set({ loading: true, error: null });
    try {
      const { fissuresService } = await import('@/services/fissures.service');
      await fissuresService.update(id, { esCritica: false } as Partial<FisuraResponse>);
      await get().fetchFissures();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error al archivar fisura';
      set({ error: message, loading: false });
    }
  },

  deleteFissure: async (id) => {
    set({ loading: true, error: null });
    try {
      const { fissuresService } = await import('@/services/fissures.service');
      await fissuresService.delete(id);
      const { selectedFissureId } = get();
      set({
        selectedFissureId: selectedFissureId === id ? null : selectedFissureId,
        loading: false,
      });
      await get().fetchFissures();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error al eliminar fisura';
      set({ error: message, loading: false });
    }
  },

  setFilters: (partial) => {
    set((state) => ({
      filters: { ...state.filters, ...partial },
      pagination: { ...state.pagination, page: 1 }, // reset to page 1
    }));
    get().fetchFissures();
  },

  setPage: (page) => {
    set((state) => ({ pagination: { ...state.pagination, page } }));
    get().fetchFissures();
  },

  selectFissure: (id) => set({ selectedFissureId: id }),

  reset: () => set({ ...initialState, filters: { ...initialFilters }, pagination: { ...initialPagination } }),
}));

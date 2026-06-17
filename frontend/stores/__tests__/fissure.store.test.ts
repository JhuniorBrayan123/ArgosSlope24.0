/**
 * ARGOS SLOPE 4.0 — fissure.store unit tests.
 *
 * Tests for the fissure CRUD Zustand store: initial state, filters,
 * pagination, selection, and reset. Async actions (fetchFissures,
 * createFissure, etc.) require integration tests with mocked services.
 */

import { act } from '@testing-library/react';
import { useFissureStore } from '@/stores/fissure.store';

beforeEach(() => {
  act(() => {
    useFissureStore.getState().reset();
  });
});

// ── Initial State ─────────────────────────────────────────────────────

describe('fissure.store — initial state', () => {
  it('should have empty fissures array', () => {
    expect(useFissureStore.getState().fissures).toEqual([]);
  });

  it('should have null selectedFissureDetail', () => {
    expect(useFissureStore.getState().selectedFissureDetail).toBeNull();
  });

  it('should have null selectedFissureId', () => {
    expect(useFissureStore.getState().selectedFissureId).toBeNull();
  });

  it('should have default filters', () => {
    const filters = useFissureStore.getState().filters;
    expect(filters.search).toBe('');
    expect(filters.tipo).toBe('');
    expect(filters.estado).toBe('');
    expect(filters.dateRange).toBeNull();
  });

  it('should have default pagination', () => {
    const pagination = useFissureStore.getState().pagination;
    expect(pagination.page).toBe(1);
    expect(pagination.pageSize).toBe(20);
    expect(pagination.total).toBe(0);
  });

  it('should have loading false and error null', () => {
    expect(useFissureStore.getState().loading).toBe(false);
    expect(useFissureStore.getState().error).toBeNull();
  });
});

// ── setFissures ───────────────────────────────────────────────────────

describe('fissure.store — setFissures', () => {
  it('should replace fissures array', () => {
    const fissures = [
      { id: 1, roiId: 'ROI_001', fechaDeteccion: '2026-01-01', largoMm: 10, anchoMm: 5, areaMm2: 50, orientacion: 'N-S', tipo: 'fina', coordenadas: '{}', deltaPorcentaje: null, esCritica: false },
      { id: 2, roiId: 'ROI_002', fechaDeteccion: '2026-01-02', largoMm: 20, anchoMm: 10, areaMm2: 200, orientacion: 'E-W', tipo: 'media', coordenadas: '{}', deltaPorcentaje: 15, esCritica: true },
    ];
    act(() => {
      useFissureStore.getState().setFissures(fissures);
    });
    expect(useFissureStore.getState().fissures).toEqual(fissures);
  });
});

// ── setFilters ────────────────────────────────────────────────────────

describe('fissure.store — setFilters', () => {
  it('should update search filter', () => {
    act(() => {
      useFissureStore.getState().setFilters({ search: 'ROI_001' });
    });
    expect(useFissureStore.getState().filters.search).toBe('ROI_001');
  });

  it('should update tipo filter', () => {
    act(() => {
      useFissureStore.getState().setFilters({ tipo: 'gruesa' });
    });
    expect(useFissureStore.getState().filters.tipo).toBe('gruesa');
  });

  it('should update estado filter', () => {
    act(() => {
      useFissureStore.getState().setFilters({ estado: 'activo' });
    });
    expect(useFissureStore.getState().filters.estado).toBe('activo');
  });

  it('should set dateRange filter', () => {
    const dateRange = { start: '2026-01-01', end: '2026-06-13' };
    act(() => {
      useFissureStore.getState().setFilters({ dateRange });
    });
    expect(useFissureStore.getState().filters.dateRange).toEqual(dateRange);
  });

  it('should reset page to 1 when filters change', () => {
    // First set page to 5
    act(() => {
      useFissureStore.getState().setPage(5);
    });
    expect(useFissureStore.getState().pagination.page).toBe(5);

    // Then change a filter — page should reset to 1
    act(() => {
      useFissureStore.getState().setFilters({ search: 'test' });
    });
    expect(useFissureStore.getState().pagination.page).toBe(1);
  });

  it('should merge partial filters without affecting other fields', () => {
    act(() => {
      useFissureStore.getState().setFilters({ search: 'test', tipo: 'fina' });
    });
    expect(useFissureStore.getState().filters.search).toBe('test');
    expect(useFissureStore.getState().filters.tipo).toBe('fina');
    expect(useFissureStore.getState().filters.estado).toBe(''); // unchanged
  });
});

// ── setPage ───────────────────────────────────────────────────────────

describe('fissure.store — setPage', () => {
  it('should update page number', () => {
    act(() => {
      useFissureStore.getState().setPage(3);
    });
    expect(useFissureStore.getState().pagination.page).toBe(3);
  });

  it('should preserve pageSize and total when changing page', () => {
    // Set initial pagination
    act(() => {
      useFissureStore.getState().setPage(2);
    });
    const state = useFissureStore.getState();
    expect(state.pagination.page).toBe(2);
    expect(state.pagination.pageSize).toBe(20);
    expect(state.pagination.total).toBe(0);
  });
});

// ── selectFissure ─────────────────────────────────────────────────────

describe('fissure.store — selectFissure', () => {
  it('should set selectedFissureId to the given id', () => {
    act(() => {
      useFissureStore.getState().selectFissure(42);
    });
    expect(useFissureStore.getState().selectedFissureId).toBe(42);
  });

  it('should clear selectedFissureId when passed null', () => {
    act(() => {
      useFissureStore.getState().selectFissure(42);
    });
    act(() => {
      useFissureStore.getState().selectFissure(null);
    });
    expect(useFissureStore.getState().selectedFissureId).toBeNull();
  });
});

// ── reset ─────────────────────────────────────────────────────────────

describe('fissure.store — reset', () => {
  it('should restore initial state after mutations', () => {
    // Mutate
    act(() => {
      useFissureStore.getState().setFissures([
        { id: 1, roiId: 'ROI_001', fechaDeteccion: '2026-01-01', largoMm: 10, anchoMm: 5, areaMm2: 50, orientacion: 'N-S', tipo: 'fina', coordenadas: '{}', deltaPorcentaje: null, esCritica: false },
      ]);
      useFissureStore.getState().selectFissure(1);
      useFissureStore.getState().setFilters({ search: 'test' });
      useFissureStore.getState().setPage(3);
    });

    // Reset
    act(() => {
      useFissureStore.getState().reset();
    });

    const state = useFissureStore.getState();
    expect(state.fissures).toEqual([]);
    expect(state.selectedFissureId).toBeNull();
    expect(state.selectedFissureDetail).toBeNull();
    expect(state.filters.search).toBe('');
    expect(state.filters.tipo).toBe('');
    expect(state.filters.estado).toBe('');
    expect(state.filters.dateRange).toBeNull();
    expect(state.pagination.page).toBe(1);
    expect(state.pagination.pageSize).toBe(20);
    expect(state.pagination.total).toBe(0);
    expect(state.loading).toBe(false);
    expect(state.error).toBeNull();
  });
});

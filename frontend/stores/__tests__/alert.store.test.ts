/**
 * ARGOS SLOPE 4.0 — alert.store unit tests.
 *
 * Tests for the alert Zustand store: initial state, filters, pagination,
 * selection (Set-based toggle/selectAll/clearSelection), and reset.
 * Async actions (fetchAlerts, acknowledgeAlerta, etc.) require
 * integration tests with mocked services.
 */

import { act } from '@testing-library/react';
import { useAlertStore } from '@/stores/alert.store';

beforeEach(() => {
  act(() => {
    useAlertStore.getState().reset();
  });
});

// ── Initial State ─────────────────────────────────────────────────────

describe('alert.store — initial state', () => {
  it('should have empty alerts array', () => {
    expect(useAlertStore.getState().alerts).toEqual([]);
  });

  it('should have default filters', () => {
    const filters = useAlertStore.getState().filters;
    expect(filters.tipo).toBe('todas');
    expect(filters.estado).toBe('todas');
    expect(filters.busqueda).toBe('');
    expect(filters.dateRange).toBeNull();
  });

  it('should have default pagination', () => {
    const pagination = useAlertStore.getState().pagination;
    expect(pagination.page).toBe(1);
    expect(pagination.pageSize).toBe(20);
    expect(pagination.total).toBe(0);
  });

  it('should have empty selection Set', () => {
    const selection = useAlertStore.getState().selection;
    expect(selection).toBeInstanceOf(Set);
    expect(selection.size).toBe(0);
  });

  it('should have loading false and error null', () => {
    expect(useAlertStore.getState().loading).toBe(false);
    expect(useAlertStore.getState().error).toBeNull();
  });
});

// ── setFilters ────────────────────────────────────────────────────────

describe('alert.store — setFilters', () => {
  it('should update tipo filter', () => {
    act(() => {
      useAlertStore.getState().setFilters({ tipo: 'critico' });
    });
    expect(useAlertStore.getState().filters.tipo).toBe('critico');
  });

  it('should update estado filter', () => {
    act(() => {
      useAlertStore.getState().setFilters({ estado: 'pendientes' });
    });
    expect(useAlertStore.getState().filters.estado).toBe('pendientes');
  });

  it('should update busqueda filter', () => {
    act(() => {
      useAlertStore.getState().setFilters({ busqueda: 'deslizamiento' });
    });
    expect(useAlertStore.getState().filters.busqueda).toBe('deslizamiento');
  });

  it('should set dateRange filter', () => {
    const dateRange = { start: '2026-01-01', end: '2026-06-13' };
    act(() => {
      useAlertStore.getState().setFilters({ dateRange });
    });
    expect(useAlertStore.getState().filters.dateRange).toEqual(dateRange);
  });

  it('should reset page to 1 when filters change', () => {
    act(() => {
      useAlertStore.getState().setPage(5);
    });
    act(() => {
      useAlertStore.getState().setFilters({ tipo: 'critico' });
    });
    expect(useAlertStore.getState().pagination.page).toBe(1);
  });

  it('should merge partial filters', () => {
    act(() => {
      useAlertStore.getState().setFilters({ busqueda: 'test', estado: 'reconocidas' });
    });
    expect(useAlertStore.getState().filters.busqueda).toBe('test');
    expect(useAlertStore.getState().filters.estado).toBe('reconocidas');
    expect(useAlertStore.getState().filters.tipo).toBe('todas'); // unchanged
  });
});

// ── setPage ───────────────────────────────────────────────────────────

describe('alert.store — setPage', () => {
  it('should update page number', () => {
    act(() => {
      useAlertStore.getState().setPage(3);
    });
    expect(useAlertStore.getState().pagination.page).toBe(3);
  });
});

// ── toggleSelection ───────────────────────────────────────────────────

describe('alert.store — toggleSelection', () => {
  it('should add an id to the selection Set', () => {
    act(() => {
      useAlertStore.getState().toggleSelection(42);
    });
    expect(useAlertStore.getState().selection.has(42)).toBe(true);
    expect(useAlertStore.getState().selection.size).toBe(1);
  });

  it('should remove an id from the selection Set on second toggle', () => {
    act(() => {
      useAlertStore.getState().toggleSelection(42);
    });
    expect(useAlertStore.getState().selection.has(42)).toBe(true);

    act(() => {
      useAlertStore.getState().toggleSelection(42);
    });
    expect(useAlertStore.getState().selection.has(42)).toBe(false);
    expect(useAlertStore.getState().selection.size).toBe(0);
  });

  it('should handle multiple independent toggles', () => {
    act(() => {
      useAlertStore.getState().toggleSelection(1);
      useAlertStore.getState().toggleSelection(2);
      useAlertStore.getState().toggleSelection(3);
    });
    expect(useAlertStore.getState().selection.size).toBe(3);
    expect(useAlertStore.getState().selection.has(1)).toBe(true);
    expect(useAlertStore.getState().selection.has(2)).toBe(true);
    expect(useAlertStore.getState().selection.has(3)).toBe(true);
  });

  it('should remove only the toggled id, not others', () => {
    act(() => {
      useAlertStore.getState().toggleSelection(1);
      useAlertStore.getState().toggleSelection(2);
      useAlertStore.getState().toggleSelection(3);
    });
    act(() => {
      useAlertStore.getState().toggleSelection(2);
    });
    expect(useAlertStore.getState().selection.size).toBe(2);
    expect(useAlertStore.getState().selection.has(1)).toBe(true);
    expect(useAlertStore.getState().selection.has(2)).toBe(false);
    expect(useAlertStore.getState().selection.has(3)).toBe(true);
  });
});

// ── selectAll / clearSelection ────────────────────────────────────────

describe('alert.store — selectAll', () => {
  it('should select all alert IDs when alerts exist', () => {
    // Set some alerts via the store (simulating loaded data)
    const alerts = [
      { id: 1, fisuraId: 10, fecha: '2026-01-01', tipo: 'critico', mensaje: 'Test 1', umbralSuperado: 100, valorActual: 150, reconocida: false },
      { id: 2, fisuraId: 20, fecha: '2026-01-02', tipo: 'advertencia', mensaje: 'Test 2', umbralSuperado: 50, valorActual: 60, reconocida: false },
      { id: 3, fisuraId: 30, fecha: '2026-01-03', tipo: 'informativo', mensaje: 'Test 3', umbralSuperado: 10, valorActual: 5, reconocida: true },
    ] as any;

    // Direct state mutation for setup (same pattern as store actions use)
    useAlertStore.setState({ alerts });

    act(() => {
      useAlertStore.getState().selectAll();
    });

    expect(useAlertStore.getState().selection.size).toBe(3);
    expect(useAlertStore.getState().selection.has(1)).toBe(true);
    expect(useAlertStore.getState().selection.has(2)).toBe(true);
    expect(useAlertStore.getState().selection.has(3)).toBe(true);
  });

  it('should result in empty selection when no alerts loaded', () => {
    act(() => {
      useAlertStore.getState().selectAll();
    });
    expect(useAlertStore.getState().selection.size).toBe(0);
  });
});

describe('alert.store — clearSelection', () => {
  it('should clear all selected IDs', () => {
    // Select some IDs
    act(() => {
      useAlertStore.getState().toggleSelection(1);
      useAlertStore.getState().toggleSelection(2);
      useAlertStore.getState().toggleSelection(3);
    });
    expect(useAlertStore.getState().selection.size).toBe(3);

    // Clear
    act(() => {
      useAlertStore.getState().clearSelection();
    });
    expect(useAlertStore.getState().selection.size).toBe(0);
  });

  it('should be idempotent on already empty selection', () => {
    act(() => {
      useAlertStore.getState().clearSelection();
    });
    expect(useAlertStore.getState().selection.size).toBe(0);

    act(() => {
      useAlertStore.getState().clearSelection();
    });
    expect(useAlertStore.getState().selection.size).toBe(0);
  });
});

// ── reset ─────────────────────────────────────────────────────────────

describe('alert.store — reset', () => {
  it('should restore initial state after mutations', () => {
    // Mutate
    useAlertStore.setState({
      alerts: [
        { id: 1, fisuraId: 10, fecha: '2026-01-01', tipo: 'critico', mensaje: 'Test', umbralSuperado: 100, valorActual: 150, reconocida: false },
      ] as any,
    });
    act(() => {
      useAlertStore.getState().toggleSelection(1);
      useAlertStore.getState().setFilters({ busqueda: 'test' });
      useAlertStore.getState().setPage(3);
    });

    // Reset
    act(() => {
      useAlertStore.getState().reset();
    });

    const state = useAlertStore.getState();
    expect(state.alerts).toEqual([]);
    expect(state.selection.size).toBe(0);
    expect(state.filters.tipo).toBe('todas');
    expect(state.filters.busqueda).toBe('');
    expect(state.pagination.page).toBe(1);
    expect(state.loading).toBe(false);
    expect(state.error).toBeNull();
  });
});

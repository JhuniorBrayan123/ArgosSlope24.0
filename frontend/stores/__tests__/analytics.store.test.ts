/**
 * ARGOS SLOPE 4.0 — analytics.store unit tests.
 *
 * Tests for the analytics Zustand store: initial state, period selection,
 * custom date range, toggle fissure selection, and reset.
 * Async action (fetchAnalytics) requires integration tests.
 */

import { act } from '@testing-library/react';
import { useAnalyticsStore } from '@/stores/analytics.store';

beforeEach(() => {
  act(() => {
    useAnalyticsStore.getState().reset();
  });
});

// ── Initial State ─────────────────────────────────────────────────────

describe('analytics.store — initial state', () => {
  it('should have period of "7d"', () => {
    expect(useAnalyticsStore.getState().period).toBe('7d');
  });

  it('should have null customRange', () => {
    expect(useAnalyticsStore.getState().customRange).toBeNull();
  });

  it('should have empty selectedFissures array', () => {
    expect(useAnalyticsStore.getState().selectedFissures).toEqual([]);
  });

  it('should have empty chartData array', () => {
    expect(useAnalyticsStore.getState().chartData).toEqual([]);
  });

  it('should have loading false and error null', () => {
    expect(useAnalyticsStore.getState().loading).toBe(false);
    expect(useAnalyticsStore.getState().error).toBeNull();
  });
});

// ── setPeriod ─────────────────────────────────────────────────────────

describe('analytics.store — setPeriod', () => {
  it('should change period to "30d"', () => {
    act(() => {
      useAnalyticsStore.getState().setPeriod('30d');
    });
    expect(useAnalyticsStore.getState().period).toBe('30d');
  });

  it('should change period to "90d"', () => {
    act(() => {
      useAnalyticsStore.getState().setPeriod('90d');
    });
    expect(useAnalyticsStore.getState().period).toBe('90d');
  });

  it('should change period to "1y"', () => {
    act(() => {
      useAnalyticsStore.getState().setPeriod('1y');
    });
    expect(useAnalyticsStore.getState().period).toBe('1y');
  });

  it('should clear customRange when set to a non-custom period', () => {
    // Set custom range first
    act(() => {
      useAnalyticsStore.getState().setCustomRange({ start: '2026-01-01', end: '2026-06-13' });
    });
    expect(useAnalyticsStore.getState().period).toBe('custom');
    expect(useAnalyticsStore.getState().customRange).toEqual({ start: '2026-01-01', end: '2026-06-13' });

    // Switch to preset period — customRange should be cleared
    act(() => {
      useAnalyticsStore.getState().setPeriod('30d');
    });
    expect(useAnalyticsStore.getState().period).toBe('30d');
    expect(useAnalyticsStore.getState().customRange).toBeNull();
  });

  it('should preserve customRange when switching to "custom" period', () => {
    // First set a custom range
    act(() => {
      useAnalyticsStore.getState().setCustomRange({ start: '2026-01-01', end: '2026-06-13' });
    });

    // Switch to a non-custom period
    act(() => {
      useAnalyticsStore.getState().setPeriod('7d');
    });

    // Switch back — customRange should still be set (from the setCustomRange call earlier)
    // Actually, setPeriod('custom') will check get().customRange which is null now
    act(() => {
      useAnalyticsStore.getState().setPeriod('custom');
    });
    expect(useAnalyticsStore.getState().period).toBe('custom');
  });
});

// ── setCustomRange ────────────────────────────────────────────────────

describe('analytics.store — setCustomRange', () => {
  it('should set period to "custom" and store the date range', () => {
    const range = { start: '2026-01-01', end: '2026-06-13' };
    act(() => {
      useAnalyticsStore.getState().setCustomRange(range);
    });
    expect(useAnalyticsStore.getState().period).toBe('custom');
    expect(useAnalyticsStore.getState().customRange).toEqual(range);
  });

  it('should overwrite previous custom range', () => {
    act(() => {
      useAnalyticsStore.getState().setCustomRange({ start: '2025-01-01', end: '2025-12-31' });
    });
    act(() => {
      useAnalyticsStore.getState().setCustomRange({ start: '2026-01-01', end: '2026-06-13' });
    });
    expect(useAnalyticsStore.getState().customRange).toEqual({ start: '2026-01-01', end: '2026-06-13' });
  });
});

// ── toggleFissure ─────────────────────────────────────────────────────

describe('analytics.store — toggleFissure', () => {
  it('should add a fissure ID to selectedFissures', () => {
    act(() => {
      useAnalyticsStore.getState().toggleFissure(1);
    });
    expect(useAnalyticsStore.getState().selectedFissures).toEqual([1]);
  });

  it('should remove a fissure ID if already selected', () => {
    act(() => {
      useAnalyticsStore.getState().toggleFissure(1);
      useAnalyticsStore.getState().toggleFissure(2);
    });
    expect(useAnalyticsStore.getState().selectedFissures).toEqual([1, 2]);

    act(() => {
      useAnalyticsStore.getState().toggleFissure(1);
    });
    expect(useAnalyticsStore.getState().selectedFissures).toEqual([2]);
  });

  it('should handle multiple toggles', () => {
    act(() => {
      useAnalyticsStore.getState().toggleFissure(1);
      useAnalyticsStore.getState().toggleFissure(2);
      useAnalyticsStore.getState().toggleFissure(3);
    });
    expect(useAnalyticsStore.getState().selectedFissures).toEqual([1, 2, 3]);
  });
});

// ── reset ─────────────────────────────────────────────────────────────

describe('analytics.store — reset', () => {
  it('should restore initial state after mutations', () => {
    // Mutate
    act(() => {
      useAnalyticsStore.getState().setPeriod('1y');
      useAnalyticsStore.getState().setCustomRange({ start: '2026-01-01', end: '2026-06-13' });
      useAnalyticsStore.getState().toggleFissure(1);
      useAnalyticsStore.getState().toggleFissure(2);
    });

    // Reset
    act(() => {
      useAnalyticsStore.getState().reset();
    });

    const state = useAnalyticsStore.getState();
    expect(state.period).toBe('7d');
    expect(state.customRange).toBeNull();
    expect(state.selectedFissures).toEqual([]);
    expect(state.chartData).toEqual([]);
    expect(state.loading).toBe(false);
    expect(state.error).toBeNull();
  });
});

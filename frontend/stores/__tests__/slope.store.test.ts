/**
 * ARGOS SLOPE 4.0 — slope.store unit tests.
 *
 * Tests for the 3D viewer Zustand store: initial state, point cloud
 * management, crack selection, timeline, view modes, and reset.
 */

import { act } from '@testing-library/react';
import { useSlopeStore, type CrackData } from '@/stores/slope.store';

beforeEach(() => {
  // Reset store to initial state before each test
  act(() => {
    useSlopeStore.getState().reset();
  });
});

// ── Initial State ─────────────────────────────────────────────────────

describe('slope.store — initial state', () => {
  it('should have empty points array', () => {
    const state = useSlopeStore.getState();
    expect(state.points).toEqual([]);
  });

  it('should have empty cracks array', () => {
    expect(useSlopeStore.getState().cracks).toEqual([]);
  });

  it('should have null selectedCrackId', () => {
    expect(useSlopeStore.getState().selectedCrackId).toBeNull();
  });

  it('should have null timestamp', () => {
    expect(useSlopeStore.getState().timestamp).toBeNull();
  });

  it('should have empty imagePath', () => {
    expect(useSlopeStore.getState().imagePath).toBe('');
  });

  it('should have timelineIndex of 0', () => {
    expect(useSlopeStore.getState().timelineIndex).toBe(0);
  });

  it('should have viewMode of "live"', () => {
    expect(useSlopeStore.getState().viewMode).toBe('live');
  });
});

// ── setPointCloud ─────────────────────────────────────────────────────

describe('slope.store — setPointCloud', () => {
  it('should update points, timestamp, cracks, and imagePath', () => {
    const points = [[0, 0, 0, 255, 0, 0]];
    const cracks: CrackData[] = [
      { x: 1, y: 2, w: 10, h: 20, classification: 'fina', roi_id: 'ROI_001' },
    ];
    const timestamp = '2026-06-13T00:00:00Z';
    const imagePath = '/captures/frame001.jpg';

    act(() => {
      useSlopeStore.getState().setPointCloud(points, timestamp, cracks, imagePath);
    });

    const state = useSlopeStore.getState();
    expect(state.points).toEqual(points);
    expect(state.timestamp).toBe(timestamp);
    expect(state.cracks).toEqual(cracks);
    expect(state.imagePath).toBe(imagePath);
  });

  it('should replace previous point cloud data', () => {
    const initial: CrackData[] = [
      { x: 1, y: 2, w: 10, h: 20, classification: 'fina', roi_id: 'ROI_001' },
    ];
    act(() => {
      useSlopeStore.getState().setPointCloud([[0, 0, 0, 255, 0, 0]], '2026-01-01T00:00:00Z', initial, '/old.jpg');
    });

    const replacement: CrackData[] = [
      { x: 3, y: 4, w: 15, h: 25, classification: 'media', roi_id: 'ROI_002' },
    ];
    act(() => {
      useSlopeStore.getState().setPointCloud([[1, 1, 1, 0, 255, 0]], '2026-06-01T00:00:00Z', replacement, '/new.jpg');
    });

    const state = useSlopeStore.getState();
    expect(state.points).toEqual([[1, 1, 1, 0, 255, 0]]);
    expect(state.cracks).toEqual(replacement);
    expect(state.timestamp).toBe('2026-06-01T00:00:00Z');
    expect(state.imagePath).toBe('/new.jpg');
  });
});

// ── selectCrack ───────────────────────────────────────────────────────

describe('slope.store — selectCrack', () => {
  it('should set selectedCrackId to the given roiId', () => {
    act(() => {
      useSlopeStore.getState().selectCrack('ROI_042');
    });
    expect(useSlopeStore.getState().selectedCrackId).toBe('ROI_042');
  });

  it('should clear selectedCrackId when passed null', () => {
    // Set first
    act(() => {
      useSlopeStore.getState().selectCrack('ROI_042');
    });
    // Then clear
    act(() => {
      useSlopeStore.getState().selectCrack(null);
    });
    expect(useSlopeStore.getState().selectedCrackId).toBeNull();
  });
});

// ── setCracks ─────────────────────────────────────────────────────────

describe('slope.store — setCracks', () => {
  it('should replace cracks array', () => {
    const cracks: CrackData[] = [
      { x: 10, y: 20, w: 30, h: 40, classification: 'gruesa', roi_id: 'ROI_003' },
    ];
    act(() => {
      useSlopeStore.getState().setCracks(cracks);
    });
    expect(useSlopeStore.getState().cracks).toEqual(cracks);
  });
});

// ── setTimelineIndex / setViewMode ────────────────────────────────────

describe('slope.store — setTimelineIndex', () => {
  it('should update timelineIndex', () => {
    act(() => {
      useSlopeStore.getState().setTimelineIndex(5);
    });
    expect(useSlopeStore.getState().timelineIndex).toBe(5);
  });
});

describe('slope.store — setViewMode', () => {
  it('should set viewMode to "playback"', () => {
    act(() => {
      useSlopeStore.getState().setViewMode('playback');
    });
    expect(useSlopeStore.getState().viewMode).toBe('playback');
  });

  it('should set viewMode to "comparison"', () => {
    act(() => {
      useSlopeStore.getState().setViewMode('comparison');
    });
    expect(useSlopeStore.getState().viewMode).toBe('comparison');
  });
});

// ── reset ─────────────────────────────────────────────────────────────

describe('slope.store — reset', () => {
  it('should restore initial state after mutations', () => {
    // Mutate state
    act(() => {
      useSlopeStore.getState().setPointCloud(
        [[0, 0, 0, 255, 0, 0]],
        '2026-06-13T00:00:00Z',
        [{ x: 1, y: 2, w: 10, h: 20, classification: 'fina', roi_id: 'ROI_001' }],
        '/img.jpg'
      );
      useSlopeStore.getState().selectCrack('ROI_001');
      useSlopeStore.getState().setTimelineIndex(3);
      useSlopeStore.getState().setViewMode('playback');
    });

    // Reset
    act(() => {
      useSlopeStore.getState().reset();
    });

    const state = useSlopeStore.getState();
    expect(state.points).toEqual([]);
    expect(state.cracks).toEqual([]);
    expect(state.selectedCrackId).toBeNull();
    expect(state.timestamp).toBeNull();
    expect(state.imagePath).toBe('');
    expect(state.timelineIndex).toBe(0);
    expect(state.viewMode).toBe('live');
  });
});

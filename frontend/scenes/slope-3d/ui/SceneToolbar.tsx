/**
 * ARGOS SLOPE 4.0 — Scene Toolbar.
 *
 * Top toolbar overlay on the 3D scene with:
 *  - Auto-rotate toggle
 *  - Reset view button
 *  - View mode selector (Live / Playback / Comparison)
 *  - Timeline scrubber (visible in Playback mode)
 *
 * State is managed through slope.store for cross-component consistency.
 * Dark theme styling matching the Argos Slope design system.
 *
 * NOTE: The timeline slider shows simulated dates (relative to today)
 * because real snapshot timestamps are not available yet. Each step
 * represents ~0.3 days over a 30-day lookback with 100 frames.
 */

'use client';

import { useCallback, useMemo } from 'react';
import { useSlopeStore, ViewMode } from '@/stores/slope.store';

// ── Icon components ───────────────────────────────────────────────────

function RotateIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="1 4 1 10 7 10" />
      <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
    </svg>
  );
}

function ResetIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="1 4 1 10 7 10" />
      <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
    </svg>
  );
}

// ── View Mode Config ──────────────────────────────────────────────────

const VIEW_MODES: { value: ViewMode; label: string }[] = [
  { value: 'live', label: 'En Vivo' },
  { value: 'playback', label: 'Historial' },
  { value: 'comparison', label: 'Comparar' },
];

// ── Component ─────────────────────────────────────────────────────────

export interface SceneToolbarProps {
  /** Current auto-rotate state (controlled by parent) */
  autoRotate: boolean;
  /** Toggle auto-rotate callback */
  onToggleAutoRotate: () => void;
  /** Reset camera to default position */
  onResetView: () => void;
  /** Maximum timeline value (number of snapshots) */
  maxTimeline?: number;
}

export default function SceneToolbar({
  autoRotate,
  onToggleAutoRotate,
  onResetView,
  maxTimeline = 100,
}: SceneToolbarProps) {
  const viewMode = useSlopeStore((s) => s.viewMode);
  const setViewMode = useSlopeStore((s) => s.setViewMode);
  const timelineIndex = useSlopeStore((s) => s.timelineIndex);
  const setTimelineIndex = useSlopeStore((s) => s.setTimelineIndex);

  const handleViewModeChange = useCallback(
    (mode: ViewMode) => {
      setViewMode(mode);
    },
    [setViewMode]
  );

  const handleTimelineChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setTimelineIndex(Number(e.target.value));
    },
    [setTimelineIndex]
  );

  const isPlayback = viewMode === 'playback';

  // Simulated date for the current timeline position:
  // maps index 0 → 30 days ago, index max-1 → today
  const timelineDate = useMemo(() => {
    const now = Date.now();
    const daysAgo = 30 * (1 - timelineIndex / Math.max(maxTimeline - 1, 1));
    const d = new Date(now - daysAgo * 86400000);
    return d.toLocaleDateString('es-ES', {
      day: '2-digit',
      month: 'short',
    });
  }, [timelineIndex, maxTimeline]);

  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-start justify-center pt-4">
      <div className="pointer-events-auto flex items-center gap-2 rounded-lg border border-dark-border bg-dark-surface/90 px-3 py-2 shadow-lg backdrop-blur-sm">
        {/* Auto-rotate toggle */}
        <button
          onClick={onToggleAutoRotate}
          title="Auto-rotar"
          className={`rounded-md p-2 transition-colors ${
            autoRotate
              ? 'bg-dark-accent/20 text-dark-accent'
              : 'text-dark-textSecondary hover:bg-dark-hover hover:text-dark-text'
          }`}
        >
          <RotateIcon />
        </button>

        {/* Divider */}
        <div className="h-6 w-px bg-dark-border" />

        {/* Reset view */}
        <button
          onClick={onResetView}
          title="Restablecer vista"
          className="rounded-md p-2 text-dark-textSecondary hover:bg-dark-hover hover:text-dark-text transition-colors"
        >
          <ResetIcon />
        </button>

        {/* Divider */}
        <div className="h-6 w-px bg-dark-border" />

        {/* View mode selector */}
        <div className="flex rounded-md border border-dark-border overflow-hidden">
          {VIEW_MODES.map((mode) => (
            <button
              key={mode.value}
              onClick={() => handleViewModeChange(mode.value)}
              className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                viewMode === mode.value
                  ? 'bg-dark-accent text-white'
                  : 'bg-dark-surface text-dark-textSecondary hover:bg-dark-hover hover:text-dark-text'
              }`}
            >
              {mode.label}
            </button>
          ))}
        </div>

        {/* Timeline scrubber (playback only) */}
        {isPlayback && (
          <>
            <div className="h-6 w-px bg-dark-border" />
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-dark-textSecondary/70 whitespace-nowrap">
                Línea de Tiempo
              </span>
              <input
                type="range"
                min={0}
                max={maxTimeline - 1}
                value={timelineIndex}
                onChange={handleTimelineChange}
                className="h-1 w-24 cursor-pointer appearance-none rounded-full bg-dark-border accent-dark-accent [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-dark-accent"
              />
              <span className="text-[10px] text-dark-textSecondary/70 min-w-[4.5rem] text-right tabular-nums">
                {timelineDate}
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

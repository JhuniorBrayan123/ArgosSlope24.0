/**
 * ARGOS SLOPE 4.0 — FotosView.
 *
 * Dynamic photo viewer that displays images from the analysis pipeline
 * using real image keys from the analysis JSON. Thumbnail cards show
 * the available image types (calibrada, mask, skeleton, familias_overlay)
 * with proper Spanish labels.
 */

'use client';

import React, { useState, useMemo } from 'react';
import { useResultsStore } from '@/stores/results.store';
import { Layers, Image as ImageIcon, AlertTriangle } from 'lucide-react';

// ── Image URL helpers (mirrored from page.tsx) ────────────────────────

function toImageUrl(filePath: string | null | undefined): string | null {
  if (!filePath) return null;
  const marker =
    'diagnostics' + String.fromCharCode(92) + 'output' + String.fromCharCode(92);
  const idx = filePath.indexOf(marker);
  if (idx === -1) {
    const marker2 = 'diagnostics/output/';
    const idx2 = filePath.indexOf(marker2);
    if (idx2 === -1) return null;
    const relPath = filePath.substring(idx2 + marker2.length);
    return `/api/monitoring-2d/diagnostics-output/${relPath}`;
  }
  const relPath = filePath.substring(idx + marker.length);
  return `/api/monitoring-2d/diagnostics-output/${relPath}`;
}

function imgSrc(url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  return url + '?t=' + Date.now();
}

// ── Constants ─────────────────────────────────────────────────────────

const IMAGE_LABELS: Record<string, string> = {
  calibrada: 'Calibrada',
  mask: 'Máscara Binaria',
  skeleton: 'Skeleton',
  familias_overlay: 'Familias Overlay',
};

const SORT_ORDER = ['calibrada', 'mask', 'skeleton', 'familias_overlay'];

// ── Props ─────────────────────────────────────────────────────────────

interface FotosViewProps {
  /** Raw image paths from the parsed analysis JSON. */
  images?: Record<string, string>;
}

// ═══════════════════════════════════════════════════════════════════════
//  FotosView
// ═══════════════════════════════════════════════════════════════════════

export function FotosView({ images = {} }: FotosViewProps) {
  const currentResult = useResultsStore((s) => s.currentResult);
  const families = useResultsStore((s) => s.families);

  // ── Build ordered list of available image keys ──────────────────────
  const imageKeys = useMemo(() => {
    return SORT_ORDER.filter((key) => images[key] != null);
  }, [images]);

  const [selectedIndex, setSelectedIndex] = useState(0);
  // Clamp selected index when images change
  const safeIndex = Math.min(selectedIndex, Math.max(0, imageKeys.length - 1));
  const activeKey = imageKeys[safeIndex] || '';
  const imageLabel = IMAGE_LABELS[activeKey] || activeKey;

  // ── Empty state ─────────────────────────────────────────────────────
  if (!currentResult) {
    return (
      <div className="shrink-0 rounded-xl border border-dark-border bg-dark-elevated p-8 mt-4 flex items-center justify-center">
        <div className="flex flex-col items-center gap-2">
          <Layers className="h-8 w-8 text-dark-muted" />
          <p className="text-sm text-dark-muted">
            Seleccioná un análisis para ver las fotos
          </p>
        </div>
      </div>
    );
  }

  // ── Large image URL ─────────────────────────────────────────────────
  const filePath = images[activeKey];
  const imageUrl = toImageUrl(filePath);

  // ── Risk evaluation (only on familias_overlay) ──────────────────────
  const hasCriticalCracks = families.some((f) => f.criticalCount > 0);
  const showRiskWarning = activeKey === 'familias_overlay' && hasCriticalCracks;

  return (
    <div className="shrink-0 mt-4 space-y-4">
      {/* ═══════ Thumbnail Cards Row ═══════ */}
      <div className="grid grid-cols-4 gap-3">
        {imageKeys.map((key, i) => {
          const isActive = i === safeIndex;
          const isFamiliesOverlay = key === 'familias_overlay';
          const cardRisk = isFamiliesOverlay && hasCriticalCracks ? 'critico' : 'bajo';

          return (
            <button
              key={key}
              onClick={() => setSelectedIndex(i)}
              className={`rounded-xl border bg-dark-elevated p-3 text-left transition-all hover:border-dark-accent/50 ${
                isActive
                  ? 'ring-1 ring-dark-accent border-dark-accent'
                  : 'border-dark-border'
              } ${
                cardRisk === 'critico'
                  ? 'border-l-red-500'
                  : 'border-l-emerald-500'
              } border-l-4`}
            >
              <p className="text-sm font-semibold text-dark-text">
                {IMAGE_LABELS[key] || key}
              </p>
              <p className="text-[11px] text-dark-muted mt-0.5 capitalize">
                {key.replace(/_/g, ' ')}
              </p>
              <p
                className={`mt-2 text-[11px] font-semibold capitalize ${
                  cardRisk === 'critico'
                    ? 'text-dark-danger'
                    : 'text-emerald-400'
                }`}
              >
                {cardRisk === 'critico' ? '⚠ Riesgo crítico' : 'Estable'}
              </p>
            </button>
          );
        })}
      </div>

      {/* ═══════ Large Image View ═══════ */}
      <div className="rounded-xl border border-dark-border bg-[#0f1115] overflow-hidden flex items-center justify-center min-h-[280px]">
        {imageUrl ? (
          <img
            src={imgSrc(imageUrl)}
            alt={imageLabel}
            className="w-full h-full object-contain max-h-[500px]"
          />
        ) : (
          <div className="flex flex-col items-center gap-2 text-dark-muted py-12">
            <ImageIcon className="h-10 w-10" />
            <p className="text-sm">Imagen no disponible para esta vista</p>
          </div>
        )}
      </div>

      {/* ═══════ Photo Summary ═══════ */}
      <div className="rounded-xl border border-dark-border bg-dark-elevated p-4">
        <h3 className="text-sm font-semibold text-dark-text mb-3">
          {imageLabel} — Resumen
        </h3>

        <div className="grid grid-cols-2 gap-4 mb-4">
          {/* Total cracks */}
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wider text-dark-muted">
              Fisuras detectadas
            </p>
            <p className="mt-1 text-lg font-bold text-dark-text">
              {currentResult.totalCracks}
            </p>
          </div>

          {/* Total length */}
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wider text-dark-muted">
              Longitud total
            </p>
            <p className="mt-1 text-lg font-bold text-dark-text">
              {currentResult.totalLengthCm.toFixed(1)}{' '}
              <span className="text-sm font-normal text-dark-muted">cm</span>
            </p>
          </div>
        </div>

        {/* Warning for critical cracks on familias_overlay */}
        {showRiskWarning && (
          <div className="flex items-center gap-2 rounded-lg bg-red-500/10 border border-red-500/30 px-3 py-2">
            <AlertTriangle className="h-4 w-4 text-dark-danger shrink-0" />
            <p className="text-xs text-dark-danger">
              Se detectaron {families.filter((f) => f.criticalCount > 0).length} familias con fisuras críticas
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

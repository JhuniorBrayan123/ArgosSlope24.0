/**
 * ARGOS SLOPE 4.0 — Scene Info Panel.
 *
 * Bottom-right info panel that appears when a fissure is selected.
 * Shows fissure details: ROI ID, dimensions (largo × ancho), type,
 * and a button to navigate to the fissure detail page.
 *
 * Data is resolved from the fissure list (already fetched by SlopeScene)
 * matched against slope.store.selectedCrackId (roi_id).
 */

'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { FisuraResponse } from '@/services/api-client';
import { useSlopeStore } from '@/stores/slope.store';
import { COLOR_FISURA } from '../scene/terrain';

// ── Props ────────────────────────────────────────────────────────────

export interface SceneInfoPanelProps {
  /** Full fissure list from the API (used for lookups by roiId) */
  fissures: FisuraResponse[];
}

// ── Component ─────────────────────────────────────────────────────────

export default function SceneInfoPanel({ fissures }: SceneInfoPanelProps) {
  const selectedCrackId = useSlopeStore((s) => s.selectedCrackId);
  const selectCrack = useSlopeStore((s) => s.selectCrack);

  // Resolve the selected fissure by roiId
  const selectedFissure = useMemo(() => {
    if (!selectedCrackId) return null;
    return fissures.find((f) => f.roiId === selectedCrackId) ?? null;
  }, [fissures, selectedCrackId]);

  if (!selectedFissure) {
    return null;
  }

  const color = COLOR_FISURA[selectedFissure.tipo] ?? '#888888';
  const tipoLabel = selectedFissure.tipo ?? 'desconocido';

  return (
    <div className="absolute bottom-4 right-4 z-10 w-64 rounded-lg border border-dark-border bg-dark-surface/95 px-4 py-3 shadow-lg backdrop-blur-sm">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span
            className="inline-block h-2.5 w-2.5 rounded-full shrink-0"
            style={{ backgroundColor: color }}
          />
          <p className="font-semibold text-dark-accent text-xs">
            {selectedFissure.roiId}
          </p>
        </div>
        <button
          onClick={() => selectCrack(null)}
          className="text-dark-textSecondary/50 hover:text-dark-text transition-colors"
          title="Limpiar selección"
        >
          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      {/* Dimensions */}
      <div className="space-y-1 text-xs">
        <div className="flex justify-between">
          <span className="text-dark-textSecondary">Largo</span>
          <span className="font-mono text-dark-text">{selectedFissure.largo.toFixed(1)} mm</span>
        </div>
        <div className="flex justify-between">
          <span className="text-dark-textSecondary">Ancho</span>
          <span className="font-mono text-dark-text">{selectedFissure.ancho.toFixed(2)} mm</span>
        </div>
        <div className="flex justify-between">
          <span className="text-dark-textSecondary">Área</span>
          <span className="font-mono text-dark-text">{selectedFissure.area.toFixed(1)} mm²</span>
        </div>
        <div className="flex justify-between">
          <span className="text-dark-textSecondary">Tipo</span>
          <span className="capitalize text-dark-text">{tipoLabel}</span>
        </div>
        {selectedFissure.deltaPorcentaje !== null && (
          <div className="flex justify-between">
            <span className="text-dark-textSecondary">Delta</span>
            <span className={`font-mono ${selectedFissure.deltaPorcentaje > 0 ? 'text-red-400' : 'text-dark-text'}`}>
              {selectedFissure.deltaPorcentaje > 0 ? '+' : ''}
              {selectedFissure.deltaPorcentaje.toFixed(1)}%
            </span>
          </div>
        )}
      </div>

      {/* Fecha de detección */}
      <p className="mt-2 text-[10px] text-dark-textSecondary/50">
        {new Date(selectedFissure.fechaDeteccion).toLocaleString('es-ES', {
          day: '2-digit',
          month: 'short',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        })}
      </p>

      {/* Action button */}
      <Link
        href={`/fisuras`}
        className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-md border border-dark-accent/30 bg-dark-accent/10 px-3 py-1.5 text-xs font-medium text-dark-accent transition-colors hover:bg-dark-accent/20"
      >
        <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
        Ver detalle
      </Link>
    </div>
  );
}

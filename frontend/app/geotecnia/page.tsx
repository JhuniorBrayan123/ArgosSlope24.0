'use client';

/**
 * ARGOS SLOPE 4.0 — Geotecnia Page.
 *
 * Geotechnical calculators: RQD, deformation analysis, and crack growth checks.
 * Dynamically imports GeotechnicalPanel (heavy component with complex forms).
 */

import dynamic from 'next/dynamic';

const GeotechnicalPanel = dynamic(
  () => import('@/features/geotecnia/GeotechnicalPanel'),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-64 items-center justify-center rounded-xl border border-dark-border bg-dark-surface">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-dark-accent border-t-transparent" />
          <p className="text-sm text-dark-secondary">Cargando calculadoras geotécnicas…</p>
        </div>
      </div>
    ),
  }
);

export default function GeotecniaPage() {
  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-dark-text">Geotecnia</h1>
        <p className="mt-1 text-sm text-dark-secondary">
          Cálculos geotécnicos: RQD, análisis de deformación y verificación de
          crecimiento de fisuras
        </p>
      </div>

      {/* Geotechnical Panel */}
      <GeotechnicalPanel />
    </div>
  );
}

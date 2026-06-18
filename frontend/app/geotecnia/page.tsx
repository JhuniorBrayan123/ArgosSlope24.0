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
          <p className="text-sm text-dark-textSecondary">Cargando calculadoras geotécnicas…</p>
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
        <p className="mt-1 text-sm text-dark-textSecondary">
          Calculadoras geotécnicas manuales: RQD, análisis de deformación y verificación de
          crecimiento de fisuras
        </p>
      </div>

      {/* Info Banner */}
      <div className="rounded-lg border border-dark-accent/30 bg-dark-accent/10 p-4">
        <div className="flex items-start gap-3">
          <svg className="mt-0.5 h-5 w-5 text-dark-accent shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div>
            <h3 className="text-sm font-bold text-dark-accent">Calculadoras Manuales</h3>
            <p className="mt-1 text-xs text-dark-textSecondary leading-relaxed">
              Esta página funciona como una herramienta de escritorio para realizar cálculos geotécnicos aislados o manuales, ingresando los valores de forma directa. 
              <br/><br/>
              Si deseás evaluar una captura de la cámara en tiempo real, deberías usar el botón <strong>"Evaluar RMR"</strong> integrado directamente en el módulo de <a href="/monitoreo" className="text-dark-text underline underline-offset-2 font-medium">Monitoreo 2D</a>.
            </p>
          </div>
        </div>
      </div>

      {/* Geotechnical Panel */}
      <GeotechnicalPanel />
    </div>
  );
}

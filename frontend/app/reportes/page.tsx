'use client';

/**
 * ARGOS SLOPE 4.0 — Reportes Page.
 *
 * Report generation: template selection, period picker, fissure selector,
 * preview with charts, and CSV/HTML export.
 * Dynamically imports ReportGenerator (recharts uses browser APIs).
 */

import dynamic from 'next/dynamic';

const ReportGenerator = dynamic(
  () => import('@/features/reportes/ReportGenerator'),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-64 items-center justify-center rounded-xl border border-dark-border bg-dark-surface">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-dark-accent border-t-transparent" />
          <p className="text-sm text-dark-secondary">Cargando generador de reportes…</p>
        </div>
      </div>
    ),
  }
);

export default function ReportesPage() {
  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-dark-text">Reportes</h1>
        <p className="mt-1 text-sm text-dark-secondary">
          Generación y exportación de reportes del monitoreo de talud
        </p>
      </div>

      {/* Report Generator */}
      <ReportGenerator />
    </div>
  );
}

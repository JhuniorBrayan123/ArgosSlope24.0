'use client';

/**
 * ARGOS SLOPE 4.0 — Analítica Page.
 *
 * Dashboard for trend analytics, charts, and multi-fissure comparison.
 * Dynamically imports AnalyticsDashboard (recharts uses browser APIs).
 */

import dynamic from 'next/dynamic';

const AnalyticsDashboard = dynamic(
  () => import('@/features/analytics/AnalyticsDashboard'),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-64 items-center justify-center rounded-xl border border-dark-border bg-dark-surface">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-dark-accent border-t-transparent" />
          <p className="text-sm text-dark-secondary">Cargando panel analítico…</p>
        </div>
      </div>
    ),
  }
);

export default function AnaliticaPage() {
  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-dark-text">Analítica</h1>
          <p className="mt-1 text-sm text-dark-secondary">
            Tendencias, proyecciones y comparación histórica de fisuras
          </p>
        </div>
      </div>

      {/* Analytics Dashboard */}
      <AnalyticsDashboard />
    </div>
  );
}

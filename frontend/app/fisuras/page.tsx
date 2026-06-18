'use client';

/**
 * ARGOS SLOPE 4.0 — Fisuras Page.
 *
 * CRUD management for detected fissures (fisuras).
 * FissureList as main view → FissureDetail replaces list when a fissure is selected.
 * FissureForm modal triggered by "Nueva Fisura" button.
 */

import { useState } from 'react';
import { useFissureStore } from '@/stores/fissure.store';
import FissureList from '@/features/fissures/FissureList';
import FissureDetail from '@/features/fissures/FissureDetail';
import FissureForm from '@/features/fissures/FissureForm';
import FissureTrendChart from '@/features/fissures/FissureTrendChart';

export default function FisurasPage() {
  const { selectedFissureId, selectFissure } = useFissureStore();
  const [showForm, setShowForm] = useState(false);

  // Show detail view when a fissure is selected
  const showDetail = selectedFissureId !== null;

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          {showDetail ? (
            <h1 className="text-2xl font-bold text-dark-text">
              Detalle de Fisura
            </h1>
          ) : (
            <>
              <h1 className="text-2xl font-bold text-dark-text">Fisuras</h1>
              <p className="mt-1 text-sm text-dark-textSecondary">
                Gestión completa de fisuras detectadas: listado, detalle,
                edición y eliminación
              </p>
            </>
          )}
        </div>
        {!showDetail && (
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-1.5 rounded-lg bg-dark-accent px-4 py-2 text-sm font-semibold text-dark-primary transition-opacity hover:opacity-90"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Nueva Fisura
          </button>
        )}
      </div>

      {/* ── Content area ─────────────────────────────────────────── */}
      {showDetail ? (
        /* Detail view (replaces list) */
        <FissureDetail
          fissureId={selectedFissureId!}
          onBack={() => selectFissure(null)}
        />
      ) : (
        /* List view (full width) */
        <>
          <FissureTrendChart />
          <FissureList onSelectFissure={(id) => selectFissure(id)} />
        </>
      )}

      {/* ── Create/Edit Form Modal ────────────────────────────────── */}
      {showForm && (
        <FissureForm onClose={() => setShowForm(false)} />
      )}
    </div>
  );
}

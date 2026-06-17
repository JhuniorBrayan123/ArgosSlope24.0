'use client';

/**
 * ARGOS SLOPE 4.0 — Alertas Page.
 *
 * Enhanced alert management with filters, bulk operations, and escalation.
 * Uses AlertCenter feature component backed by alert.store.
 */

import AlertCenter from '@/features/alertas/AlertCenter';

export default function AlertasPage() {
  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-dark-text">
          Centro de Alertas
        </h1>
        <p className="mt-1 text-sm text-dark-secondary">
          Gestión y seguimiento de alertas generadas por el sistema de monitoreo de talud
        </p>
      </div>

      {/* Alert Center */}
      <AlertCenter />
    </div>
  );
}

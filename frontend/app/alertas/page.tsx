'use client';

import AlertCenter from '@/features/alertas/AlertCenter';

export default function AlertasPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-dark-text">
          Centro de Alertas
        </h1>
        <p className="mt-1 text-sm text-dark-textSecondary">
          Gestión y seguimiento de alertas generadas por el sistema de monitoreo de talud
        </p>
      </div>

      <AlertCenter />
    </div>
  );
}

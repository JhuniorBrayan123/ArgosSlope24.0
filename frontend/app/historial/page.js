import TablaHistorial from '@/components/TablaHistorial';

/* ──────────────────────────────────────────────────────────────────
   Historial de Fisuras — Server component
   Lists all detected fissures with their current status.
   ────────────────────────────────────────────────────────────────── */

export const metadata = {
  title: 'Historial de Fisuras — ARGOS SLOPE 4.0',
  description: 'Historial completo de fisuras detectadas en el talud minero',
};

export default function HistorialPage() {
  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-dark-text">
          Historial de Fisuras
        </h1>
        <p className="mt-1 text-sm text-dark-secondary">
          Registro completo de todas las fisuras detectadas y su evolución en
          el tiempo
        </p>
      </div>

      {/* Data table */}
      <TablaHistorial />
    </div>
  );
}

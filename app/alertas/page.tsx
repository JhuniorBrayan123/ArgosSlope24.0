import PanelAlertas from '@/components/PanelAlertas';

export const metadata = {
  title: 'Alertas — ARGOS SLOPE 4.0',
  description: 'Centro de alertas y notificaciones del sistema de monitoreo',
};

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

      {/* Alertas panel */}
      <PanelAlertas />
    </div>
  );
}

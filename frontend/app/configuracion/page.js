import FormularioConfig from '@/components/FormularioConfig';

/* ──────────────────────────────────────────────────────────────────
   Configuración del Robot — Server component
   Robot processing parameters configuration page.
   ────────────────────────────────────────────────────────────────── */

export const metadata = {
  title: 'Configuración del Robot — ARGOS SLOPE 4.0',
  description: 'Parámetros de configuración del robot de monitoreo',
};

export default function ConfiguracionPage() {
  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-dark-text">
          Configuración del Robot
        </h1>
        <p className="mt-1 text-sm text-dark-secondary">
          Parámetros de calibración y umbrales del sistema de monitoreo
        </p>
      </div>

      {/* Configuration form */}
      <FormularioConfig />
    </div>
  );
}

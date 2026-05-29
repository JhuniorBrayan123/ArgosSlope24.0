import ComparacionFotos from '@/components/ComparacionFotos';
import GraficoDeformacion from '@/components/GraficoDeformacion';
import TarjetasResumen from '@/components/TarjetasResumen';

/* ──────────────────────────────────────────────────────────────────
   Panel Principal — Dashboard homepage
   Server component that renders the summary cards, photo comparison,
   and deformation chart in a responsive grid.
   ────────────────────────────────────────────────────────────────── */

export const metadata = {
  title: 'Panel Principal — ARGOS SLOPE 4.0',
  description: 'Panel principal de monitoreo de talud minero',
};

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-dark-text">Panel Principal</h1>
        <p className="mt-1 text-sm text-dark-secondary">
          Monitoreo de deformación de talud en tiempo real
        </p>
      </div>

      {/* Summary cards */}
      <TarjetasResumen />

      {/* Main grid: photo comparison + deformation chart */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <ComparacionFotos fisuraId={1} />
        <GraficoDeformacion fisuraId={1} />
      </div>
    </div>
  );
}

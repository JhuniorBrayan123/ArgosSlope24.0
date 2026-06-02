/**
 * ARGOS SLOPE 4.0 — Página principal.
 *
 * Ahora renderiza el PanelPrincipal unificado que consume el estado
 * global de MonitorContext. Todas las vistas (video, 3D, alertas)
 * viven en UNA SOLA PANTALLA sin pérdida de conexión al navegar.
 */

'use client';

import dynamic from 'next/dynamic';

const PanelPrincipal = dynamic(
  () => import('@/components/PanelPrincipal'),
  { ssr: false },
);

export default function HomePage() {
  return <PanelPrincipal />;
}

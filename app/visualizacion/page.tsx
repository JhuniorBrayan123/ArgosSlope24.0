'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import ModalDetalleFisura from '@/components/ModalDetalleFisura';

const Visualizacion3D = dynamic(
  () => import('@/components/Visualizacion3D'),
  { ssr: false, loading: () => (
    <div className="flex h-[500px] items-center justify-center rounded-xl border border-dark-border bg-dark-surface">
      <div className="h-10 w-10 animate-spin rounded-full border-2 border-dark-accent border-t-transparent" />
    </div>
  )}
);

export default function VisualizacionPage() {
  const [selectedFisuraId, setSelectedFisuraId] = useState<number | null>(null);

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-dark-text">
          Visualización 3D del Talud
        </h1>
        <p className="mt-1 text-sm text-dark-secondary">
          Mapa interactivo de fisuras detectadas sobre el modelo tridimensional del talud minero
        </p>
      </div>

      {/* 3D Viewer */}
      <Visualizacion3D
        onSelectFisura={(id) => setSelectedFisuraId(id)}
      />

      {/* Detail modal */}
      {selectedFisuraId && (
        <ModalDetalleFisura
          fisuraId={selectedFisuraId}
          onClose={() => setSelectedFisuraId(null)}
        />
      )}
    </div>
  );
}

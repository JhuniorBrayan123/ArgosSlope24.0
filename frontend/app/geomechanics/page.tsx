import React from 'react';
import GeomechanicsModule from '@/features/geomechanics/GeomechanicsModule';

export const metadata = {
  title: 'Módulo Geomecánico - Argos Slope 4.0',
  description: 'Cálculo de RQD y RMR para evaluación de taludes'
};

export default function GeomechanicsPage() {
  return (
    <div className="flex h-full flex-col space-y-4 animate-fade-in">
      <div className="flex shrink-0 items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-dark-text">
            Módulo Geomecánico
          </h1>
          <p className="mt-0.5 text-sm text-dark-muted">
            Cálculo de RQD y RMR para evaluación de taludes
          </p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto pb-8">
        <GeomechanicsModule />
      </div>
    </div>
  );
}

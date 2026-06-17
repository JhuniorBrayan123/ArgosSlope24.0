'use client';

import React from 'react';
import { RmrCalculationResponse, RqdCalculationResponse } from '@/services/geomechanicsService';

interface Props {
  rmrResult?: RmrCalculationResponse | null;
  rqdResult?: RqdCalculationResponse | null;
  onSave?: () => void;
  isSaving?: boolean;
}

export default function GeomechanicalResultCard({ rmrResult, rqdResult, onSave, isSaving = false }: Props) {
  
  const getColorClasses = (quality: string) => {
    switch(quality.toLowerCase()) {
      case 'muy buena': return 'bg-green-100 text-green-800 border-green-300 dark:bg-green-900/30 dark:text-green-300 dark:border-green-800';
      case 'buena': return 'bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800';
      case 'regular': return 'bg-yellow-100 text-yellow-800 border-yellow-300 dark:bg-yellow-900/30 dark:text-yellow-300 dark:border-yellow-800';
      case 'pobre':
      case 'mala': return 'bg-orange-100 text-orange-800 border-orange-300 dark:bg-orange-900/30 dark:text-orange-300 dark:border-orange-800';
      case 'muy pobre':
      case 'muy mala': return 'bg-red-100 text-red-800 border-red-300 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800';
      default: return 'bg-gray-100 text-gray-800 border-gray-300 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700';
    }
  };

  if (!rmrResult && !rqdResult) return null;

  return (
    <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700">
      <h3 className="text-2xl font-bold mb-6 text-gray-800 dark:text-white">Resultado Final</h3>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        {/* Tarjeta RQD */}
        {rqdResult && (
          <div className={`p-4 rounded border ${getColorClasses(rqdResult.quality)}`}>
            <div className="text-sm font-medium uppercase tracking-wide opacity-80 mb-1">RQD ({rqdResult.method})</div>
            <div className="flex items-baseline gap-2 mb-2">
              <span className="text-4xl font-extrabold">{rqdResult.value.toFixed(2)}</span>
              <span className="text-lg opacity-80">%</span>
            </div>
            <div className="text-lg font-semibold">{rqdResult.quality}</div>
            {rqdResult.jv && <div className="text-sm opacity-75 mt-2">Jv: {rqdResult.jv}</div>}
            {rqdResult.lambdaValue && <div className="text-sm opacity-75 mt-2">λ: {rqdResult.lambdaValue}</div>}
          </div>
        )}

        {/* Tarjeta RMR */}
        {rmrResult && (
          <div className={`p-4 rounded border ${getColorClasses(rmrResult.quality)}`}>
            <div className="text-sm font-medium uppercase tracking-wide opacity-80 mb-1">Clasificación RMR</div>
            <div className="flex items-baseline gap-2 mb-2">
              <span className="text-4xl font-extrabold">{rmrResult.value}</span>
              <span className="text-lg opacity-80">pts</span>
            </div>
            <div className="text-lg font-semibold">Clase {rmrResult.class} - {rmrResult.quality}</div>
          </div>
        )}
      </div>

      {onSave && rmrResult && (
        <button 
          onClick={onSave}
          disabled={isSaving}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-lg font-bold text-lg transition-colors disabled:opacity-50"
        >
          {isSaving ? 'Guardando Evaluación...' : 'Guardar Evaluación Geomecánica'}
        </button>
      )}
    </div>
  );
}

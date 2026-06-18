'use client';

import React, { useState } from 'react';
import { geomechanicsService, RqdCalculationResponse } from '@/services/geomechanicsService';

interface Props {
  onCalculated: (result: RqdCalculationResponse, payload: any) => void;
}

export default function PalmstromCalculator({ onCalculated }: Props) {
  const [count, setCount] = useState<number>(0);
  const [lengthM, setLengthM] = useState<number>(0);
  const [error, setError] = useState<string>('');

  const handleCalculate = async () => {
    try {
      setError('');
      if (lengthM <= 0) {
        setError('La longitud de línea debe ser mayor a 0');
        return;
      }
      if (count < 0) {
        setError('La cantidad de discontinuidades no puede ser negativa');
        return;
      }

      const payload = { discontinuityCount: count, lineLengthM: lengthM };
      const result = await geomechanicsService.calculatePalmstrom(payload);
      onCalculated(result, { ...payload, ...result, method: 'palmstrom' });
    } catch (err: any) {
      setError(err.message || 'Error al calcular RQD por Palmström');
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <h3 className="text-lg font-medium text-gray-800 dark:text-gray-200">Parámetros de Medición</h3>
      
      <div className="flex gap-6 items-center bg-white dark:bg-gray-800 p-4 rounded shadow-sm border border-gray-200 dark:border-gray-700">
        <div className="flex flex-col w-1/3">
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            N° de discontinuidades
          </label>
          <input 
            type="number" 
            value={count || ''} 
            onChange={(e) => setCount(parseInt(e.target.value))}
            className="border p-2 rounded w-full dark:bg-gray-700 dark:border-gray-600 dark:text-white"
          />
        </div>
        <div className="flex flex-col w-1/3">
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Longitud de línea (m)
          </label>
          <input 
            type="number" 
            step="0.1"
            value={lengthM || ''} 
            onChange={(e) => setLengthM(parseFloat(e.target.value))}
            className="border p-2 rounded w-full dark:bg-gray-700 dark:border-gray-600 dark:text-white"
          />
        </div>
        <div className="w-1/3 mt-6">
          <button 
            onClick={handleCalculate}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded w-full font-bold"
          >
            Calcular RQD (Palmström)
          </button>
        </div>
      </div>

      {error && <div className="text-red-500 mt-2">{error}</div>}
    </div>
  );
}

'use client';

import React, { useState } from 'react';
import HudsonCalculator from './HudsonCalculator';
import PalmstromCalculator from './PalmstromCalculator';
import { RqdCalculationResponse } from '@/services/geomechanicsService';

interface Props {
  onCalculated: (result: RqdCalculationResponse, payload: any) => void;
}

export default function RqdCalculator({ onCalculated }: Props) {
  const [method, setMethod] = useState<'hudson' | 'palmstrom'>('hudson');

  return (
    <div>
      <div className="mb-6 flex gap-4">
        <button
          className={`px-4 py-2 rounded font-medium transition-colors ${
            method === 'hudson' 
              ? 'bg-blue-600 text-white' 
              : 'bg-gray-200 text-gray-700 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600'
          }`}
          onClick={() => setMethod('hudson')}
        >
          Método Hudson / Jv
        </button>
        <button
          className={`px-4 py-2 rounded font-medium transition-colors ${
            method === 'palmstrom' 
              ? 'bg-blue-600 text-white' 
              : 'bg-gray-200 text-gray-700 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600'
          }`}
          onClick={() => setMethod('palmstrom')}
        >
          Método Palmström
        </button>
      </div>

      <div className="p-4 border rounded bg-gray-50 dark:bg-gray-900 border-gray-200 dark:border-gray-700">
        {method === 'hudson' ? (
          <HudsonCalculator onCalculated={onCalculated} />
        ) : (
          <PalmstromCalculator onCalculated={onCalculated} />
        )}
      </div>
    </div>
  );
}

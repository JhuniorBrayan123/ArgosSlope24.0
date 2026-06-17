'use client';

import React, { useState, useEffect } from 'react';
import { geomechanicsService, RqdCalculationResponse } from '@/services/geomechanicsService';
import RqdCalculator from './RqdCalculator';
import RmrCalculator from './RmrCalculator';
import GeomechanicalResultCard from './GeomechanicalResultCard';
import EvaluationHistoryTable from './EvaluationHistoryTable';

export default function GeomechanicsModule() {
  const [rqdResult, setRqdResult] = useState<RqdCalculationResponse | null>(null);
  const [rqdPayload, setRqdPayload] = useState<any>(null); // Guardar para cuando se envíe la evaluación

  const handleRqdCalculated = (result: RqdCalculationResponse, payload: any) => {
    setRqdResult(result);
    setRqdPayload(payload);
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Sección RQD */}
      <section className="argos-card p-6">
        <h2 className="text-base font-semibold mb-4 text-dark-text">1. Cálculo de RQD</h2>
        <RqdCalculator onCalculated={handleRqdCalculated} />
      </section>

      {/* Sección RMR */}
      <section className="argos-card p-6">
        <h2 className="text-base font-semibold mb-4 text-dark-text">2. Cálculo de RMR</h2>
        <RmrCalculator 
          calculatedRqd={rqdResult ? rqdResult.value : undefined} 
          rqdPayload={rqdPayload}
        />
      </section>

      {/* Historial */}
      <section className="mt-4">
        <EvaluationHistoryTable />
      </section>
    </div>
  );
}

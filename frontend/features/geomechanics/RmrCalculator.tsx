'use client';

import React, { useState, useEffect } from 'react';
import { geomechanicsService, RmrCatalogOption, RmrCalculationResponse, RmrParameterDto } from '@/services/geomechanicsService';
import RmrParameterSelector from './RmrParameterSelector';
import GeomechanicalResultCard from './GeomechanicalResultCard';

interface Props {
  calculatedRqd?: number;
  rqdPayload?: any;
}

const PARAMETER_TITLES: Record<string, string> = {
  compressive_strength: 'Resistencia a compresión',
  rqd: 'RQD',
  discontinuity_spacing: 'Espaciamiento',
  persistence: 'Persistencia',
  aperture: 'Apertura',
  roughness: 'Rugosidad',
  infilling: 'Relleno',
  weathering: 'Alteración',
  groundwater: 'Agua subterránea',
  discontinuity_orientation: 'Orientación'
};

export default function RmrCalculator({ calculatedRqd, rqdPayload }: Props) {
  const [catalogs, setCatalogs] = useState<Record<string, RmrCatalogOption[]>>({});
  const [selections, setSelections] = useState<Record<string, RmrParameterDto>>({});
  const [rmrResult, setRmrResult] = useState<RmrCalculationResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Cargar catálogos
  useEffect(() => {
    geomechanicsService.getCatalogs()
      .then(data => {
        setCatalogs(data);
        setLoading(false);
      })
      .catch(err => console.error(err));
  }, []);

  // Autocompletar RQD si cambia calculado
  useEffect(() => {
    if (calculatedRqd !== undefined && catalogs['rqd']) {
      const rqdOptions = catalogs['rqd'];
      let selectedOption = rqdOptions.find(o => 
        (o.minValue !== undefined && o.maxValue !== undefined) && 
        (calculatedRqd >= o.minValue && calculatedRqd <= (o.maxValue === 100 ? 100 : o.maxValue))
      );
      
      if (calculatedRqd === 100) selectedOption = rqdOptions.find(o => o.code === 'rqd_1');

      if (selectedOption) {
        setSelections(prev => ({
          ...prev,
          'rqd': {
            parameterKey: 'rqd',
            selectedCode: selectedOption!.code,
            selectedLabel: selectedOption!.label,
            score: selectedOption!.score,
            source: 'calculated',
            isAuto: true
          }
        }));
      }
    }
  }, [calculatedRqd, catalogs]);

  // Recalcular RMR automáticamente cuando cambien las selecciones
  useEffect(() => {
    const params = Object.values(selections);
    if (params.length > 0) {
      geomechanicsService.calculateRmr({ parameters: params })
        .then(result => setRmrResult(result))
        .catch(err => console.error("Error calculando RMR en tiempo real:", err));
    } else {
      setRmrResult(null);
    }
    setSaveSuccess(false);
  }, [selections]);

  const handleSelect = (parameterKey: string, code: string) => {
    const option = catalogs[parameterKey]?.find(o => o.code === code);
    if (option) {
      setSelections(prev => ({
        ...prev,
        [parameterKey]: {
          parameterKey,
          selectedCode: option.code,
          selectedLabel: option.label,
          score: option.score,
          source: 'manual',
          isAuto: false
        }
      }));
    }
  };

  const handleSaveEvaluation = async () => {
    setSaving(true);
    try {
      await geomechanicsService.saveEvaluation({
        zoneId: 'talud-norte-01', // Harcoded temporalmente
        notes: 'Evaluación generada desde UI',
        rqd: rqdPayload,
        rmr: {
          value: rmrResult?.value,
          class: rmrResult?.class,
          quality: rmrResult?.quality,
          parameters: Object.values(selections)
        }
      });
      setSaveSuccess(true);
      alert('Evaluación guardada exitosamente');
    } catch (err) {
      console.error(err);
      alert('Error al guardar evaluación');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="text-gray-500">Cargando selectores de RMR...</div>;

  // Ordenar las claves para que aparezcan en el orden correcto
  const orderedKeys = [
    'compressive_strength', 'rqd', 'discontinuity_spacing',
    'persistence', 'aperture', 'roughness',
    'infilling', 'weathering', 'groundwater',
    'discontinuity_orientation'
  ].filter(key => catalogs[key]);

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-4">
        {orderedKeys.map(key => (
          <RmrParameterSelector
            key={key}
            title={PARAMETER_TITLES[key] || catalogs[key][0]?.parameterKey || key}
            options={catalogs[key]}
            selectedCode={selections[key]?.selectedCode || ''}
            onSelect={(code) => handleSelect(key, code)}
            isAuto={selections[key]?.isAuto}
          />
        ))}
      </div>

      {rmrResult && (
        <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
          <GeomechanicalResultCard 
            rmrResult={rmrResult}
            rqdResult={rqdPayload}
            onSave={handleSaveEvaluation}
            isSaving={saving}
          />
        </div>
      )}
    </div>
  );
}

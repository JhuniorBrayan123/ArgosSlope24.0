'use client';

import React, { useState } from 'react';
import { geomechanicsService, RqdCalculationResponse, RqdJointFamilyDto } from '@/services/geomechanicsService';

interface Props {
  onCalculated: (result: RqdCalculationResponse, payload: any) => void;
}

export default function HudsonCalculator({ onCalculated }: Props) {
  const [families, setFamilies] = useState<RqdJointFamilyDto[]>([
    { familyName: 'F1', spacingM: 0, source: 'manual', detectedByOpenCv: false }
  ]);
  const [error, setError] = useState<string>('');

  const addFamily = () => {
    setFamilies([
      ...families, 
      { familyName: `F${families.length + 1}`, spacingM: 0, source: 'manual', detectedByOpenCv: false }
    ]);
  };

  const removeFamily = (index: number) => {
    if (families.length <= 1) return;
    const newFamilies = [...families];
    newFamilies.splice(index, 1);
    setFamilies(newFamilies);
  };

  const handleChange = (index: number, field: keyof RqdJointFamilyDto, value: any) => {
    const newFamilies = [...families];
    newFamilies[index] = { ...newFamilies[index], [field]: value };
    setFamilies(newFamilies);
  };

  const handleCalculate = async () => {
    try {
      setError('');
      if (families.some(f => f.spacingM <= 0)) {
        setError('El espaciamiento de todas las familias debe ser mayor a 0');
        return;
      }

      const payload = { jointFamilies: families };
      const result = await geomechanicsService.calculateHudson(payload);
      onCalculated(result, { ...payload, ...result, method: 'hudson' });
    } catch (err: any) {
      setError(err.message || 'Error al calcular RQD por Hudson');
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <h3 className="text-lg font-medium text-gray-800 dark:text-gray-200">Familias de Discontinuidades</h3>
      
      {families.map((family, index) => (
        <div key={index} className="flex gap-4 items-center bg-white dark:bg-gray-800 p-3 rounded shadow-sm border border-gray-200 dark:border-gray-700">
          <div className="flex flex-col">
            <label className="text-sm text-gray-500">Nombre</label>
            <input 
              type="text" 
              value={family.familyName} 
              onChange={(e) => handleChange(index, 'familyName', e.target.value)}
              className="border p-2 rounded dark:bg-gray-700 dark:border-gray-600 dark:text-white"
            />
          </div>
          <div className="flex flex-col">
            <label className="text-sm text-gray-500">Espaciamiento (m)</label>
            <input 
              type="number" 
              step="0.01"
              value={family.spacingM || ''} 
              onChange={(e) => handleChange(index, 'spacingM', parseFloat(e.target.value))}
              className="border p-2 rounded dark:bg-gray-700 dark:border-gray-600 dark:text-white"
            />
          </div>
          <div className="flex flex-col">
            <label className="text-sm text-gray-500">Orientación (opcional)</label>
            <input 
              type="number" 
              value={family.orientationDeg || ''} 
              onChange={(e) => handleChange(index, 'orientationDeg', parseFloat(e.target.value))}
              className="border p-2 rounded dark:bg-gray-700 dark:border-gray-600 dark:text-white"
            />
          </div>
          <div className="mt-5">
            <button 
              onClick={() => removeFamily(index)}
              disabled={families.length <= 1}
              className="bg-red-500 hover:bg-red-600 text-white p-2 rounded disabled:opacity-50"
            >
              Eliminar
            </button>
          </div>
        </div>
      ))}

      <div className="flex gap-4 mt-2">
        <button 
          onClick={addFamily}
          className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded"
        >
          + Añadir Familia
        </button>
        <button 
          onClick={handleCalculate}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded font-bold"
        >
          Calcular RQD (Hudson)
        </button>
      </div>

      {error && <div className="text-red-500 mt-2">{error}</div>}
    </div>
  );
}

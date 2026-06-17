'use client';

import React, { useEffect, useState } from 'react';
import { geomechanicsService } from '@/services/geomechanicsService';

export default function EvaluationHistoryTable() {
  const [evaluations, setEvaluations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    geomechanicsService.getEvaluations()
      .then(data => {
        setEvaluations(data);
        setLoading(false);
      })
      .catch(err => {
        console.error(err);
        setLoading(false);
      });
  }, []);

  if (loading) return <div>Cargando historial...</div>;

  return (
    <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow border border-gray-200 dark:border-gray-700">
      <h3 className="text-xl font-bold mb-4 text-gray-800 dark:text-white">Historial de Evaluaciones</h3>
      
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
              <th className="p-3 border-b border-gray-200 dark:border-gray-600 font-medium">Fecha</th>
              <th className="p-3 border-b border-gray-200 dark:border-gray-600 font-medium">Zona</th>
              <th className="p-3 border-b border-gray-200 dark:border-gray-600 font-medium">Método RQD</th>
              <th className="p-3 border-b border-gray-200 dark:border-gray-600 font-medium">RQD</th>
              <th className="p-3 border-b border-gray-200 dark:border-gray-600 font-medium">RMR</th>
              <th className="p-3 border-b border-gray-200 dark:border-gray-600 font-medium">Clase RMR</th>
              <th className="p-3 border-b border-gray-200 dark:border-gray-600 font-medium">Calidad RMR</th>
            </tr>
          </thead>
          <tbody>
            {evaluations.length === 0 ? (
              <tr>
                <td colSpan={7} className="p-4 text-center text-gray-500">No hay evaluaciones registradas.</td>
              </tr>
            ) : (
              evaluations.map((ev, i) => (
                <tr key={ev.id || i} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                  <td className="p-3 border-b border-gray-100 dark:border-gray-700 text-sm">
                    {new Date(ev.createdAt).toLocaleString()}
                  </td>
                  <td className="p-3 border-b border-gray-100 dark:border-gray-700">{ev.zoneId || '-'}</td>
                  <td className="p-3 border-b border-gray-100 dark:border-gray-700 capitalize">{ev.rqdMethod || '-'}</td>
                  <td className="p-3 border-b border-gray-100 dark:border-gray-700 font-medium">{ev.rqdValue?.toFixed(2) || '-'}</td>
                  <td className="p-3 border-b border-gray-100 dark:border-gray-700 font-bold">{ev.rmrValue || '-'}</td>
                  <td className="p-3 border-b border-gray-100 dark:border-gray-700">{ev.rmrClass || '-'}</td>
                  <td className="p-3 border-b border-gray-100 dark:border-gray-700">{ev.rmrQuality || '-'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

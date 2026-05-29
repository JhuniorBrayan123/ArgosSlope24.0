'use client';

import { useEffect, useState } from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { obtenerMediciones } from '@/lib/api';

/* ──────────────────────────────────────────────────────────────────
   GraficoDeformacion
   7-day deformation LineChart using Recharts.
   ────────────────────────────────────────────────────────────────── */

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload || !payload.length) return null;
  return (
    <div className="rounded-lg border border-dark-border bg-dark-surface px-3 py-2 text-sm shadow-xl">
      <p className="mb-1 font-medium text-dark-secondary">{label}</p>
      {payload.map((entry, i) => (
        <p key={i} style={{ color: entry.color }} className="font-semibold">
          {entry.name}: {Number(entry.value).toFixed(2)} mm
        </p>
      ))}
    </div>
  );
}

export default function GraficoDeformacion({ fisuraId }) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [critical, setCritical] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function fetchData() {
      try {
        const meds = await obtenerMediciones(fisuraId, 7);
        if (!mounted) return;

        const chartData = meds.map((m) => ({
          fecha: new Date(m.fecha).toLocaleDateString('es-ES', {
            day: '2-digit',
            month: '2-digit',
          }),
          largo: m.largo_mm,
          ancho: m.ancho_mm,
          area: m.area_mm2,
        }));

        setData(chartData);

        // Check if any measurement is critical
        const hasCritical = meds.some((m) => m.es_critica);
        setCritical(hasCritical);
      } catch {
        // keep empty state
      } finally {
        if (mounted) setLoading(false);
      }
    }

    fetchData();
    return () => {
      mounted = false;
    };
  }, [fisuraId]);

  const isEmpty = !loading && data.length === 0;

  return (
    <div className="rounded-xl border border-dark-border bg-dark-surface p-5">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-base font-semibold text-dark-text">
          Deformación (últimos 7 días)
        </h3>
        {critical && (
          <span className="flex items-center gap-1.5 rounded-full bg-dark-danger/15 px-3 py-1 text-xs font-semibold text-dark-danger">
            ⚠ Crecimiento crítico detectado (&gt;5%)
          </span>
        )}
      </div>

      {isEmpty ? (
        <div className="flex h-64 items-center justify-center rounded-lg border border-dashed border-dark-border bg-dark-primary">
          <p className="text-sm text-dark-secondary">Sin datos disponibles</p>
        </div>
      ) : (
        <div className="relative">
          {loading && (
            <div className="absolute inset-0 z-10 flex items-center justify-center rounded-lg bg-dark-surface/80">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-dark-accent border-t-transparent" />
            </div>
          )}

          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={data} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2a2a4a" />
              <XAxis
                dataKey="fecha"
                stroke="#8888aa"
                tick={{ fontSize: 12, fill: '#8888aa' }}
                axisLine={{ stroke: '#2a2a4a' }}
              />
              <YAxis
                stroke="#8888aa"
                tick={{ fontSize: 12, fill: '#8888aa' }}
                axisLine={{ stroke: '#2a2a4a' }}
                unit=" mm"
              />
              <Tooltip content={<CustomTooltip />} />
              <Line
                name="Largo"
                type="monotone"
                dataKey="largo"
                stroke={critical ? '#ef4444' : '#00d4aa'}
                strokeWidth={2}
                dot={{ r: 3, fill: critical ? '#ef4444' : '#00d4aa' }}
                activeDot={{ r: 5 }}
              />
              <Line
                name="Ancho"
                type="monotone"
                dataKey="ancho"
                stroke="#8888aa"
                strokeWidth={1.5}
                dot={{ r: 2, fill: '#8888aa' }}
                strokeDasharray="4 2"
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

'use client';

import { useEffect, useState } from 'react';
import { obtenerResumen } from '@/lib/api';

/* ──────────────────────────────────────────────────────────────────
   TarjetasResumen
   Dashboard summary cards with 30 s polling.
   ────────────────────────────────────────────────────────────────── */

function Indicador({ activo }) {
  return (
    <span
      className={`inline-block h-3 w-3 rounded-full ${
        activo ? 'bg-green-500 shadow-[0_0_8px_#22c55e]' : 'bg-dark-danger shadow-[0_0_8px_#ef4444]'
      }`}
    />
  );
}

export default function TarjetasResumen() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function fetchData() {
      try {
        const res = await obtenerResumen();
        if (mounted) {
          setData(res);
          setError(false);
        }
      } catch {
        if (mounted) setError(true);
      }
    }

    fetchData();
    const id = setInterval(fetchData, 30_000);
    return () => {
      mounted = false;
      clearInterval(id);
    };
  }, []);

  const total = data?.total_fisuras ?? '—';
  const alertas = data?.alertas_criticas ?? '—';
  const rpi = data?.rpi_conectada;
  const defecto = data?.deformacion_promedio ?? '—';

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      {/* ── Total Fisuras ── */}
      <div className="rounded-xl border border-dark-border bg-dark-surface p-5">
        <p className="mb-1 text-sm font-medium text-dark-secondary">
          Total Fisuras Detectadas
        </p>
        <p className="text-3xl font-bold text-dark-text">
          {error ? '—' : total}
        </p>
      </div>

      {/* ── Alertas Críticas ── */}
      <div className="rounded-xl border border-dark-border bg-dark-surface p-5">
        <p className="mb-1 text-sm font-medium text-dark-secondary">
          Alertas Críticas
        </p>
        <p
          className={`text-3xl font-bold ${
            !error && Number(alertas) > 0 ? 'text-dark-danger' : 'text-dark-text'
          }`}
        >
          {error ? '—' : alertas}
        </p>
      </div>

      {/* ── Conexión Raspberry Pi ── */}
      <div className="rounded-xl border border-dark-border bg-dark-surface p-5">
        <p className="mb-1 text-sm font-medium text-dark-secondary">
          Conexión Raspberry Pi
        </p>
        <div className="flex items-center gap-3">
          <Indicador activo={!error && rpi === true} />
          <span className="text-lg font-semibold text-dark-text">
            {error
              ? '—'
              : rpi
              ? 'Conectada'
              : 'Desconectada'}
          </span>
        </div>
      </div>
    </div>
  );
}

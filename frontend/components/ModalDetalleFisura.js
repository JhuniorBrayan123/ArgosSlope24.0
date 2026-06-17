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
import { obtenerFisura } from '@/lib/api';

/* ──────────────────────────────────────────────────────────────────
   ModalDetalleFisura
   Full-screen modal showing fissure detail, measurements chart, and alerts.
   ────────────────────────────────────────────────────────────────── */

function ChartTooltip({ active, payload, label }) {
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

export default function ModalDetalleFisura({ fisuraId, onClose }) {
  const [detalle, setDetalle] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function fetchData() {
      try {
        const data = await obtenerFisura(fisuraId);
        if (mounted) setDetalle(data);
      } catch {
        if (mounted) setError(true);
      } finally {
        if (mounted) setLoading(false);
      }
    }

    fetchData();
  }, [fisuraId]);

  // Close on Escape key
  useEffect(() => {
    function handleKey(e) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const chartData =
    detalle?.mediciones?.map((m) => ({
      fecha: new Date(m.fecha).toLocaleDateString('es-ES', {
        day: '2-digit',
        month: '2-digit',
      }),
      largo: m.largo_mm,
      ancho: m.ancho_mm,
    })) ?? [];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="mx-4 max-h-[85vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-dark-border bg-dark-surface p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Header ── */}
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-xl font-bold text-dark-text">
            {loading
              ? 'Cargando...'
              : detalle
              ? `Fisura #${detalle.fisura.id} — ${detalle.fisura.roi_id}`
              : 'Fisura no encontrada'}
          </h2>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-dark-secondary transition-colors hover:bg-dark-hover hover:text-dark-text"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* ── Loading ── */}
        {loading && (
          <div className="flex h-48 items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-dark-accent border-t-transparent" />
          </div>
        )}

        {/* ── Error ── */}
        {error && (
          <div className="flex h-32 items-center justify-center rounded-lg border border-dashed border-dark-border bg-dark-primary">
            <p className="text-sm text-dark-secondary">
              No se pudo cargar el detalle de la fisura.
            </p>
          </div>
        )}

        {/* ── Content ── */}
        {detalle && (
          <div className="space-y-6">
            {/* Info grid */}
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              {[
                ['Tipo', detalle.fisura.tipo ?? '—'],
                ['Orientación', detalle.fisura.orientacion ?? '—'],
                ['Largo', `${detalle.fisura.largo_mm.toFixed(1)} mm`],
                ['Ancho', `${detalle.fisura.ancho_mm.toFixed(2)} mm`],
                ['Área', `${detalle.fisura.area_mm2.toFixed(1)} mm²`],
                ['Mediciones', String(detalle.total_mediciones)],
              ].map(([label, value]) => (
                <div
                  key={label}
                  className="rounded-lg border border-dark-border bg-dark-primary p-3"
                >
                  <p className="text-[11px] font-medium uppercase tracking-wider text-dark-secondary">
                    {label}
                  </p>
                  <p className="mt-1 font-semibold text-dark-text">{value}</p>
                </div>
              ))}
            </div>

            {/* Histórico chart */}
            {chartData.length > 0 && (
              <div>
                <h4 className="mb-3 text-sm font-semibold text-dark-text">
                  Histórico de Mediciones
                </h4>
                <div className="rounded-lg border border-dark-border bg-dark-primary p-4">
                  <ResponsiveContainer width="100%" height={220}>
                    <LineChart data={chartData} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#2a2a4a" />
                      <XAxis
                        dataKey="fecha"
                        stroke="#8888aa"
                        tick={{ fontSize: 11, fill: '#8888aa' }}
                        axisLine={{ stroke: '#2a2a4a' }}
                      />
                      <YAxis
                        stroke="#8888aa"
                        tick={{ fontSize: 11, fill: '#8888aa' }}
                        axisLine={{ stroke: '#2a2a4a' }}
                        unit=" mm"
                      />
                      <Tooltip content={<ChartTooltip />} />
                      <Line
                        name="Largo"
                        type="monotone"
                        dataKey="largo"
                        stroke="#00d4aa"
                        strokeWidth={2}
                        dot={{ r: 3, fill: '#00d4aa' }}
                      />
                      <Line
                        name="Ancho"
                        type="monotone"
                        dataKey="ancho"
                        stroke="#8888aa"
                        strokeWidth={1.5}
                        strokeDasharray="4 2"
                        dot={{ r: 2, fill: '#8888aa' }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {/* Alertas */}
            {detalle.alertas?.length > 0 && (
              <div>
                <h4 className="mb-3 text-sm font-semibold text-dark-text">
                  Alertas Relacionadas
                </h4>
                <div className="space-y-2">
                  {detalle.alertas.map((a) => (
                    <div
                      key={a.id}
                      className={`rounded-lg border p-3 ${
                        a.reconocida
                          ? 'border-dark-border bg-dark-primary'
                          : 'border-dark-danger/30 bg-dark-danger/5'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold uppercase tracking-wider text-dark-secondary">
                          {a.tipo}
                        </span>
                        <span
                          className={`text-[11px] ${
                            a.reconocida ? 'text-dark-accent' : 'text-dark-danger'
                          }`}
                        >
                          {a.reconocida ? 'Reconocida' : 'Pendiente'}
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-dark-text">{a.mensaje}</p>
                      <p className="mt-0.5 text-[11px] text-dark-secondary">
                        {new Date(a.fecha).toLocaleString('es-ES')}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Cerrar */}
            <div className="flex justify-end pt-2">
              <button
                onClick={onClose}
                className="rounded-lg bg-dark-accent px-5 py-2 text-sm font-semibold text-dark-primary transition-opacity hover:opacity-90"
              >
                Cerrar
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

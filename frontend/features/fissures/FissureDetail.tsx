'use client';

/**
 * ARGOS SLOPE 4.0 — FissureDetail.
 *
 * Full detail view of a single fissure: info grid, timeline chart,
 * alerts, attachments placeholder, archive/delete actions.
 * Reuses logic patterns from ModalDetalleFisura.js.
 */

import { useEffect, useMemo, useState } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { useFissureStore } from '@/stores/fissure.store';
import type { FisuraDetalleResponse, MedicionResponse } from '@/services/api-client';

// ── Dark-theme chart constants ────────────────────────────────────────
const AXIS_STROKE = '#8888aa';
const GRID_STROKE = '#2a2a4a';
const TICK_FONT = { fontSize: 11, fill: '#8888aa' };

// ── Chart tooltip ─────────────────────────────────────────────────────
function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-dark-border bg-dark-surface px-3 py-2 text-sm shadow-xl">
      <p className="mb-1 font-medium text-dark-textSecondary">{label}</p>
      {payload.map((entry: any, i: number) => (
        <p key={i} style={{ color: entry.color }} className="font-semibold">
          {entry.name}: {Number(entry.value).toFixed(3)} mm
        </p>
      ))}
    </div>
  );
}

// ====================================================================
// FissureDetail
// ====================================================================

interface FissureDetailProps {
  fissureId: number;
  onBack: () => void;
}

export default function FissureDetail({ fissureId, onBack }: FissureDetailProps) {
  const {
    selectedFissureDetail,
    loading,
    error,
    fetchFissureDetail,
    deleteFissure,
    archiveFissure,
  } = useFissureStore();

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [archiveLoading, setArchiveLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // Fetch detail on mount / id change
  useEffect(() => {
    if (fissureId) {
      fetchFissureDetail(fissureId);
    }
  }, [fissureId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Chart data from mediciones ──────────────────────────────────
  const chartData = useMemo(() => {
    if (!selectedFissureDetail?.mediciones?.length) return [];
    return selectedFissureDetail.mediciones.map((m: MedicionResponse) => ({
      fecha: new Date(m.fecha).toLocaleDateString('es-ES', {
        day: '2-digit',
        month: '2-digit',
      }),
      largo: m.largo,
      ancho: m.ancho,
      area: m.area,
    }));
  }, [selectedFissureDetail]);

  // ── Handle archive ──────────────────────────────────────────────
  const handleArchive = async () => {
    setArchiveLoading(true);
    setActionError(null);
    try {
      await archiveFissure(fissureId);
    } catch {
      setActionError('Error al archivar la fisura');
    } finally {
      setArchiveLoading(false);
    }
  };

  // ── Handle delete ───────────────────────────────────────────────
  const handleDelete = async () => {
    setDeleteLoading(true);
    setActionError(null);
    try {
      await deleteFissure(fissureId);
      onBack();
    } catch {
      setActionError('Error al eliminar la fisura');
      setDeleteLoading(false);
    }
  };

  // ── If no detail loaded yet (initial loading) ───────────────────
  if (loading && !selectedFissureDetail) {
    return (
      <div className="flex h-64 items-center justify-center rounded-xl border border-dark-border bg-dark-surface">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-dark-accent border-t-transparent" />
          <p className="text-sm text-dark-textSecondary">Cargando detalle…</p>
        </div>
      </div>
    );
  }

  // ── Error ───────────────────────────────────────────────────────
  if (error && !selectedFissureDetail) {
    return (
      <div className="rounded-xl border border-dark-border bg-dark-surface p-6">
        <div className="flex flex-col items-center gap-3">
          <p className="text-sm text-dark-danger">{error}</p>
          <div className="flex gap-2">
            <button
              onClick={() => fetchFissureDetail(fissureId)}
              className="rounded-lg bg-dark-accent px-4 py-2 text-sm font-semibold text-dark-primary transition-opacity hover:opacity-90"
            >
              Reintentar
            </button>
            <button
              onClick={onBack}
              className="rounded-lg bg-dark-hover px-4 py-2 text-sm font-semibold text-dark-textSecondary transition-colors hover:text-dark-text"
            >
              Volver
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── No data ─────────────────────────────────────────────────────
  if (!selectedFissureDetail) {
    return (
      <div className="flex h-48 items-center justify-center rounded-xl border border-dark-border bg-dark-surface">
        <p className="text-sm text-dark-textSecondary">Fisura no encontrada</p>
      </div>
    );
  }

  const { fisura, alertas, totalMediciones } = selectedFissureDetail;

  return (
    <div className="space-y-6">
      {/* ── Back navigation ──────────────────────────────────────── */}
      <button
        onClick={onBack}
        className="flex items-center gap-1.5 text-xs font-semibold text-dark-textSecondary transition-colors hover:text-dark-text"
      >
        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Volver al listado
      </button>

      {/* ── Header ───────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-dark-text">
            Fisura #{fisura.id} — {fisura.roiId}
          </h2>
          <p className="mt-0.5 text-xs text-dark-textSecondary">
            Detectada el{' '}
            {new Date(fisura.fechaDeteccion).toLocaleDateString('es-ES', {
              day: '2-digit',
              month: 'long',
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </p>
        </div>
        <span
          className={`inline-block rounded-full px-3 py-1 text-xs font-semibold ${
            fisura.esCritica
              ? 'bg-dark-danger/15 text-dark-danger'
              : 'bg-dark-accent/15 text-dark-accent'
          }`}
        >
          {fisura.esCritica ? 'Crítico' : 'Estable'}
        </span>
      </div>

      {/* ── Info Grid ────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        {[
          ['Tipo', fisura.tipo ?? '—'],
          ['Orientación', fisura.orientacion ?? '—'],
          ['Largo', `${(fisura.largo ?? 0).toFixed(1)} ${fisura.calibrado === false ? 'px [Est.]' : (fisura.unidad || 'mm')}`],
          ['Ancho', `${(fisura.ancho ?? 0).toFixed(2)} ${fisura.calibrado === false ? 'px [Est.]' : (fisura.unidad || 'mm')}`],
          ['Área', `${(fisura.area ?? 0).toFixed(1)} ${fisura.calibrado === false ? 'px² [Est.]' : (fisura.unidad ? fisura.unidad + '²' : 'mm²')}`],
          ['Mediciones', String(totalMediciones ?? 0)],
        ].map(([label, value]) => (
          <div
            key={label}
            className="rounded-lg border border-dark-border bg-dark-primary p-3"
          >
            <p className="text-[11px] font-medium uppercase tracking-wider text-dark-textSecondary">
              {label}
            </p>
            <p className="mt-1 font-semibold text-dark-text">{value}</p>
          </div>
        ))}
        {fisura.deltaPorcentaje != null && (
          <div className="rounded-lg border border-dark-border bg-dark-primary p-3">
            <p className="text-[11px] font-medium uppercase tracking-wider text-dark-textSecondary">
              Δ%
            </p>
            <p
              className={`mt-1 font-semibold ${
                fisura.deltaPorcentaje > 5 ? 'text-dark-danger' : 'text-dark-accent'
              }`}
            >
              {fisura.deltaPorcentaje.toFixed(1)}%
            </p>
          </div>
        )}
        {fisura.coordenadas && (
          <div className="col-span-full rounded-lg border border-dark-border bg-dark-primary p-3">
            <p className="text-[11px] font-medium uppercase tracking-wider text-dark-textSecondary">
              Coordenadas
            </p>
            <pre className="mt-1 overflow-x-auto font-mono text-xs text-dark-text">
              {fisura.coordenadas}
            </pre>
          </div>
        )}
      </div>

      {/* ── Timeline Chart ───────────────────────────────────────── */}
      {chartData.length > 0 && (
        <div className="rounded-xl border border-dark-border bg-dark-surface p-5">
          <h3 className="mb-4 text-base font-semibold text-dark-text">
            Histórico de Mediciones
          </h3>
          <div className="rounded-lg border border-dark-border bg-dark-primary p-4">
            {loading && (
              <div className="flex items-center justify-center py-4">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-dark-accent border-t-transparent" />
              </div>
            )}
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={chartData} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
                <XAxis
                  dataKey="fecha"
                  stroke={AXIS_STROKE}
                  tick={TICK_FONT}
                  axisLine={{ stroke: GRID_STROKE }}
                />
                <YAxis
                  stroke={AXIS_STROKE}
                  tick={TICK_FONT}
                  axisLine={{ stroke: GRID_STROKE }}
                  unit=" mm"
                />
                <Tooltip content={<ChartTooltip />} />
                <Line
                  name="Largo"
                  type="monotone"
                  dataKey="largo"
                  stroke={fisura.esCritica ? '#ef4444' : '#00d4aa'}
                  strokeWidth={2}
                  dot={{ r: 3, fill: fisura.esCritica ? '#ef4444' : '#00d4aa' }}
                  activeDot={{ r: 5 }}
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

      {/* ── Sin mediciones ────────────────────────────────────────── */}
      {chartData.length === 0 && !loading && (
        <div className="rounded-xl border border-dashed border-dark-border bg-dark-surface p-5">
          <h3 className="mb-2 text-base font-semibold text-dark-text">
            Histórico de Mediciones
          </h3>
          <div className="flex h-24 items-center justify-center rounded-lg bg-dark-primary">
            <p className="text-xs text-dark-textSecondary">
              No hay mediciones registradas para esta fisura
            </p>
          </div>
        </div>
      )}

      {/* ── Alertas ──────────────────────────────────────────────── */}
      {alertas && alertas.length > 0 && (
        <div className="rounded-xl border border-dark-border bg-dark-surface p-5">
          <h3 className="mb-4 text-base font-semibold text-dark-text">
            Alertas Relacionadas ({alertas.length})
          </h3>
          <div className="space-y-2">
            {alertas.map((a) => (
              <div
                key={a.id}
                className={`rounded-lg border p-3 ${
                  a.reconocida
                    ? 'border-dark-border bg-dark-primary'
                    : 'border-dark-danger/30 bg-dark-danger/5'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wider text-dark-textSecondary">
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
                <div className="mt-1 flex items-center gap-3 text-[11px] text-dark-textSecondary">
                  <span>
                    {new Date(a.fecha).toLocaleString('es-ES')}
                  </span>
                  <span>
                    Umbral: {a.umbralSuperado} (Valor: {a.valorActual})
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Attachments ────────────────────────────── */}
      <div className="rounded-xl border border-dark-border bg-dark-surface p-5">
        <h3 className="mb-4 text-base font-semibold text-dark-text">
          Adjuntos
        </h3>
        {fisura.imagenOriginal || fisura.imagenSegmentada ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {fisura.imagenOriginal && (
              <div className="rounded-lg border border-dark-border bg-dark-primary overflow-hidden flex flex-col">
                <div className="p-2 border-b border-dark-border bg-dark-surface">
                  <span className="text-[11px] font-medium uppercase tracking-wider text-dark-textSecondary">
                    Captura Original
                  </span>
                </div>
                <img 
                  src={fisura.imagenOriginal} 
                  alt="Captura original de la fisura" 
                  className="w-full flex-1 object-contain bg-black/20"
                />
              </div>
            )}
            {fisura.imagenSegmentada && (
              <div className="rounded-lg border border-dark-border bg-dark-primary overflow-hidden flex flex-col">
                <div className="p-2 border-b border-dark-border bg-dark-surface">
                  <span className="text-[11px] font-medium uppercase tracking-wider text-dark-textSecondary">
                    Segmentación (Máscara)
                  </span>
                </div>
                <img 
                  src={fisura.imagenSegmentada} 
                  alt="Segmentación de la fisura" 
                  className="w-full flex-1 object-contain bg-black/20"
                />
              </div>
            )}
          </div>
        ) : (
          <div className="flex h-24 items-center justify-center rounded-lg border border-dashed border-dark-border bg-dark-primary">
            <p className="text-xs text-dark-textSecondary">
              No hay fotos disponibles para esta captura
            </p>
          </div>
        )}
      </div>

      {/* ── Action buttons ───────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-end gap-3 border-t border-dark-border pt-5">
        {actionError && (
          <p className="mr-auto text-xs text-dark-danger">{actionError}</p>
        )}

        {!fisura.esCritica && (
          <button
            onClick={handleArchive}
            disabled={archiveLoading}
            className="flex items-center gap-1.5 rounded-lg border border-dark-border bg-dark-primary px-4 py-2 text-sm font-semibold text-dark-textSecondary transition-colors hover:bg-dark-hover hover:text-dark-text disabled:opacity-50"
          >
            {archiveLoading ? (
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-dark-secondary border-t-transparent" />
            ) : (
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
              </svg>
            )}
            Archivar
          </button>
        )}

        <button
          onClick={() => setShowDeleteConfirm(true)}
          className="flex items-center gap-1.5 rounded-lg bg-dark-danger/15 px-4 py-2 text-sm font-semibold text-dark-danger transition-colors hover:bg-dark-danger/25"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
          Eliminar
        </button>
      </div>

      {/* ── Delete confirmation modal ─────────────────────────────── */}
      {showDeleteConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => setShowDeleteConfirm(false)}
        >
          <div
            className="mx-4 w-full max-w-sm rounded-2xl border border-dark-border bg-dark-surface p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-bold text-dark-text">
              ¿Eliminar fisura?
            </h3>
            <p className="mt-2 text-sm text-dark-textSecondary">
              Esta acción eliminará permanentemente la fisura #{fisura.id} (
              {fisura.roiId}) y todas sus mediciones asociadas. No se puede
              deshacer.
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="rounded-lg bg-dark-hover px-4 py-2 text-sm font-semibold text-dark-textSecondary transition-colors hover:text-dark-text"
              >
                Cancelar
              </button>
              <button
                onClick={handleDelete}
                disabled={deleteLoading}
                className="flex items-center gap-1.5 rounded-lg bg-dark-danger px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {deleteLoading ? (
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                ) : null}
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

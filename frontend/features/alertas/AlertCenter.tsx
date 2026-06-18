'use client';

/**
 * ARGOS SLOPE 4.0 — AlertCenter.
 *
 * Enhanced alert management: stats row, advanced filters, paginated list,
 * bulk selection, acknowledge, escalate placeholder, inline detail expand.
 * Uses alert.store for all state management.
 */

import { useEffect, useMemo, useState, useCallback } from 'react';
import { useAlertStore } from '@/stores/alert.store';
import { useFissureStore } from '@/stores/fissure.store';
import type { AlertaResponse } from '@/services/api-client';
import EmptyState from '@/components/EmptyState';
import { BellOff } from 'lucide-react';

// ── Constants ──────────────────────────────────────────────────────────

const TIPO_LABELS: Record<string, string> = {
  critico: 'Crítico',
  advertencia: 'Advertencia',
  informativo: 'Informativo',
};

const TIPO_COLORS: Record<string, string> = {
  critico: 'bg-dark-danger/15 text-dark-danger border-dark-danger/30',
  advertencia: 'bg-dark-warning/15 text-dark-warning border-dark-warning/30',
  informativo: 'bg-dark-accent/15 text-dark-accent border-dark-accent/20',
};

const TIPO_BG: Record<string, string> = {
  critico: 'border-dark-danger/30 bg-dark-danger/5',
  advertencia: 'border-dark-warning/20 bg-dark-warning/[0.03]',
  informativo: 'border-dark-border bg-dark-surface',
};

// ── Helpers ────────────────────────────────────────────────────────────

function formatFecha(fecha: string): string {
  try {
    return new Date(fecha).toLocaleString('es-ES', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return fecha;
  }
}

function formatFechaShort(fecha: string): string {
  try {
    return new Date(fecha).toLocaleDateString('es-ES', {
      day: '2-digit',
      month: 'short',
    });
  } catch {
    return fecha;
  }
}

// ── Sub-components ─────────────────────────────────────────────────────

function Toast({ message, onClose }: { message: string; onClose: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onClose, 3000);
    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <div className="fixed bottom-6 right-6 z-50 animate-fade-in rounded-lg border border-dark-border bg-dark-surface px-5 py-3 shadow-2xl">
      <div className="flex items-center gap-3">
        <span className="text-sm text-dark-text">{message}</span>
        <button
          onClick={onClose}
          className="text-dark-textSecondary hover:text-dark-text"
        >
          ✕
        </button>
      </div>
    </div>
  );
}

// ── AlertCenter ────────────────────────────────────────────────────────

export default function AlertCenter() {
  const {
    alerts,
    filters,
    pagination,
    selection,
    loading,
    error,
    fetchAlerts,
    acknowledgeAlerta,
    acknowledgeMultiple,
    escalateAlerta,
    setFilters,
    setPage,
    toggleSelection,
    selectAll,
    clearSelection,
  } = useAlertStore();

  const { fissures } = useFissureStore();

  const [ackedIds, setAckedIds] = useState<Set<number>>(new Set());
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  // Fetch alerts on mount
  useEffect(() => {
    fetchAlerts();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Filtered + sorted alerts ─────────────────────────────────────
  const filteredAlerts = useMemo(() => {
    let result = [...alerts];

    // Filter by tipo
    if (filters.tipo !== 'todas') {
      result = result.filter((a) => a.tipo === filters.tipo);
    }

    // Filter by estado
    if (filters.estado === 'pendientes') {
      result = result.filter((a) => !a.reconocida);
    } else if (filters.estado === 'reconocidas') {
      result = result.filter((a) => a.reconocida);
    }

    // Text search
    if (filters.busqueda.trim()) {
      const q = filters.busqueda.toLowerCase();
      result = result.filter(
        (a) =>
          a.mensaje.toLowerCase().includes(q) ||
          a.tipo.toLowerCase().includes(q) ||
          String(a.id).includes(q) ||
          (a.fisuraId && String(a.fisuraId).includes(q))
      );
    }

    // Date range
    if (filters.dateRange) {
      const start = new Date(filters.dateRange.start).getTime();
      const end = new Date(filters.dateRange.end + 'T23:59:59').getTime();
      if (!isNaN(start) && !isNaN(end)) {
        result = result.filter((a) => {
          const t = new Date(a.fecha).getTime();
          return t >= start && t <= end;
        });
      }
    }

    // Sort: pendientes first, then by fecha desc
    result.sort((a, b) => {
      if (a.reconocida !== b.reconocida) return a.reconocida ? 1 : -1;
      return new Date(b.fecha).getTime() - new Date(a.fecha).getTime();
    });

    return result;
  }, [alerts, filters]);

  // ── Stats ─────────────────────────────────────────────────────────
  const stats = useMemo(
    () => ({
      total: filteredAlerts.length,
      criticas: filteredAlerts.filter((a) => a.tipo === 'critico').length,
      pendientes: filteredAlerts.filter((a) => !a.reconocida).length,
    }),
    [filteredAlerts]
  );

  // ── Pagination ────────────────────────────────────────────────────
  const totalPages = Math.max(1, Math.ceil(filteredAlerts.length / pagination.pageSize));
  const paginatedAlerts = filteredAlerts.slice(
    (pagination.page - 1) * pagination.pageSize,
    pagination.page * pagination.pageSize
  );

  // Reset page when filters change
  useEffect(() => {
    setPage(1);
  }, [filters.tipo, filters.estado, filters.busqueda, filters.dateRange]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Actions ───────────────────────────────────────────────────────
  const handleAcknowledge = useCallback(
    async (id: number) => {
      setAckedIds((prev) => new Set(prev).add(id));
      await acknowledgeAlerta(id);
      setAckedIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    },
    [acknowledgeAlerta]
  );

  const handleBulkAcknowledge = useCallback(async () => {
    await acknowledgeMultiple();
    setToastMessage(`${selection.size} alerta(s) reconocida(s)`);
  }, [acknowledgeMultiple, selection.size]);

  const handleEscalate = useCallback(
    async (id: number) => {
      setToastMessage('Función de escalamiento próxima');
    },
    []
  );

  const handleSelectAll = useCallback(() => {
    if (selection.size === paginatedAlerts.length && paginatedAlerts.length > 0) {
      clearSelection();
    } else {
      selectAll();
    }
  }, [selection.size, paginatedAlerts.length, clearSelection, selectAll]);

  // ── Empty State ───────────────────────────────────────────────────
  if (!loading && !error && alerts.length === 0) {
    return (
      <div className="space-y-4">
        <StatsRow stats={{ total: 0, criticas: 0, pendientes: 0 }} />
        <EmptyState 
          icon={BellOff}
          title="El sistema se encuentra estable"
          description="No hay alertas registradas en este momento. Sigue monitoreando."
        />
      </div>
    );
  }

  // ── Error State ───────────────────────────────────────────────────
  if (!loading && error) {
    return (
      <div className="space-y-4">
        <StatsRow stats={{ total: alerts.length, criticas: alerts.filter((a) => a.tipo === 'critico').length, pendientes: alerts.filter((a) => !a.reconocida).length }} />
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dark-border bg-dark-surface p-8">
          <p className="text-sm text-dark-danger">{error}</p>
          <button
            onClick={fetchAlerts}
            className="rounded-lg bg-dark-accent px-4 py-2 text-xs font-semibold text-dark-primary"
          >
            Reintentar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* ── Toast ── */}
      {toastMessage && (
        <Toast message={toastMessage} onClose={() => setToastMessage(null)} />
      )}

      {/* ── Stats Row ── */}
      <StatsRow stats={stats} />

      {/* ── Filters ── */}
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-dark-border bg-dark-surface p-4">
        {/* Text search */}
        <div className="relative flex-1 min-w-[180px]">
          <input
            type="text"
            placeholder="Buscar alertas..."
            value={filters.busqueda}
            onChange={(e) => setFilters({ busqueda: e.target.value })}
            className="w-full rounded-lg border border-dark-border bg-dark-primary px-4 py-2 text-sm text-dark-text placeholder-dark-secondary/50 outline-none focus:border-dark-accent"
          />
          {filters.busqueda && (
            <button
              onClick={() => setFilters({ busqueda: '' })}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-dark-textSecondary hover:text-dark-text"
            >
              ✕
            </button>
          )}
        </div>

        {/* Tipo filter */}
        <select
          value={filters.tipo}
          onChange={(e) =>
            setFilters({ tipo: e.target.value as 'todas' | 'critico' | 'advertencia' | 'informativo' })
          }
          className="rounded-lg border border-dark-border bg-dark-primary px-3 py-2 text-sm text-dark-text outline-none focus:border-dark-accent"
        >
          <option value="todas">Todos los tipos</option>
          <option value="critico">Críticas</option>
          <option value="advertencia">Advertencias</option>
          <option value="informativo">Informativas</option>
        </select>

        {/* Estado filter */}
        <select
          value={filters.estado}
          onChange={(e) =>
            setFilters({ estado: e.target.value as 'todas' | 'pendientes' | 'reconocidas' })
          }
          className="rounded-lg border border-dark-border bg-dark-primary px-3 py-2 text-sm text-dark-text outline-none focus:border-dark-accent"
        >
          <option value="todas">Todos los estados</option>
          <option value="pendientes">Pendientes</option>
          <option value="reconocidas">Reconocidas</option>
        </select>

        {/* Date range */}
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={filters.dateRange?.start ?? ''}
            onChange={(e) => {
              const val = e.target.value;
              setFilters({
                dateRange: val
                  ? { start: val, end: filters.dateRange?.end ?? val }
                  : null,
              });
            }}
            className="rounded-lg border border-dark-border bg-dark-primary px-3 py-2 text-sm text-dark-text outline-none focus:border-dark-accent [color-scheme:dark]"
          />
          <span className="text-dark-textSecondary text-xs">a</span>
          <input
            type="date"
            value={filters.dateRange?.end ?? ''}
            onChange={(e) => {
              const val = e.target.value;
              setFilters({
                dateRange: val
                  ? { start: filters.dateRange?.start ?? val, end: val }
                  : null,
              });
            }}
            className="rounded-lg border border-dark-border bg-dark-primary px-3 py-2 text-sm text-dark-text outline-none focus:border-dark-accent [color-scheme:dark]"
          />
          {filters.dateRange && (
            <button
              onClick={() => setFilters({ dateRange: null })}
              className="text-xs text-dark-textSecondary hover:text-dark-text"
            >
              Limpiar
            </button>
          )}
        </div>
      </div>

      {/* ── Bulk actions ── */}
      {selection.size > 0 && (
        <div className="flex items-center gap-3 rounded-lg border border-dark-accent/30 bg-dark-accent/5 px-4 py-2">
          <span className="text-xs text-dark-textSecondary">
            {selection.size} seleccionada(s)
          </span>
          <button
            onClick={handleBulkAcknowledge}
            className="rounded-lg bg-dark-accent/20 px-3 py-1.5 text-xs font-semibold text-dark-accent hover:bg-dark-accent/30"
          >
            Reconocer seleccionadas
          </button>
          <button
            onClick={clearSelection}
            className="rounded-lg border border-dark-border px-3 py-1.5 text-xs text-dark-textSecondary hover:text-dark-text"
          >
            Limpiar selección
          </button>
        </div>
      )}

      {/* ── Alert list ── */}
      {paginatedAlerts.length === 0 ? (
        <div className="flex h-32 items-center justify-center rounded-xl border border-dashed border-dark-border bg-dark-surface">
          <p className="text-sm text-dark-textSecondary">
            No hay alertas que coincidan con los filtros.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {/* Header row with select all */}
          <div className="flex items-center gap-3 rounded-lg border border-dark-border bg-dark-primary/50 px-4 py-2 text-xs font-medium text-dark-textSecondary">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={
                  paginatedAlerts.length > 0 &&
                  paginatedAlerts.every((a) => selection.has(a.id))
                }
                onChange={handleSelectAll}
                className="h-4 w-4 rounded border-dark-border bg-dark-primary text-dark-accent accent-dark-accent"
              />
              <span>Seleccionar todo</span>
            </label>
          </div>

          {paginatedAlerts.map((alerta) => {
            const isSelected = selection.has(alerta.id);
            const isExpanded = expandedId === alerta.id;
            const isAcking = ackedIds.has(alerta.id);
            const rowBg = alerta.reconocida
              ? 'border-dark-border bg-dark-surface/50'
              : TIPO_BG[alerta.tipo] ?? 'border-dark-border bg-dark-surface';
              
            const fisura = fissures.find(f => f.id === alerta.fisuraId);
            const unidadStr = fisura ? (fisura.calibrado === false ? 'px [Est.]' : (fisura.unidad || 'mm')) : '';

            return (
              <div key={alerta.id}>
                {/* Main row */}
                <div
                  className={`rounded-lg border p-4 transition-colors ${rowBg}`}
                >
                  <div className="flex items-start gap-3">
                    {/* Checkbox */}
                    <label className="mt-1 flex shrink-0 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelection(alerta.id)}
                        className="h-4 w-4 rounded border-dark-border bg-dark-primary text-dark-accent accent-dark-accent"
                      />
                    </label>

                    {/* Content */}
                    <div className="min-w-0 flex-1">
                      {/* Badges row */}
                      <div className="mb-1.5 flex flex-wrap items-center gap-2">
                        <span
                          className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                            TIPO_COLORS[alerta.tipo] ?? TIPO_COLORS.informativo
                          }`}
                        >
                          {TIPO_LABELS[alerta.tipo] ?? alerta.tipo}
                        </span>

                        <span
                          className={`text-[10px] font-medium ${
                            alerta.reconocida ? 'text-dark-accent' : 'text-dark-warning'
                          }`}
                        >
                          {alerta.reconocida ? '✓ Reconocida' : '○ Pendiente'}
                        </span>

                        {alerta.fisuraId && (
                          <span className="text-[10px] text-dark-textSecondary">
                            Fisura #{alerta.fisuraId}
                          </span>
                        )}
                      </div>

                      {/* Message */}
                      <p
                        className={`cursor-pointer text-sm text-dark-text ${
                          isExpanded ? '' : 'line-clamp-1'
                        }`}
                        onClick={() => setExpandedId(isExpanded ? null : alerta.id)}
                        title="Haz clic para ver detalle completo"
                      >
                        {alerta.mensaje}
                      </p>

                      {/* Meta row */}
                      <div className="mt-1.5 flex items-center gap-3 text-[11px] text-dark-textSecondary">
                        <span>{formatFecha(alerta.fecha)}</span>
                        <span>
                          Valor: {alerta.valorActual.toFixed(2)} {unidadStr} | Umbral:{' '}
                          {alerta.umbralSuperado.toFixed(2)} {unidadStr}
                        </span>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex shrink-0 items-center gap-2">
                      {!alerta.reconocida && (
                        <button
                          onClick={() => handleAcknowledge(alerta.id)}
                          disabled={isAcking}
                          className="rounded-lg bg-dark-accent/10 px-3 py-1.5 text-xs font-semibold text-dark-accent transition-colors hover:bg-dark-accent/20 disabled:opacity-50"
                        >
                          {isAcking ? (
                            <span className="flex items-center gap-1">
                              <span className="inline-block h-3 w-3 animate-spin rounded-full border border-dark-accent border-t-transparent" />
                              ...
                            </span>
                          ) : (
                            'Reconocer'
                          )}
                        </button>
                      )}

                      <button
                        onClick={() => handleEscalate(alerta.id)}
                        className="rounded-lg border border-dark-border px-3 py-1.5 text-xs text-dark-textSecondary transition-colors hover:bg-dark-hover"
                        title="Escalar alerta"
                      >
                        Escalar
                      </button>

                      {/* Expand toggle */}
                      <button
                        onClick={() => setExpandedId(isExpanded ? null : alerta.id)}
                        className="text-dark-textSecondary hover:text-dark-text"
                      >
                        <svg
                          className={`h-4 w-4 transition-transform ${
                            isExpanded ? 'rotate-180' : ''
                          }`}
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M19 9l-7 7-7-7"
                          />
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>

                {/* ── Expanded detail ── */}
                {isExpanded && (
                  <div className="-mt-2 rounded-b-lg border border-t-0 border-dark-border bg-dark-primary/30 px-4 pb-4 pt-4">
                    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                      <DetailField label="ID Alerta" value={`#${alerta.id}`} />
                      <DetailField
                        label="Fisura ID"
                        value={alerta.fisuraId ? `#${alerta.fisuraId}` : 'No asociada'}
                      />
                      <DetailField label="Fecha" value={formatFecha(alerta.fecha)} />
                      <DetailField label="Tipo" value={TIPO_LABELS[alerta.tipo] ?? alerta.tipo} />
                      <DetailField
                        label="Valor Actual"
                        value={`${alerta.valorActual.toFixed(4)} ${unidadStr}`}
                      />
                      <DetailField
                        label="Umbral Superado"
                        value={`${alerta.umbralSuperado.toFixed(4)} ${unidadStr}`}
                      />
                      <DetailField
                        label="Estado"
                        value={alerta.reconocida ? 'Reconocida' : 'Pendiente'}
                      />
                      <DetailField label="ID" value={`#${alerta.id}`} />
                    </div>

                    <div className="mt-3 rounded-lg border border-dashed border-dark-border bg-dark-primary/20 p-3 text-xs text-dark-textSecondary">
                      <p className="font-medium text-dark-textSecondary mb-1">Historial</p>
                      <p>
                        Alerta generada el {formatFecha(alerta.fecha)}.{' '}
                        {alerta.reconocida
                          ? 'Reconocida y procesada.'
                          : 'Pendiente de revisión.'}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Pagination ── */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button
            onClick={() => setPage(Math.max(1, pagination.page - 1))}
            disabled={pagination.page === 1}
            className="rounded-lg border border-dark-border bg-dark-surface px-3 py-1.5 text-xs text-dark-textSecondary disabled:opacity-30"
          >
            Anterior
          </button>

          {Array.from({ length: totalPages }, (_, i) => i + 1)
            .filter(
              (p) =>
                p === 1 ||
                p === totalPages ||
                Math.abs(p - pagination.page) <= 2
            )
            .map((p, idx, arr) => (
              <span key={p} className="flex items-center gap-1">
                {idx > 0 && arr[idx - 1] !== p - 1 && (
                  <span className="text-dark-textSecondary/50">...</span>
                )}
                <button
                  onClick={() => setPage(p)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
                    p === pagination.page
                      ? 'bg-dark-accent text-dark-primary'
                      : 'border border-dark-border bg-dark-surface text-dark-textSecondary hover:bg-dark-hover'
                  }`}
                >
                  {p}
                </button>
              </span>
            ))}

          <button
            onClick={() => setPage(Math.min(totalPages, pagination.page + 1))}
            disabled={pagination.page === totalPages}
            className="rounded-lg border border-dark-border bg-dark-surface px-3 py-1.5 text-xs text-dark-textSecondary disabled:opacity-30"
          >
            Siguiente
          </button>
        </div>
      )}

      {/* ── Loading overlay ── */}
      {loading && (
        <div className="flex h-40 items-center justify-center rounded-xl border border-dark-border bg-dark-surface/80">
          <div className="flex flex-col items-center gap-3">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-dark-accent border-t-transparent" />
            <p className="text-sm text-dark-textSecondary">Cargando alertas…</p>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Stats Row Sub-component ────────────────────────────────────────────

function StatsRow({
  stats,
}: {
  stats: { total: number; criticas: number; pendientes: number };
}) {
  return (
    <div className="grid grid-cols-3 gap-3">
      <div className="rounded-lg border border-dark-border bg-dark-surface p-4">
        <p className="text-xs text-dark-textSecondary">Total Alertas</p>
        <p className="text-2xl font-bold text-dark-text">{stats.total}</p>
      </div>
      <div className="rounded-lg border border-dark-border bg-dark-surface p-4">
        <p className="text-xs text-dark-textSecondary">Críticas</p>
        <p className="text-2xl font-bold text-dark-danger">{stats.criticas}</p>
      </div>
      <div className="rounded-lg border border-dark-border bg-dark-surface p-4">
        <p className="text-xs text-dark-textSecondary">Pendientes</p>
        <p className="text-2xl font-bold text-dark-warning">{stats.pendientes}</p>
      </div>
    </div>
  );
}

// ── Detail Field Sub-component ─────────────────────────────────────────

function DetailField({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div>
      <p className="text-[10px] font-medium uppercase tracking-wider text-dark-textSecondary">
        {label}
      </p>
      <p className="mt-0.5 text-sm font-medium text-dark-text">{value}</p>
    </div>
  );
}

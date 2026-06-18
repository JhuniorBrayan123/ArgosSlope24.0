'use client';

/**
 * ARGOS SLOPE 4.0 — FissureList.
 *
 * Table component listing all fissures from fissure.store.
 * Supports sort, search/filter, pagination, and row selection.
 */

import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { useFissureStore } from '@/stores/fissure.store';
import type { FisuraResponse } from '@/services/api-client';
import SeverityBadge from '@/components/SeverityBadge';

// ── Column definition ────────────────────────────────────────────────
interface Column {
  key: string;
  label: string;
  sortable: boolean;
  width?: string;
  render: (f: FisuraResponse) => React.ReactNode;
}

// ── Sort direction ──────────────────────────────────────────────────
type SortDir = 'asc' | 'desc';

// ====================================================================
// FissureList
// ====================================================================

interface FissureListProps {
  onSelectFissure?: (id: number) => void;
}

export default function FissureList({ onSelectFissure }: FissureListProps) {
  const {
    fissures,
    filters,
    pagination,
    loading,
    error,
    fetchFissures,
    setFilters,
    setPage,
    selectFissure,
  } = useFissureStore();

  // ── Local sort state ────────────────────────────────────────────
  const [sortKey, setSortKey] = useState<string>('id');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [searchInput, setSearchInput] = useState(filters.search);
  const [tipoFilter, setTipoFilter] = useState(filters.tipo);
  const [estadoFilter, setEstadoFilter] = useState(filters.estado);
  const [showFilters, setShowFilters] = useState(false);

  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Fetch on mount ──────────────────────────────────────────────
  useEffect(() => {
    fetchFissures();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Debounced search ────────────────────────────────────────────
  const handleSearchChange = useCallback(
    (value: string) => {
      setSearchInput(value);
      if (searchTimer.current) clearTimeout(searchTimer.current);
      searchTimer.current = setTimeout(() => {
        setFilters({ search: value });
      }, 400);
    },
    [setFilters]
  );

  // ── Apply tipo / estado filters ─────────────────────────────────
  const applyFilter = useCallback(
    (key: 'tipo' | 'estado', value: string) => {
      if (key === 'tipo') setTipoFilter(value);
      if (key === 'estado') setEstadoFilter(value);
      setFilters({ [key]: value });
    },
    [setFilters]
  );

  // ── Sort click handler ──────────────────────────────────────────
  const handleSort = useCallback(
    (key: string) => {
      if (sortKey === key) {
        setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'));
      } else {
        setSortKey(key);
        setSortDir('asc');
      }
    },
    [sortKey]
  );

  // ── Sorted + paginated data ─────────────────────────────────────
  // ── Sorted data (current page) ───────────────────────────────────
  const sortedFissures = useMemo(() => {
    const list = [...fissures];
    list.sort((a, b) => {
      const aVal = (a as any)[sortKey];
      const bVal = (b as any)[sortKey];
      if (aVal == null) return 1;
      if (bVal == null) return -1;
      if (typeof aVal === 'string') {
        const cmp = aVal.localeCompare(bVal);
        return sortDir === 'asc' ? cmp : -cmp;
      }
      return sortDir === 'asc' ? aVal - bVal : bVal - aVal;
    });
    return list;
  }, [fissures, sortKey, sortDir]);

  const totalPages = Math.max(
    1,
    Math.ceil(pagination.total / pagination.pageSize)
  );

  // ── Unique tipos for filter dropdown ────────────────────────────
  const uniqueTipos = useMemo(() => {
    const tipos = new Set(fissures.map((f) => f.tipo).filter(Boolean));
    return Array.from(tipos).sort();
  }, [fissures]);

  // ── Columns ─────────────────────────────────────────────────────
  const columns: Column[] = useMemo(
    () => [
      {
        key: 'id',
        label: 'ID',
        sortable: true,
        width: 'w-16',
        render: (f) => (
          <span className="font-mono text-xs text-dark-text">#{f.id}</span>
        ),
      },
      {
        key: 'roiId',
        label: 'ROI',
        sortable: true,
        width: 'w-24',
        render: (f) => (
          <span className="font-medium text-dark-text">{f.roiId}</span>
        ),
      },
      {
        key: 'imagenOriginal',
        label: 'Captura',
        sortable: false,
        width: 'w-20',
        render: (f: any) => (
          f.imagenOriginal ? (
            <img 
              src={f.imagenOriginal} 
              alt="Miniatura" 
              className="h-8 w-12 object-cover rounded border border-dark-border bg-black/20" 
            />
          ) : (
            <span className="text-xs text-dark-textSecondary">—</span>
          )
        ),
      },
      {
        key: 'fechaDeteccion',
        label: 'Fecha',
        sortable: true,
        width: 'w-36',
        render: (f) => {
          const d = f.fechaDeteccion ? new Date(f.fechaDeteccion) : null;
          const isValid = d && !isNaN(d.getTime());
          return (
            <span className="text-dark-textSecondary">
              {isValid
                ? d.toLocaleDateString('es-ES', {
                    day: '2-digit',
                    month: 'short',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })
                : f.fechaDeteccion || '—'}
            </span>
          );
        },
      },
      {
        key: 'largo',
        label: 'Largo',
        sortable: true,
        width: 'w-32',
        render: (f) => (
          <span className="font-mono text-dark-text">
            {(f.largo ?? 0).toFixed(1)}{' '}
            <span className="text-[10px] text-dark-textSecondary">
              {f.calibrado === false ? 'px [Est.]' : f.unidad || 'mm'}
            </span>
          </span>
        ),
      },
      {
        key: 'ancho',
        label: 'Ancho',
        sortable: true,
        width: 'w-32',
        render: (f) => (
          <span className="font-mono text-dark-text">
            {(f.ancho ?? 0).toFixed(2)}{' '}
            <span className="text-[10px] text-dark-textSecondary">
              {f.calibrado === false ? 'px [Est.]' : f.unidad || 'mm'}
            </span>
          </span>
        ),
      },
      {
        key: 'deltaPorcentaje',
        label: 'Δ%',
        sortable: true,
        width: 'w-20',
        render: (f) => {
          const delta = f.deltaPorcentaje ?? 0;
          return (
            <span
              className={`font-mono font-semibold ${
                f.esCritica ? 'text-dark-danger' : 'text-dark-accent'
              }`}
            >
              {delta.toFixed(1)}%
            </span>
          );
        },
      },
      {
        key: 'esCritica',
        label: 'Estado',
        sortable: true,
        width: 'w-28',
        render: (f) => (
          <SeverityBadge critical={!!f.esCritica} value={f.deltaPorcentaje} />
        ),
      },
      {
        key: 'accion',
        label: 'Acción',
        sortable: false,
        width: 'w-28',
        render: (f) => (
          <button
            onClick={(e) => {
              e.stopPropagation();
              selectFissure(f.id);
              onSelectFissure?.(f.id);
            }}
            className="rounded-md bg-dark-accent/10 px-3 py-1.5 text-xs font-semibold text-dark-accent transition-colors hover:bg-dark-accent/20"
          >
            Ver detalle
          </button>
        ),
      },
    ],
    [selectFissure, onSelectFissure]
  );

  // ── Sort indicator ──────────────────────────────────────────────
  const SortIcon = ({ columnKey }: { columnKey: string }) => {
    if (sortKey !== columnKey) return null;
    return (
      <span className="ml-1 inline-block text-[10px]">
        {sortDir === 'asc' ? '▲' : '▼'}
      </span>
    );
  };

  // ── Page navigation ─────────────────────────────────────────────
  const renderPagination = () => {
    if (pagination.total <= pagination.pageSize) return null;

    const pages: number[] = [];
    const maxVisible = 5;
    let start = Math.max(1, pagination.page - Math.floor(maxVisible / 2));
    let end = Math.min(totalPages, start + maxVisible - 1);
    if (end - start < maxVisible - 1) {
      start = Math.max(1, end - maxVisible + 1);
    }
    for (let i = start; i <= end; i++) pages.push(i);

    return (
      <div className="flex items-center justify-between border-t border-dark-border px-4 py-3">
        <p className="text-xs text-dark-textSecondary">
          Mostrando {(pagination.page - 1) * pagination.pageSize + 1}–
          {Math.min(pagination.page * pagination.pageSize, pagination.total)} de{' '}
          {pagination.total}
        </p>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setPage(1)}
            disabled={pagination.page <= 1}
            className="rounded-md px-2 py-1 text-xs text-dark-textSecondary transition-colors hover:bg-dark-hover hover:text-dark-text disabled:opacity-30"
          >
            ««
          </button>
          <button
            onClick={() => setPage(pagination.page - 1)}
            disabled={pagination.page <= 1}
            className="rounded-md px-2 py-1 text-xs text-dark-textSecondary transition-colors hover:bg-dark-hover hover:text-dark-text disabled:opacity-30"
          >
            «
          </button>
          {pages.map((p) => (
            <button
              key={p}
              onClick={() => setPage(p)}
              className={`rounded-md px-3 py-1 text-xs font-semibold transition-colors ${
                p === pagination.page
                  ? 'bg-dark-accent text-dark-primary'
                  : 'text-dark-textSecondary hover:bg-dark-hover hover:text-dark-text'
              }`}
            >
              {p}
            </button>
          ))}
          <button
            onClick={() => setPage(pagination.page + 1)}
            disabled={pagination.page >= totalPages}
            className="rounded-md px-2 py-1 text-xs text-dark-textSecondary transition-colors hover:bg-dark-hover hover:text-dark-text disabled:opacity-30"
          >
            »
          </button>
          <button
            onClick={() => setPage(totalPages)}
            disabled={pagination.page >= totalPages}
            className="rounded-md px-2 py-1 text-xs text-dark-textSecondary transition-colors hover:bg-dark-hover hover:text-dark-text disabled:opacity-30"
          >
            »»
          </button>
        </div>
      </div>
    );
  };

  // ═══════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════

  // ── Loading ─────────────────────────────────────────────────────
  if (loading && fissures.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center rounded-xl border border-dark-border bg-dark-surface">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-dark-accent border-t-transparent" />
          <p className="text-sm text-dark-textSecondary">Cargando fisuras…</p>
        </div>
      </div>
    );
  }

  // ── Error ───────────────────────────────────────────────────────
  if (error && fissures.length === 0) {
    return (
      <div className="rounded-xl border border-dark-border bg-dark-surface p-6">
        <div className="flex flex-col items-center gap-3">
          <p className="text-sm text-dark-danger">{error}</p>
          <button
            onClick={fetchFissures}
            className="rounded-lg bg-dark-accent px-4 py-2 text-sm font-semibold text-dark-primary transition-opacity hover:opacity-90"
          >
            Reintentar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-dark-border bg-dark-surface">
      {/* ── Toolbar ─────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-dark-border px-4 py-3">
        {/* Search */}
        <div className="relative flex-1 max-w-xs">
          <svg
            className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-dark-textSecondary"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
          <input
            type="text"
            value={searchInput}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder="Buscar por ROI ID…"
            className="w-full rounded-lg border border-dark-border bg-dark-primary py-2 pl-10 pr-3 text-sm text-dark-text placeholder:text-dark-textSecondary focus:border-dark-accent focus:outline-none"
          />
        </div>

        {/* Filter toggle */}
        <button
          onClick={() => setShowFilters(!showFilters)}
          className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition-all ${
            showFilters || tipoFilter || estadoFilter
              ? 'bg-dark-accent/20 text-dark-accent'
              : 'bg-dark-hover text-dark-textSecondary hover:bg-dark-border hover:text-dark-text'
          }`}
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"
            />
          </svg>
          Filtros
        </button>

        {/* Count */}
        <span className="text-xs text-dark-textSecondary">
          {pagination.total} fisuras
        </span>
      </div>

      {/* ── Filter row ──────────────────────────────────────────── */}
      {showFilters && (
        <div className="flex flex-wrap items-center gap-3 border-b border-dark-border bg-dark-primary px-4 py-3">
          <div>
            <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-dark-textSecondary">
              Tipo
            </label>
            <select
              value={tipoFilter}
              onChange={(e) => applyFilter('tipo', e.target.value)}
              className="rounded-lg border border-dark-border bg-dark-surface px-3 py-1.5 text-xs text-dark-text focus:border-dark-accent focus:outline-none"
            >
              <option value="">Todos</option>
              {uniqueTipos.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-dark-textSecondary">
              Estado
            </label>
            <select
              value={estadoFilter}
              onChange={(e) => applyFilter('estado', e.target.value)}
              className="rounded-lg border border-dark-border bg-dark-surface px-3 py-1.5 text-xs text-dark-text focus:border-dark-accent focus:outline-none"
            >
              <option value="">Todos</option>
              <option value="critica">Crítico</option>
              <option value="estable">Estable</option>
            </select>
          </div>
          {(tipoFilter || estadoFilter || filters.search) && (
            <button
              onClick={() => {
                setSearchInput('');
                setTipoFilter('');
                setEstadoFilter('');
                setFilters({ search: '', tipo: '', estado: '' });
              }}
              className="self-end rounded-lg bg-dark-hover px-3 py-1.5 text-xs text-dark-textSecondary transition-colors hover:text-dark-text"
            >
              Limpiar filtros
            </button>
          )}
        </div>
      )}

      {/* ── Empty ────────────────────────────────────────────────── */}
      {!loading && fissures.length === 0 && (
        <div className="flex h-48 items-center justify-center">
          <div className="text-center">
            <svg
              className="mx-auto mb-2 h-8 w-8 text-dark-textSecondary"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
              />
            </svg>
            <p className="text-sm text-dark-textSecondary">
              No se encontraron fisuras
            </p>
            {(filters.search || filters.tipo || filters.estado) && (
              <p className="mt-1 text-xs text-dark-textSecondary">
                Intente ajustar los filtros de búsqueda
              </p>
            )}
          </div>
        </div>
      )}

      {/* ── Table ───────────────────────────────────────────────── */}
      {fissures.length > 0 && (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-dark-border bg-dark-primary text-xs font-semibold uppercase tracking-wider text-dark-textSecondary">
                  {columns.map((col) => (
                    <th
                      key={col.key}
                      className={`${col.width || ''} ${
                        col.sortable ? 'cursor-pointer select-none hover:text-dark-text' : ''
                      } px-4 py-3`}
                      onClick={() => col.sortable && handleSort(col.key)}
                    >
                      {col.label}
                      <SortIcon columnKey={col.key} />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-dark-border">
                {sortedFissures.map((f) => (
                  <tr
                    key={f.id}
                    onClick={() => {
                      selectFissure(f.id);
                      onSelectFissure?.(f.id);
                    }}
                    className={`cursor-pointer transition-colors hover:bg-dark-hover ${
                      f.esCritica ? 'bg-dark-danger/5' : ''
                    }`}
                  >
                    {columns.map((col) => (
                      <td key={col.key} className={`${col.width || ''} px-4 py-3`}>
                        {col.render(f)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {renderPagination()}
        </>
      )}

      {/* Loading overlay for subsequent fetches */}
      {loading && fissures.length > 0 && (
        <div className="flex items-center justify-center border-t border-dark-border py-3">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-dark-accent border-t-transparent" />
        </div>
      )}
    </div>
  );
}

/**
 * ARGOS SLOPE 4.0 — FisurasView.
 *
 * Filterable technical table component that reads cracks from the
 * Zustand results store. Supports family / status / risk / length
 * filtering, paginated table view, and a detail modal for individual
 * crack inspection.
 */

'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { useResultsStore } from '@/stores/results.store';
import {
  Search,
  Filter,
  X,
  ChevronLeft,
  ChevronRight,
  Eye,
  Layers,
} from 'lucide-react';
import type { CrackDetail } from '@/types/results';

// ── Constants ─────────────────────────────────────────────────────────

const PAGE_SIZE = 10;

// ── Helpers ───────────────────────────────────────────────────────────

function statusColor(status: string): string {
  switch (status) {
    case 'estable':
      return 'text-emerald-400';
    case 'observacion':
      return 'text-amber-400';
    case 'critico':
      return 'text-dark-danger';
    default:
      return 'text-dark-muted';
  }
}

function statusBadgeBg(status: string): string {
  switch (status) {
    case 'estable':
      return 'bg-emerald-500/20 border-emerald-500/30';
    case 'observacion':
      return 'bg-amber-500/20 border-amber-500/30';
    case 'critico':
      return 'bg-red-500/20 border-red-500/30';
    default:
      return 'bg-dark-border/30 border-dark-border';
  }
}

function riskBadgeStyle(risk: string): string {
  switch (risk) {
    case 'bajo':
      return 'bg-emerald-500/20 text-emerald-400';
    case 'medio':
      return 'bg-amber-500/20 text-amber-400';
    case 'alto':
      return 'bg-orange-500/20 text-orange-400';
    case 'critico':
      return 'bg-red-500/20 text-dark-danger';
    default:
      return 'bg-dark-border/30 text-dark-muted';
  }
}

// ── Detail Item Row ───────────────────────────────────────────────────

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-dark-border bg-dark-primary p-3">
      <p className="text-[11px] font-medium uppercase tracking-wider text-dark-muted">
        {label}
      </p>
      <p className="mt-1 font-semibold text-dark-text">{value}</p>
    </div>
  );
}

// ── Props ─────────────────────────────────────────────────────────────

interface FisurasViewProps {
  /** Callback when "Ver en imagen" is clicked. Navigates to Fotos tab. */
  onViewOnImage?: (crackId: string) => void;
}

// ── CrackDetailModal ──────────────────────────────────────────────────

function CrackDetailModal({ onViewOnImage }: { onViewOnImage?: (crackId: string) => void }) {
  const selectedCrack = useResultsStore((s) => s.selectedCrack);
  const detailModalOpen = useResultsStore((s) => s.detailModalOpen);
  const setDetailModalOpen = useResultsStore((s) => s.setDetailModalOpen);

  if (!detailModalOpen || !selectedCrack) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={() => setDetailModalOpen(false)}
    >
      <div
        className="mx-4 max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-dark-border bg-dark-surface p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Header ── */}
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-xl font-bold text-dark-text">
            Fisura {selectedCrack.id}
          </h2>
          <button
            onClick={() => setDetailModalOpen(false)}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-dark-muted transition-colors hover:bg-dark-hover hover:text-dark-text"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* ── Detail Grid ── */}
        <div className="grid grid-cols-2 gap-4">
          <DetailItem label="ID" value={selectedCrack.id} />
          <DetailItem label="Familia" value={selectedCrack.family} />
          <DetailItem
            label="Longitud"
            value={`${selectedCrack.lengthCm.toFixed(1)} cm`}
          />
          {selectedCrack.widthMm != null && (
            <DetailItem
              label="Apertura"
              value={`${selectedCrack.widthMm.toFixed(2)} mm`}
            />
          )}
          {selectedCrack.angleDeg != null && (
            <DetailItem
              label="Ángulo"
              value={`${selectedCrack.angleDeg.toFixed(1)}°`}
            />
          )}
          {selectedCrack.positionX != null && selectedCrack.positionY != null && (
            <DetailItem
              label="Posición"
              value={`(${selectedCrack.positionX.toFixed(1)}, ${selectedCrack.positionY.toFixed(1)})`}
            />
          )}

          {/* Estado */}
          <div className="rounded-lg border border-dark-border bg-dark-primary p-3">
            <p className="text-[11px] font-medium uppercase tracking-wider text-dark-muted">
              Estado
            </p>
            <span
              className={`mt-1 inline-block px-2 py-0.5 rounded text-xs font-bold border ${statusBadgeBg(selectedCrack.status)} ${statusColor(selectedCrack.status)}`}
            >
              {selectedCrack.status}
            </span>
          </div>

          {/* Riesgo */}
          <div className="rounded-lg border border-dark-border bg-dark-primary p-3">
            <p className="text-[11px] font-medium uppercase tracking-wider text-dark-muted">
              Riesgo
            </p>
            <span
              className={`mt-1 inline-block px-2 py-0.5 rounded text-xs font-bold ${riskBadgeStyle(selectedCrack.riskLevel)}`}
            >
              {selectedCrack.riskLevel}
            </span>
          </div>

          {/* Patrón detectado */}
          {selectedCrack.patternMatched && (
            <div className="col-span-2 rounded-lg border border-dark-border bg-dark-primary p-3">
              <p className="text-[11px] font-medium uppercase tracking-wider text-dark-muted">
                Patrón detectado
              </p>
              <p className="mt-1 text-sm text-dark-text">
                {selectedCrack.patternMatched}
              </p>
            </div>
          )}

          {/* Recomendación */}
          {selectedCrack.recommendation && (
            <div className="col-span-2 rounded-lg border border-dark-accent/30 bg-dark-primary p-3">
              <p className="text-[11px] font-medium uppercase tracking-wider text-dark-muted">
                Recomendación
              </p>
              <p className="mt-1 text-sm text-dark-text">
                {selectedCrack.recommendation}
              </p>
            </div>
          )}
        </div>

        {/* ── Actions ── */}
        <div className="flex justify-end gap-3 pt-6">
          {onViewOnImage ? (
            <button
              onClick={() => {
                onViewOnImage(selectedCrack.id);
                setDetailModalOpen(false);
              }}
              className="rounded-lg bg-dark-accent px-4 py-2 text-sm font-semibold text-dark-primary transition-opacity hover:opacity-90"
            >
              Ver en imagen
            </button>
          ) : (
            <span
              className="group relative inline-block"
              title="Navegación a imagen no disponible en este contexto"
            >
              <button
                disabled
                className="rounded-lg bg-dark-hover px-4 py-2 text-sm font-semibold text-dark-muted cursor-not-allowed opacity-50"
              >
                Ver en imagen
              </button>
              <span className="pointer-events-none absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-dark-surface px-2 py-1 text-[10px] text-dark-muted opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
                No disponible
              </span>
            </span>
          )}
          <button
            onClick={() => setDetailModalOpen(false)}
            className="rounded-lg bg-dark-hover px-4 py-2 text-sm font-semibold text-dark-text transition-opacity hover:opacity-90"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Pagination ────────────────────────────────────────────────────────

function Pagination({
  currentPage,
  totalPages,
  onPageChange,
}: {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}) {
  if (totalPages <= 1) return null;

  const pages: (number | 'ellipsis')[] = [];
  for (let i = 1; i <= totalPages; i++) {
    if (i === 1 || i === totalPages || Math.abs(i - currentPage) <= 1) {
      pages.push(i);
    } else if (pages[pages.length - 1] !== 'ellipsis') {
      pages.push('ellipsis');
    }
  }

  return (
    <div className="flex items-center gap-1">
      <button
        onClick={() => onPageChange(currentPage - 1)}
        disabled={currentPage <= 1}
        className="rounded-md px-2 py-1 text-xs text-dark-muted transition-colors hover:bg-dark-hover hover:text-dark-text disabled:opacity-30"
      >
        <ChevronLeft className="h-4 w-4" />
      </button>

      {pages.map((p, i) =>
        p === 'ellipsis' ? (
          <span key={`e-${i}`} className="px-1 text-xs text-dark-muted">
            ...
          </span>
        ) : (
          <button
            key={p}
            onClick={() => onPageChange(p)}
            className={`rounded-md px-3 py-1 text-xs font-semibold transition-colors ${
              p === currentPage
                ? 'bg-dark-accent text-dark-primary'
                : 'text-dark-muted hover:bg-dark-hover hover:text-dark-text'
            }`}
          >
            {p}
          </button>
        ),
      )}

      <button
        onClick={() => onPageChange(currentPage + 1)}
        disabled={currentPage >= totalPages}
        className="rounded-md px-2 py-1 text-xs text-dark-muted transition-colors hover:bg-dark-hover hover:text-dark-text disabled:opacity-30"
      >
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
//  FisurasView
// ═══════════════════════════════════════════════════════════════════════

export function FisurasView({ onViewOnImage }: FisurasViewProps = {}) {
  const cracks = useResultsStore((s) => s.cracks);
  const currentResult = useResultsStore((s) => s.currentResult);
  const setSelectedCrack = useResultsStore((s) => s.setSelectedCrack);
  const setDetailModalOpen = useResultsStore((s) => s.setDetailModalOpen);

  // ── Filter State ────────────────────────────────────────────────────
  const [familyFilter, setFamilyFilter] = useState('todas');
  const [statusFilter, setStatusFilter] = useState('todos');
  const [riskFilter, setRiskFilter] = useState('todos');
  const [minLength, setMinLength] = useState('');
  const [maxLength, setMaxLength] = useState('');
  const [page, setPage] = useState(1);

  // ── Derived families from actual crack data ─────────────────────────
  const families = useMemo(() => {
    const set = new Set(cracks.map((c) => c.family));
    return Array.from(set).sort();
  }, [cracks]);

  // ── Filtered cracks ─────────────────────────────────────────────────
  const filteredCracks = useMemo(() => {
    return cracks.filter((c) => {
      if (familyFilter !== 'todas' && c.family !== familyFilter) return false;
      if (statusFilter !== 'todos' && c.status !== statusFilter) return false;
      if (riskFilter !== 'todos' && c.riskLevel !== riskFilter) return false;
      if (minLength !== '' && c.lengthCm < parseFloat(minLength)) return false;
      if (maxLength !== '' && c.lengthCm > parseFloat(maxLength)) return false;
      return true;
    });
  }, [cracks, familyFilter, statusFilter, riskFilter, minLength, maxLength]);

  // ── Pagination ──────────────────────────────────────────────────────
  const totalPages = Math.max(1, Math.ceil(filteredCracks.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);

  const paginatedCracks = useMemo(() => {
    const start = (safePage - 1) * PAGE_SIZE;
    return filteredCracks.slice(start, start + PAGE_SIZE);
  }, [filteredCracks, safePage]);

  // Reset to page 1 when filters change
  useEffect(() => {
    setPage(1);
  }, [familyFilter, statusFilter, riskFilter, minLength, maxLength]);

  // ── Handlers ────────────────────────────────────────────────────────
  const handleViewDetail = (crack: CrackDetail) => {
    setSelectedCrack(crack);
    setDetailModalOpen(true);
  };

  // ── Empty State (no cracks available at all) ──────────────────────
  if (!currentResult || cracks.length === 0) {
    return (
      <div className="shrink-0 rounded-xl border border-dark-border bg-dark-elevated p-8 mt-4 flex items-center justify-center">
        <div className="flex flex-col items-center gap-2">
          <Layers className="h-8 w-8 text-dark-muted" />
          <p className="text-sm text-dark-muted">
            No hay fisuras individuales disponibles para este resultado
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="shrink-0 mt-4">
      <div className="rounded-xl border border-dark-border bg-dark-surface overflow-hidden">
        {/* ═══════ Filters Bar ═══════ */}
        <div className="flex flex-wrap items-center gap-3 border-b border-dark-border px-4 py-3">
          <Filter className="h-4 w-4 text-dark-muted shrink-0" />

          {/* Family */}
          <select
            value={familyFilter}
            onChange={(e) => setFamilyFilter(e.target.value)}
            className="rounded-lg border border-dark-border bg-dark-primary px-3 py-1.5 text-xs text-dark-text focus:border-dark-accent focus:outline-none"
          >
            <option value="todas">Familia: Todas</option>
            {families.map((f) => (
              <option key={f} value={f}>
                Familia: {f}
              </option>
            ))}
          </select>

          {/* Status */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-lg border border-dark-border bg-dark-primary px-3 py-1.5 text-xs text-dark-text focus:border-dark-accent focus:outline-none"
          >
            <option value="todos">Estado: Todos</option>
            <option value="estable">Estado: Estable</option>
            <option value="observacion">Estado: Observación</option>
            <option value="critico">Estado: Crítico</option>
          </select>

          {/* Risk */}
          <select
            value={riskFilter}
            onChange={(e) => setRiskFilter(e.target.value)}
            className="rounded-lg border border-dark-border bg-dark-primary px-3 py-1.5 text-xs text-dark-text focus:border-dark-accent focus:outline-none"
          >
            <option value="todos">Riesgo: Todos</option>
            <option value="bajo">Riesgo: Bajo</option>
            <option value="medio">Riesgo: Medio</option>
            <option value="alto">Riesgo: Alto</option>
            <option value="critico">Riesgo: Crítico</option>
          </select>

          {/* Length range */}
          <div className="flex items-center gap-1">
            <input
              type="number"
              value={minLength}
              onChange={(e) => setMinLength(e.target.value)}
              placeholder="Long. min"
              className="w-22 rounded-lg border border-dark-border bg-dark-primary px-2.5 py-1.5 text-xs text-dark-text placeholder:text-dark-muted focus:border-dark-accent focus:outline-none"
            />
            <span className="text-dark-muted text-xs">—</span>
            <input
              type="number"
              value={maxLength}
              onChange={(e) => setMaxLength(e.target.value)}
              placeholder="Long. max"
              className="w-22 rounded-lg border border-dark-border bg-dark-primary px-2.5 py-1.5 text-xs text-dark-text placeholder:text-dark-muted focus:border-dark-accent focus:outline-none"
            />
            <span className="text-xs text-dark-muted">cm</span>
          </div>

          {/* Clear filters */}
          {(familyFilter !== 'todas' ||
            statusFilter !== 'todos' ||
            riskFilter !== 'todos' ||
            minLength !== '' ||
            maxLength !== '') && (
            <button
              onClick={() => {
                setFamilyFilter('todas');
                setStatusFilter('todos');
                setRiskFilter('todos');
                setMinLength('');
                setMaxLength('');
              }}
              className="rounded-lg bg-dark-hover px-2.5 py-1.5 text-xs text-dark-muted transition-colors hover:text-dark-text"
            >
              <X className="h-3.5 w-3.5 inline mr-1" />
              Limpiar
            </button>
          )}

          <span className="ml-auto text-xs text-dark-muted whitespace-nowrap">
            {filteredCracks.length} de {cracks.length}
          </span>
        </div>

        {/* ═══════ Table / Empty ═══════ */}
        {filteredCracks.length > 0 ? (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-dark-border bg-dark-primary text-xs font-semibold uppercase tracking-wider text-dark-muted">
                    <th className="px-4 py-3">ID</th>
                    <th className="px-4 py-3">Familia</th>
                    <th className="px-4 py-3">Longitud</th>
                    <th className="px-4 py-3">Apertura</th>
                    <th className="px-4 py-3">Ángulo</th>
                    <th className="px-4 py-3">Estado</th>
                    <th className="px-4 py-3">Riesgo</th>
                    <th className="px-4 py-3">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-dark-border">
                  {paginatedCracks.map((crack) => (
                    <tr
                      key={crack.id}
                      className="transition-colors hover:bg-dark-hover"
                    >
                      <td className="px-4 py-3 font-mono text-xs text-dark-text">
                        {crack.id}
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm text-dark-text">
                          {crack.family}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-mono text-sm text-dark-text">
                          {crack.lengthCm.toFixed(1)}{' '}
                          <span className="text-xs text-dark-muted">cm</span>
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {crack.widthMm != null ? (
                          <span className="font-mono text-sm text-dark-text">
                            {crack.widthMm.toFixed(2)}{' '}
                            <span className="text-xs text-dark-muted">mm</span>
                          </span>
                        ) : (
                          <span className="text-dark-muted">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {crack.angleDeg != null ? (
                          <span className="font-mono text-sm text-dark-text">
                            {crack.angleDeg.toFixed(1)}°
                          </span>
                        ) : (
                          <span className="text-dark-muted">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-block px-2 py-0.5 rounded text-xs font-bold border ${statusBadgeBg(crack.status)} ${statusColor(crack.status)}`}
                        >
                          {crack.status}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-block px-2 py-0.5 rounded text-xs font-bold ${riskBadgeStyle(crack.riskLevel)}`}
                        >
                          {crack.riskLevel}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => handleViewDetail(crack)}
                          className="flex items-center gap-1 rounded-md bg-dark-accent/10 px-3 py-1.5 text-xs font-semibold text-dark-accent transition-colors hover:bg-dark-accent/20"
                        >
                          <Eye className="h-3.5 w-3.5" />
                          Ver detalle
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="flex items-center justify-between border-t border-dark-border px-4 py-3">
              <p className="text-xs text-dark-muted">
                Mostrando{' '}
                {Math.min(
                  filteredCracks.length,
                  (safePage - 1) * PAGE_SIZE + 1,
                )}
                –
                {Math.min(safePage * PAGE_SIZE, filteredCracks.length)} de{' '}
                {filteredCracks.length}
              </p>
              <Pagination
                currentPage={safePage}
                totalPages={totalPages}
                onPageChange={setPage}
              />
            </div>
          </>
        ) : (
          /* ═══════ Filtered Empty State ═══════ */
          <div className="flex h-32 items-center justify-center">
            <div className="flex flex-col items-center gap-2">
              <Search className="h-6 w-6 text-dark-muted" />
              <p className="text-sm text-dark-muted">
                Ninguna fisura coincide con los filtros actuales
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Crack Detail Modal */}
      <CrackDetailModal onViewOnImage={onViewOnImage} />
    </div>
  );
}

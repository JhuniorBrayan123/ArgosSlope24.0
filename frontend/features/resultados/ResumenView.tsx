'use client';

import React from 'react';
import { useResultsStore } from '@/stores/results.store';
import {
  Shield,
  Ruler,
  Activity,
  CheckCircle2,
  AlertTriangle,
  AlertOctagon,
  FileText,
  BarChart3,
  Layers,
} from 'lucide-react';

// ── Helpers ──────────────────────────────────────────────────────────

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

function riskBorderColor(risk: string): string {
  switch (risk) {
    case 'bajo':
      return 'border-emerald-500/30';
    case 'medio':
      return 'border-amber-500/30';
    case 'alto':
      return 'border-orange-500/30';
    case 'critico':
      return 'border-red-500/30';
    default:
      return 'border-dark-border';
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

const FAMILY_COLORS: Record<string, string> = {
  F1: 'text-cyan-400',
  F2: 'text-emerald-400',
  F3: 'text-amber-400',
  FV: 'text-purple-400',
};

// ── Sub-components ───────────────────────────────────────────────────

function GeneralSummaryCards() {
  const currentResult = useResultsStore((s) => s.currentResult);
  const evaluationSummary = useResultsStore((s) => s.evaluationSummary);

  if (!currentResult || !evaluationSummary) return null;

  const statusLabel =
    currentResult.status === 'estable'
      ? 'Estable'
      : currentResult.status === 'observacion'
        ? 'Observación'
        : 'Crítico';

  return (
    <div className="grid grid-cols-3 gap-4 mb-4">
      {/* Total Fisuras */}
      <div className="rounded-xl border border-dark-border bg-dark-elevated p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-dark-muted">Total Fisuras</span>
          <BarChart3 className="h-4 w-4 text-dark-accent" />
        </div>
        <p className="text-2xl font-bold text-dark-text">
          {currentResult.totalCracks}
        </p>
      </div>

      {/* Longitud Total */}
      <div className="rounded-xl border border-dark-border bg-dark-elevated p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-dark-muted">Longitud Total</span>
          <Ruler className="h-4 w-4 text-dark-accent" />
        </div>
        <p className="text-2xl font-bold text-dark-text">
          {currentResult.totalLengthCm}{' '}
          <span className="text-sm text-dark-muted font-normal">cm</span>
        </p>
      </div>

      {/* Estado General */}
      <div className="rounded-xl border border-dark-border bg-dark-elevated p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-dark-muted">Estado General</span>
          <Activity className={`h-4 w-4 ${statusColor(currentResult.status)}`} />
        </div>
        <span
          className={`inline-block px-2.5 py-1 rounded text-xs font-bold border ${statusBadgeBg(currentResult.status)} ${statusColor(currentResult.status)}`}
        >
          {statusLabel}
        </span>
      </div>
    </div>
  );
}

function FamilyCards() {
  const families = useResultsStore((s) => s.families);
  const currentResult = useResultsStore((s) => s.currentResult);

  if (!families || families.length === 0) return null;

  const totalCracks = currentResult?.totalCracks || families.reduce((sum, f) => sum + f.totalCracks, 0);

  return (
    <div className="mb-4">
      <p className="text-sm font-semibold text-dark-text mb-3">Familias</p>
      <div className="grid grid-cols-4 gap-3">
        {families.map((fam) => {
          const percentage = totalCracks > 0
            ? Math.round((fam.totalCracks / totalCracks) * 100)
            : 0;

          return (
            <div
              key={fam.family}
              className={`rounded-xl border bg-dark-elevated p-3 ${riskBorderColor(fam.riskLevel)}`}
            >
              {/* Header */}
              <div className="flex items-center justify-between mb-2">
                <span
                  className={`text-sm font-bold ${FAMILY_COLORS[fam.family] || 'text-dark-text'}`}
                >
                  {fam.family}
                </span>
                <span
                  className={`text-[9px] px-1.5 py-0.5 rounded font-bold uppercase ${riskBadgeStyle(fam.riskLevel)}`}
                >
                  {fam.riskLevel}
                </span>
              </div>

              {/* Stats */}
              <div className="space-y-1 text-xs">
                <div className="flex justify-between">
                  <span className="text-dark-muted">Cantidad</span>
                  <span className="text-dark-text font-semibold">
                    {fam.totalCracks} ({percentage}%)
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-dark-muted">Long. total</span>
                  <span className="text-dark-text font-semibold">
                    {fam.totalLengthCm} cm
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-dark-muted">Long. prom.</span>
                  <span className="text-dark-text font-semibold">
                    {fam.averageLengthCm.toFixed(1)} cm
                  </span>
                </div>
                {fam.criticalCount > 0 && (
                  <div className="flex justify-between pt-1 border-t border-dark-border/50">
                    <span className="text-dark-danger text-[10px]">Críticas</span>
                    <span className="text-dark-danger font-bold">
                      {fam.criticalCount}
                    </span>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function EvaluationPanel() {
  const evaluationSummary = useResultsStore((s) => s.evaluationSummary);

  if (!evaluationSummary) return null;

  return (
    <div>
      <p className="text-sm font-semibold text-dark-text mb-3">Evaluación</p>
      <div className="grid grid-cols-4 gap-3">
        {/* Estables */}
        <div className="rounded-xl border border-emerald-500/30 bg-dark-elevated p-3">
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-400" />
            <span className="text-xs text-dark-muted">Estables</span>
          </div>
          <p className="text-2xl font-bold text-emerald-400">
            {evaluationSummary.estables}
          </p>
        </div>

        {/* En observación */}
        <div className="rounded-xl border border-amber-500/30 bg-dark-elevated p-3">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="h-4 w-4 text-amber-400" />
            <span className="text-xs text-dark-muted">En observación</span>
          </div>
          <p className="text-2xl font-bold text-amber-400">
            {evaluationSummary.observacion}
          </p>
        </div>

        {/* Críticas */}
        <div className="rounded-xl border border-red-500/30 bg-dark-elevated p-3">
          <div className="flex items-center gap-2 mb-2">
            <AlertOctagon className="h-4 w-4 text-dark-danger" />
            <span className="text-xs text-dark-muted">Críticas</span>
          </div>
          <p className="text-2xl font-bold text-dark-danger">
            {evaluationSummary.criticas}
          </p>
        </div>

        {/* Recomendación */}
        <div className="rounded-xl border border-dark-accent/30 bg-dark-elevated p-3 flex flex-col">
          <div className="flex items-center gap-2 mb-2">
            <FileText className="h-4 w-4 text-dark-accent" />
            <span className="text-xs text-dark-muted">Recomendación</span>
          </div>
          <p className="text-xs text-dark-text leading-relaxed">
            {evaluationSummary.recommendation}
          </p>
        </div>
      </div>
    </div>
  );
}

// ── Main Component ───────────────────────────────────────────────────

export function ResumenView() {
  const currentResult = useResultsStore((s) => s.currentResult);
  const families = useResultsStore((s) => s.families);

  if (!currentResult) {
    return (
      <div className="shrink-0 rounded-xl border border-dark-border bg-dark-elevated p-8 flex items-center justify-center">
        <div className="flex flex-col items-center gap-2">
          <Layers className="h-8 w-8 text-dark-muted" />
          <p className="text-sm text-dark-muted">
            Seleccioná un análisis para ver el resumen
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="shrink-0 space-y-2">
      <GeneralSummaryCards />
      {families.length > 0 && <FamilyCards />}
      <EvaluationPanel />
    </div>
  );
}

'use client';

import React, { useState, useMemo } from 'react';
import {
  Layers,
  ArrowLeftRight,
  Ruler,
  AlertTriangle,
  AlertOctagon,
  BarChart3,
  Activity,
  GitCompare,
  ImageIcon,
  FileText,
} from 'lucide-react';

// ── Props ──────────────────────────────────────────────────────────

interface ComparacionViewProps {
  analyses: Array<{
    id: string;
    analysisType: string | null;
    analysisJson: string;
    createdAt: string;
  }>;
  parseAnalysis: (json: string) => any;
  toImageUrl: (path: string | null | undefined) => string | null;
  imgSrc: (url: string | null) => string | undefined;
  images: Record<string, string>;
}

// ── Helpers ────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function analysisTypeName(type: string | null): string {
  switch (type) {
    case 'base':
      return 'Base';
    case 'current':
      return 'Actual';
    case 'comparison':
      return 'Comparación';
    default:
      return type || 'Análisis';
  }
}

function analysisBadgeColor(type: string | null): string {
  switch (type) {
    case 'base':
      return 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30';
    case 'current':
      return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';
    case 'comparison':
      return 'bg-amber-500/20 text-amber-400 border-amber-500/30';
    default:
      return 'bg-dark-border/30 text-dark-muted border-dark-border/30';
  }
}

function familyColor(family: string): string {
  switch (family) {
    case 'F1':
      return 'text-cyan-400';
    case 'F2':
      return 'text-emerald-400';
    case 'F3':
      return 'text-amber-400';
    case 'FV':
      return 'text-purple-400';
    default:
      return 'text-dark-text';
  }
}

function changeIcon(delta: number): string {
  if (delta <= 0) return '🟢';
  if (delta <= 5) return '🟡';
  return '🔴';
}

// ══════════════════════════════════════════════════════════════════
//  MAIN COMPONENT
// ══════════════════════════════════════════════════════════════════

export function ComparacionView({
  analyses,
  parseAnalysis,
  toImageUrl,
  imgSrc,
  images,
}: ComparacionViewProps) {
  // ── Filter only 'base' and 'current' types ──────────────────────
  const validAnalyses = useMemo(
    () =>
      analyses.filter(
        (a) => a.analysisType === 'base' || a.analysisType === 'current',
      ),
    [analyses],
  );

  const [baseId, setBaseId] = useState<string>('');
  const [currentId, setCurrentId] = useState<string>('');
  const [visualMode, setVisualMode] = useState<'side-by-side' | 'overlay'>(
    'side-by-side',
  );

  // ── Set defaults when data loads ────────────────────────────────
  React.useEffect(() => {
    if (validAnalyses.length === 0) return;
    const firstBase = validAnalyses.find((a) => a.analysisType === 'base');
    const firstCurrent = validAnalyses.find((a) => a.analysisType === 'current');
    if (firstBase && !baseId) setBaseId(firstBase.id);
    if (firstCurrent && !currentId) setCurrentId(firstCurrent.id);
    if (!firstBase && !baseId) setBaseId(validAnalyses[0]?.id || '');
    if (!firstCurrent && !currentId)
      setCurrentId(validAnalyses[1]?.id || validAnalyses[0]?.id || '');
  }, [validAnalyses]);

  // ── Resolve selected analyses ────────────────────────────────────
  const baseAnalysis = validAnalyses.find((a) => a.id === baseId) || null;
  const currentAnalysis = validAnalyses.find((a) => a.id === currentId) || null;

  const baseData = baseAnalysis ? parseAnalysis(baseAnalysis.analysisJson) : null;
  const currentData = currentAnalysis
    ? parseAnalysis(currentAnalysis.analysisJson)
    : null;

  // ── Swap handler ─────────────────────────────────────────────────
  const handleSwap = () => {
    const tmp = baseId;
    setBaseId(currentId);
    setCurrentId(tmp);
  };

  // ── Empty / insufficient states ──────────────────────────────────
  if (validAnalyses.length === 0) {
    return (
      <div className="shrink-0 rounded-xl border border-dark-border bg-dark-elevated p-8 mt-4 flex items-center justify-center">
        <div className="flex flex-col items-center gap-2">
          <Layers className="h-8 w-8 text-dark-muted" />
          <p className="text-sm text-dark-muted">
            No hay análisis disponibles para comparar
          </p>
        </div>
      </div>
    );
  }

  if (validAnalyses.length < 2) {
    return (
      <div className="shrink-0 rounded-xl border border-dark-border bg-dark-elevated p-8 mt-4 flex items-center justify-center">
        <div className="flex flex-col items-center gap-2">
          <Layers className="h-8 w-8 text-dark-muted" />
          <p className="text-sm text-dark-muted">
            Se necesitan al menos dos análisis para realizar una comparación
          </p>
        </div>
      </div>
    );
  }

  // ── Compute deltas ──────────────────────────────────────────────
  const deltas = useMemo(() => {
    if (!baseData || !currentData) return null;

    const baseTotal =
      baseData?.summary?.total_fisuras ?? baseData?.total_fisuras ?? 0;
    const currentTotal =
      currentData?.summary?.total_fisuras ?? currentData?.total_fisuras ?? 0;
    const newCracks = currentTotal - baseTotal;

    const baseLength =
      baseData?.summary?.longitud_total_cm ?? baseData?.longitud_total_cm ?? 0;
    const currentLength =
      currentData?.summary?.longitud_total_cm ??
      currentData?.longitud_total_cm ??
      0;
    const deltaLength = +(currentLength - baseLength).toFixed(1);

    // Family comparisons
    const baseFamilies: Record<string, any> =
      baseData?.summary?.familias || {};
    const currentFamilies: Record<string, any> =
      currentData?.summary?.familias || {};

    const allFamilies = Array.from(
      new Set([...Object.keys(baseFamilies), ...Object.keys(currentFamilies)]),
    ).sort();

    const familyDeltas = allFamilies.map((fam) => {
      const bCount = baseFamilies[fam]?.count ?? 0;
      const cCount = currentFamilies[fam]?.count ?? 0;
      return {
        family: fam,
        baseCount: bCount,
        currentCount: cCount,
        delta: cCount - bCount,
      };
    });

    // Biggest absolute change family
    let biggestFamily = '';
    let biggestDelta = 0;
    for (const fd of familyDeltas) {
      const abs = Math.abs(fd.delta);
      if (abs > biggestDelta) {
        biggestDelta = abs;
        biggestFamily = fd.family;
      }
    }

    // NEW CRITICAL CRACKS (approximate — we don't have crack-level detail
    // in the summary, so we check families' criticalCount if available)
    // For the comparison, we check if there's a `criticas` property or
    // use `criticalCount` on the summary level
    const baseCrit = baseData?.summary?.criticas ?? 0;
    const currentCrit = currentData?.summary?.criticas ?? 0;
    const newCritical = Math.max(0, currentCrit - baseCrit);

    // Families with >5 delta
    const familiesAboveThreshold = familyDeltas.filter((fd) => fd.delta > 5);

    // Build conclusion
    const parts: string[] = [];
    if (newCracks > 0) {
      parts.push(
        `Se detectaron ${newCracks} nuevas fisuras en el resultado actual.`,
      );
    }
    if (deltaLength > 50) {
      parts.push(
        `Incremento significativo de longitud acumulada (${deltaLength} cm).`,
      );
    }
    if (familiesAboveThreshold.length > 0) {
      const worst = familiesAboveThreshold.reduce((max, fd) =>
        fd.delta > max.delta ? fd : max,
      );
      parts.push(
        `La familia ${worst.family} presentó el mayor incremento (${worst.delta} fisuras).`,
      );
    }
    if (newCritical > 0) {
      parts.push(
        `${newCritical} nuevas fisuras críticas requieren atención inmediata.`,
      );
    }
    if (parts.length === 0) {
      parts.push(
        'No se detectaron cambios significativos entre ambos análisis.',
      );
    }

    return {
      newCracks,
      deltaLength,
      biggestFamily,
      biggestDelta,
      newCritical,
      familyDeltas,
      conclusion: parts.join(' '),
    };
  }, [baseData, currentData]);

  // ── Images for section 3 ─────────────────────────────────────────
  const baseImages: Record<string, string> = baseData?.images || {};
  const currentImages: Record<string, string> = currentData?.images || {};

  const baseFirstKey = Object.keys(baseImages)[0];
  const currentFirstKey = Object.keys(currentImages)[0];

  const baseImageUrl = baseFirstKey
    ? toImageUrl(baseImages[baseFirstKey])
    : null;
  const currentImageUrl = currentFirstKey
    ? toImageUrl(currentImages[currentFirstKey])
    : null;

  const overlayBaseKey = ['comparacion_original', 'comparacion_final'].find(
    (k) => baseImages[k],
  );
  const overlayCurrentKey = ['comparacion_original', 'comparacion_final'].find(
    (k) => currentImages[k],
  );
  const overlayBaseUrl = overlayBaseKey
    ? toImageUrl(baseImages[overlayBaseKey])
    : null;
  const overlayCurrentUrl = overlayCurrentKey
    ? toImageUrl(currentImages[overlayCurrentKey])
    : null;

  // ── Render ───────────────────────────────────────────────────────
  return (
    <div className="shrink-0 space-y-4 mt-4">
      {/* ════════════════════════════════════════════════════════════ */}
      {/*  SECTION 1 — Selector de resultados                        */}
      {/* ════════════════════════════════════════════════════════════ */}
      <div className="rounded-xl border border-dark-border bg-dark-elevated p-4">
        <h3 className="text-sm font-semibold text-dark-text mb-3 flex items-center gap-2">
          <GitCompare className="h-4 w-4 text-dark-accent" />
          Selector de resultados
        </h3>

        <div className="flex items-start gap-3">
          {/* Base dropdown */}
          <div className="flex-1">
            <label className="block text-[10px] uppercase tracking-wide text-dark-muted mb-1">
              Resultado base
            </label>
            <select
              value={baseId}
              onChange={(e) => setBaseId(e.target.value)}
              className="w-full rounded-lg border border-dark-border bg-dark-surface px-3 py-2 text-xs text-dark-text focus:outline-none focus:border-dark-accent"
            >
              {validAnalyses.map((a) => (
                <option key={a.id} value={a.id}>
                  {analysisTypeName(a.analysisType)} — {formatDate(a.createdAt)}
                </option>
              ))}
            </select>
            {baseAnalysis && (
              <div className="mt-2 flex items-center gap-2">
                <span
                  className={`px-1.5 py-0.5 rounded text-[9px] font-bold border ${analysisBadgeColor(baseAnalysis.analysisType)}`}
                >
                  {analysisTypeName(baseAnalysis.analysisType)}
                </span>
                <span className="text-[10px] text-dark-muted">
                  {formatDate(baseAnalysis.createdAt)}
                </span>
                <span className="text-[10px] text-dark-text">
                  {baseData?.summary?.total_fisuras ?? '—'} fisuras
                </span>
              </div>
            )}
          </div>

          {/* Swap button */}
          <button
            onClick={handleSwap}
            className="mt-5 rounded-lg border border-dark-border/50 bg-dark-surface p-2 hover:bg-dark-elevated transition-colors"
            title="Intercambiar base y actual"
          >
            <ArrowLeftRight className="h-4 w-4 text-dark-accent" />
          </button>

          {/* Current dropdown */}
          <div className="flex-1">
            <label className="block text-[10px] uppercase tracking-wide text-dark-muted mb-1">
              Resultado actual
            </label>
            <select
              value={currentId}
              onChange={(e) => setCurrentId(e.target.value)}
              className="w-full rounded-lg border border-dark-border bg-dark-surface px-3 py-2 text-xs text-dark-text focus:outline-none focus:border-dark-accent"
            >
              {validAnalyses.map((a) => (
                <option key={a.id} value={a.id}>
                  {analysisTypeName(a.analysisType)} — {formatDate(a.createdAt)}
                </option>
              ))}
            </select>
            {currentAnalysis && (
              <div className="mt-2 flex items-center gap-2">
                <span
                  className={`px-1.5 py-0.5 rounded text-[9px] font-bold border ${analysisBadgeColor(currentAnalysis.analysisType)}`}
                >
                  {analysisTypeName(currentAnalysis.analysisType)}
                </span>
                <span className="text-[10px] text-dark-muted">
                  {formatDate(currentAnalysis.createdAt)}
                </span>
                <span className="text-[10px] text-dark-text">
                  {currentData?.summary?.total_fisuras ?? '—'} fisuras
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ════════════════════════════════════════════════════════════ */}
      {/*  SECTION 2 — Cards de cambios                              */}
      {/* ════════════════════════════════════════════════════════════ */}
      {deltas && (
        <div className="grid grid-cols-4 gap-3">
          {/* Nuevas fisuras */}
          <div className="rounded-xl border border-dark-border bg-dark-elevated p-3">
            <div className="flex items-center gap-2 mb-2">
              <BarChart3 className="h-4 w-4 text-dark-accent" />
              <span className="text-xs text-dark-muted">Nuevas fisuras</span>
            </div>
            <p
              className={`text-xl font-bold ${
                deltas.newCracks > 0 ? 'text-dark-danger' : 'text-emerald-400'
              }`}
            >
              {deltas.newCracks > 0 ? '+' : ''}
              {deltas.newCracks}
            </p>
          </div>

          {/* Cambio longitud */}
          <div className="rounded-xl border border-dark-border bg-dark-elevated p-3">
            <div className="flex items-center gap-2 mb-2">
              <Ruler className="h-4 w-4 text-dark-accent" />
              <span className="text-xs text-dark-muted">Cambio longitud</span>
            </div>
            <p
              className={`text-xl font-bold ${
                deltas.deltaLength > 0 ? 'text-dark-danger' : 'text-emerald-400'
              }`}
            >
              {deltas.deltaLength > 0 ? '+' : ''}
              {deltas.deltaLength}{' '}
              <span className="text-sm font-normal text-dark-muted">cm</span>
            </p>
          </div>

          {/* Familia mayor cambio */}
          <div className="rounded-xl border border-dark-border bg-dark-elevated p-3">
            <div className="flex items-center gap-2 mb-2">
              <Activity className="h-4 w-4 text-dark-accent" />
              <span className="text-xs text-dark-muted">
                Familia mayor cambio
              </span>
            </div>
            {deltas.biggestFamily ? (
              <p className="text-xl font-bold text-dark-text">
                <span className={familyColor(deltas.biggestFamily)}>
                  {deltas.biggestFamily}
                </span>{' '}
                <span className="text-sm font-normal text-dark-muted">
                  {deltas.biggestDelta > 0 ? '+' : ''}
                  {deltas.biggestDelta}
                </span>
              </p>
            ) : (
              <p className="text-sm text-dark-muted">—</p>
            )}
          </div>

          {/* Nuevas críticas */}
          <div className="rounded-xl border border-dark-border bg-dark-elevated p-3">
            <div className="flex items-center gap-2 mb-2">
              <AlertOctagon className="h-4 w-4 text-dark-danger" />
              <span className="text-xs text-dark-muted">Nuevas críticas</span>
            </div>
            <p
              className={`text-xl font-bold ${
                deltas.newCritical > 0
                  ? 'text-dark-danger'
                  : 'text-emerald-400'
              }`}
            >
              {deltas.newCritical > 0 ? '+' : ''}
              {deltas.newCritical}
            </p>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════ */}
      {/*  SECTION 3 — Análisis de Diferencias                       */}
      {/* ════════════════════════════════════════════════════════════ */}
      {deltas && (
        <div className="rounded-xl border border-dark-border bg-dark-elevated p-4">
          <h3 className="text-sm font-semibold text-dark-text mb-3 flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-dark-accent" />
            Análisis de Diferencias
          </h3>

          <div className="grid grid-cols-2 gap-3">
            {/* % change card */}
            <div className="rounded-xl border border-dark-border bg-dark-surface p-4">
              <p className="text-[11px] font-medium uppercase tracking-wider text-dark-muted mb-1">
                Cambio total
              </p>
              <p className="text-2xl font-bold text-dark-text">
                {(() => {
                  const baseLen = baseData?.summary?.longitud_total_cm ?? baseData?.longitud_total_cm ?? 0;
                  const currLen = currentData?.summary?.longitud_total_cm ?? currentData?.longitud_total_cm ?? 0;
                  if (baseLen === 0) return '—';
                  const pct = ((currLen - baseLen) / baseLen * 100);
                  return `${pct > 0 ? '+' : ''}${pct.toFixed(1)}%`;
                })()}
              </p>
            </div>

            {/* Severity badge */}
            <div className="rounded-xl border border-dark-border bg-dark-surface p-4">
              <p className="text-[11px] font-medium uppercase tracking-wider text-dark-muted mb-1">
                Severidad
              </p>
              {(() => {
                const baseLen = baseData?.summary?.longitud_total_cm ?? baseData?.longitud_total_cm ?? 0;
                const currLen = currentData?.summary?.longitud_total_cm ?? currentData?.longitud_total_cm ?? 0;
                if (baseLen === 0) return <p className="text-sm text-dark-muted">—</p>;
                const absPct = Math.abs((currLen - baseLen) / baseLen * 100);
                let label: string;
                let color: string;
                if (absPct < 5) {
                  label = 'Sin cambios';
                  color = 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';
                } else if (absPct < 20) {
                  label = 'Cambio menor';
                  color = 'bg-amber-500/20 text-amber-400 border-amber-500/30';
                } else if (absPct < 50) {
                  label = 'Cambio significativo';
                  color = 'bg-orange-500/20 text-orange-400 border-orange-500/30';
                } else {
                  label = 'Cambio severo';
                  color = 'bg-red-500/20 text-dark-danger border-red-500/30';
                }
                return (
                  <span className={`inline-block px-3 py-1 rounded text-xs font-bold border ${color}`}>
                    {label}
                  </span>
                );
              })()}
            </div>
          </div>

          {/* Detachment detection */}
          {deltas.newCritical > 0 && (
            <div className="mt-3 flex items-center gap-2 rounded-lg bg-red-500/10 border border-red-500/30 px-4 py-3">
              <AlertOctagon className="h-5 w-5 text-dark-danger shrink-0" />
              <p className="text-xs text-dark-danger font-semibold">
                ⚠️ Posible desprendimiento detectado — revisar fisuras críticas
              </p>
            </div>
          )}

          {/* Opt-in button for future canvas diff */}
          {deltas.deltaLength === 0 && (
            <button
              className="mt-3 rounded-lg border border-dashed border-dark-border px-4 py-2 text-xs text-dark-muted hover:text-dark-text hover:border-dark-accent/50 transition-colors w-full"
              onClick={() => {
                // Future: canvas-based pixel diff
              }}
            >
              Calcular diferencias visuales
            </button>
          )}
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════ */}
      {/*  SECTION 4 — Comparación visual (side-by-side / overlay)  */}
      {/* ════════════════════════════════════════════════════════════ */}
      {deltas && (
        <div className="rounded-xl border border-dark-border bg-dark-elevated p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-dark-text flex items-center gap-2">
              <ImageIcon className="h-4 w-4 text-dark-accent" />
              Comparación visual
            </h3>
            <div className="flex gap-1 rounded-lg bg-dark-surface p-0.5">
              <button
                onClick={() => setVisualMode('side-by-side')}
                className={`px-3 py-1.5 text-[10px] font-medium rounded-md transition-colors ${
                  visualMode === 'side-by-side'
                    ? 'bg-dark-elevated text-dark-accent shadow-sm'
                    : 'text-dark-muted hover:text-dark-text'
                }`}
              >
                Side by side
              </button>
              <button
                onClick={() => setVisualMode('overlay')}
                className={`px-3 py-1.5 text-[10px] font-medium rounded-md transition-colors ${
                  visualMode === 'overlay'
                    ? 'bg-dark-elevated text-dark-accent shadow-sm'
                    : 'text-dark-muted hover:text-dark-text'
                }`}
              >
                Overlay
              </button>
            </div>
          </div>

          {visualMode === 'side-by-side' && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-[10px] uppercase tracking-wide text-dark-muted mb-1">
                  Imagen Base
                </p>
                <div className="rounded-lg border border-dark-border bg-[#0f1115] overflow-hidden aspect-video flex items-center justify-center">
                  {baseImageUrl ? (
                    <img
                      src={imgSrc(baseImageUrl)}
                      alt="Imagen base"
                      className="w-full h-full object-contain"
                    />
                  ) : (
                    <span className="text-xs text-dark-muted">
                      Sin imagen disponible
                    </span>
                  )}
                </div>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wide text-dark-muted mb-1">
                  Imagen Actual
                </p>
                <div className="rounded-lg border border-dark-border bg-[#0f1115] overflow-hidden aspect-video flex items-center justify-center">
                  {currentImageUrl ? (
                    <img
                      src={imgSrc(currentImageUrl)}
                      alt="Imagen actual"
                      className="w-full h-full object-contain"
                    />
                  ) : (
                    <span className="text-xs text-dark-muted">
                      Sin imagen disponible
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}

          {visualMode === 'overlay' && (
            <div>
              {overlayBaseUrl || overlayCurrentUrl ? (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-[10px] uppercase tracking-wide text-dark-muted mb-1">
                      {overlayBaseKey === 'comparacion_original'
                        ? 'Base vs Actual'
                        : 'Resultado Comparación'}
                      (Base)
                    </p>
                    <div className="rounded-lg border border-dark-border bg-[#0f1115] overflow-hidden aspect-video flex items-center justify-center">
                      {overlayBaseUrl ? (
                        <img
                          src={imgSrc(overlayBaseUrl)}
                          alt="Overlay base"
                          className="w-full h-full object-contain"
                        />
                      ) : (
                        <span className="text-xs text-dark-muted">
                          No disponible
                        </span>
                      )}
                    </div>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-wide text-dark-muted mb-1">
                      {overlayCurrentKey === 'comparacion_original'
                        ? 'Base vs Actual'
                        : 'Resultado Comparación'}
                      (Actual)
                    </p>
                    <div className="rounded-lg border border-dark-border bg-[#0f1115] overflow-hidden aspect-video flex items-center justify-center">
                      {overlayCurrentUrl ? (
                        <img
                          src={imgSrc(overlayCurrentUrl)}
                          alt="Overlay actual"
                          className="w-full h-full object-contain"
                        />
                      ) : (
                        <span className="text-xs text-dark-muted">
                          No disponible
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-center h-32 text-dark-muted text-xs">
                  No hay imágenes de comparación disponibles para estos análisis
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════ */}
      {/*  SECTION 5 — Imágenes del Pipeline de Comparación          */}
      {/* ════════════════════════════════════════════════════════════ */}
      {(() => {
        const COMPARISON_IMAGE_KEYS = ['comparacion_original', 'comparacion_final', 'comparacion_topleft', 'comparacion_skeletons'];
        const COMPARISON_LABELS: Record<string, string> = {
          comparacion_original: 'Original',
          comparacion_final: 'Comparación Final',
          comparacion_topleft: 'Área Afectada',
          comparacion_skeletons: 'Diferencia Skeletons',
        };
        const available = COMPARISON_IMAGE_KEYS.filter((k) => images[k]);
        if (available.length === 0) return null;
        return (
          <div className="rounded-xl border border-dark-border bg-dark-elevated p-4">
            <h3 className="text-sm font-semibold text-dark-text mb-3 flex items-center gap-2">
              <ImageIcon className="h-4 w-4 text-dark-accent" />
              Imágenes del Pipeline de Comparación
            </h3>
            <div className="grid grid-cols-2 gap-3">
              {available.map((key) => {
                const url = toImageUrl(images[key]);
                return (
                  <div key={key}>
                    <p className="text-[10px] uppercase tracking-wide text-dark-muted mb-1">
                      {COMPARISON_LABELS[key] || key}
                    </p>
                    <div className="rounded-lg border border-dark-border bg-[#0f1115] overflow-hidden aspect-video flex items-center justify-center">
                      {url ? (
                        <img
                          src={imgSrc(url)}
                          alt={COMPARISON_LABELS[key] || key}
                          className="w-full h-full object-contain"
                        />
                      ) : (
                        <span className="text-xs text-dark-muted">
                          No disponible
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* ════════════════════════════════════════════════════════════ */}
      {/*  SECTION 6 — Comparación por familias                      */}
      {/* ════════════════════════════════════════════════════════════ */}
      {deltas && deltas.familyDeltas.length > 0 && (
        <div className="rounded-xl border border-dark-border bg-dark-elevated p-4">
          <h3 className="text-sm font-semibold text-dark-text mb-3 flex items-center gap-2">
            <Layers className="h-4 w-4 text-dark-accent" />
            Comparación por familias
          </h3>

          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-dark-border/50">
                  <th className="text-left py-2 px-3 text-dark-muted font-medium">
                    Familia
                  </th>
                  <th className="text-right py-2 px-3 text-dark-muted font-medium">
                    Base
                  </th>
                  <th className="text-right py-2 px-3 text-dark-muted font-medium">
                    Actual
                  </th>
                  <th className="text-right py-2 px-3 text-dark-muted font-medium">
                    Delta
                  </th>
                  <th className="text-center py-2 px-3 text-dark-muted font-medium">
                    Cambio
                  </th>
                </tr>
              </thead>
              <tbody>
                {deltas.familyDeltas.map((fd) => (
                  <tr
                    key={fd.family}
                    className="border-b border-dark-border/20 hover:bg-dark-surface/50 transition-colors"
                  >
                    <td
                      className={`py-2 px-3 font-semibold ${familyColor(fd.family)}`}
                    >
                      {fd.family}
                    </td>
                    <td className="py-2 px-3 text-right text-dark-text">
                      {fd.baseCount}
                    </td>
                    <td className="py-2 px-3 text-right text-dark-text">
                      {fd.currentCount}
                    </td>
                    <td
                      className={`py-2 px-3 text-right font-semibold ${
                        fd.delta > 0
                          ? 'text-dark-danger'
                          : fd.delta < 0
                            ? 'text-emerald-400'
                            : 'text-dark-muted'
                      }`}
                    >
                      {fd.delta > 0 ? '+' : ''}
                      {fd.delta}
                    </td>
                    <td className="py-2 px-3 text-center">
                      <span className="text-base">{changeIcon(fd.delta)}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center gap-4 mt-2 text-[9px] text-dark-muted">
            <span>🟢 Delta ≤ 0</span>
            <span>🟡 Delta 1–5</span>
            <span>🔴 Delta &gt; 5</span>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════ */}
      {/*  SECTION 7 — Conclusión técnica                            */}
      {/* ════════════════════════════════════════════════════════════ */}
      {deltas && (
        <div className="rounded-xl border border-dark-border bg-dark-elevated p-4">
          <h3 className="text-sm font-semibold text-dark-text mb-2 flex items-center gap-2">
            <FileText className="h-4 w-4 text-dark-accent" />
            Conclusión técnica
          </h3>
          <p className="text-xs text-dark-text leading-relaxed">
            {deltas.conclusion}
          </p>
        </div>
      )}

      {/* No selection */}
      {!deltas && baseAnalysis && currentAnalysis && (
        <div className="rounded-xl border border-dark-border bg-dark-elevated p-8 flex items-center justify-center">
          <div className="flex flex-col items-center gap-2">
            <AlertTriangle className="h-6 w-6 text-amber-400" />
            <p className="text-sm text-dark-muted">
              No se pudieron calcular los cambios. Verificá que ambos análisis
              tengan datos completos.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

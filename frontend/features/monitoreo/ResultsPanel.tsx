'use client';

import React, { useMemo } from 'react';

// ── Convierte ruta absoluta del backend a URL del frontend ──────
function toImageUrl(filePath: string | null | undefined): string | null {
  if (!filePath) return null;
  // Buscar "edge\diagnostics\output\" en la ruta y tomar lo que sigue
  const marker = 'diagnostics' + String.fromCharCode(92) + 'output' + String.fromCharCode(92);
  const idx = filePath.indexOf(marker);
  if (idx === -1) {
    // Intentar con forward slash
    const marker2 = 'diagnostics/output/';
    const idx2 = filePath.indexOf(marker2);
    if (idx2 === -1) return null;
    const relPath = filePath.substring(idx2 + marker2.length);
    return `/api/monitoring-2d/diagnostics-output/${relPath}`;
  }
  const relPath = filePath.substring(idx + marker.length);
  return `/api/monitoring-2d/diagnostics-output/${relPath}`;
}

function imgSrc(url: string | null): string | undefined {
  if (!url) return undefined;
  return url + '?t=' + Date.now();
}

// ── Componentes internos ────────────────────────────────────────

function ImageCard({ title, filePath }: { title: string; filePath: string | null | undefined }) {
  const url = toImageUrl(filePath);
  return (
    <div className="rounded-lg border border-dark-border bg-dark-elevated overflow-hidden">
      <p className="text-[10px] font-medium text-dark-muted px-2 py-1 border-b border-dark-border bg-dark-surface/50">
        {title}
      </p>
      {url ? (
        <img
          src={imgSrc(url)}
          alt={title}
          className="w-full object-contain max-h-[200px] bg-black"
          onError={(e) => {
            (e.target as HTMLImageElement).style.display = 'none';
            (e.target as HTMLImageElement).nextElementSibling?.classList.remove('hidden');
          }}
        />
      ) : null}
      <div className={`${url ? 'hidden' : ''} flex items-center justify-center h-[120px] text-xs text-dark-muted`}>
        Resultado no disponible
      </div>
    </div>
  );
}

function ImageGrid({ images }: { images: Record<string, string | null | undefined> | undefined }) {
  if (!images || Object.keys(images).length === 0) {
    return (
      <div className="flex items-center justify-center h-32 text-sm text-dark-muted">
        Sin resultados de análisis
      </div>
    );
  }

  const labels: Record<string, string> = {
    calibrada: 'Imagen Calibrada',
    mask: 'Máscara Binaria',
    skeleton: 'Skeleton',
    familias_overlay: 'Familias Overlay',
    comparacion_original: 'Comparación Original',
    comparacion_final: 'Comparación Final',
    comparacion_skeletons: 'Comparación Skeletons',
    comparacion_topleft: 'Comparación Top-Left',
  };

  return (
    <div className="grid grid-cols-2 gap-3">
      {Object.entries(images).map(([key, path]) => (
        <ImageCard key={key} title={labels[key] || key} filePath={path} />
      ))}
    </div>
  );
}

function SummaryTable({ summary }: { summary: any }) {
  if (!summary) return null;
  return (
    <div className="space-y-2">
      {summary.total_fisuras !== undefined && (
        <div className="flex justify-between text-xs py-1 border-b border-dark-border/50">
          <span className="text-dark-textSecondary">Total fisuras</span>
          <span className="font-semibold text-dark-text">{summary.total_fisuras}</span>
        </div>
      )}
      {summary.longitud_total_cm !== undefined && (
        <div className="flex justify-between text-xs py-1 border-b border-dark-border/50">
          <span className="text-dark-textSecondary">Longitud total</span>
          <span className="font-semibold text-dark-text">{summary.longitud_total_cm} cm</span>
        </div>
      )}
      {summary.familias && Object.entries(summary.familias).map(([fam, data]: [string, any]) => (
        <div key={fam} className="flex justify-between text-xs py-1 border-b border-dark-border/50">
          <span className={`font-bold ${fam === 'F1' ? 'text-dark-fam1' : fam === 'F2' ? 'text-dark-fam2' : 'text-dark-fam4'}`}>
            Familia {fam}
          </span>
          <span className="text-dark-text">{data.count} fisuras / {data.total_cm} cm</span>
        </div>
      ))}
      {/* Comparison specific */}
      {summary.diferencia_fisuras !== undefined && (
        <div className="flex justify-between text-xs py-1 border-b border-dark-border/50">
          <span className="text-dark-textSecondary">Diferencia fisuras</span>
          <span className={`font-semibold ${summary.diferencia_fisuras > 0 ? 'text-dark-danger' : 'text-dark-success'}`}>
            {summary.diferencia_fisuras > 0 ? '+' : ''}{summary.diferencia_fisuras}
          </span>
        </div>
      )}
      {summary.diferencia_longitud_cm !== undefined && (
        <div className="flex justify-between text-xs py-1">
          <span className="text-dark-textSecondary">Diferencia longitud</span>
          <span className={`font-semibold ${summary.diferencia_longitud_cm > 0 ? 'text-dark-danger' : 'text-dark-success'}`}>
            {summary.diferencia_longitud_cm > 0 ? '+' : ''}{summary.diferencia_longitud_cm} cm
          </span>
        </div>
      )}
    </div>
  );
}

function CracksTable({ cracks }: { cracks: any[] | undefined }) {
  if (!cracks || cracks.length === 0) {
    return (
      <div className="flex items-center justify-center h-32 text-sm text-dark-muted">
        Sin datos de fisuras
      </div>
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr className="border-b border-dark-border">
            <th className="text-left px-2 py-1.5 text-dark-muted font-medium">ID</th>
            <th className="text-left px-2 py-1.5 text-dark-muted font-medium">Familia</th>
            <th className="text-right px-2 py-1.5 text-dark-muted font-medium">Ángulo</th>
            <th className="text-right px-2 py-1.5 text-dark-muted font-medium">Long. px</th>
            <th className="text-right px-2 py-1.5 text-dark-muted font-medium">Long. cm</th>
            <th className="text-center px-2 py-1.5 text-dark-muted font-medium">Riesgo</th>
          </tr>
        </thead>
        <tbody>
          {cracks.map((c: any) => (
            <tr key={c.id} className="border-b border-dark-border/30 hover:bg-dark-elevated/50">
              <td className="px-2 py-1.5 text-dark-text font-mono">{c.id}</td>
              <td className="px-2 py-1.5">
                <span className={`rounded px-1 py-0.5 text-[9px] font-bold uppercase ${
                  c.family === 'F1' ? 'bg-dark-fam1/15 text-dark-fam1' :
                  c.family === 'F2' ? 'bg-dark-fam2/15 text-dark-fam2' :
                  c.family === 'FV' ? 'bg-dark-fam4/15 text-dark-fam4' :
                  'bg-dark-border/30 text-dark-muted'
                }`}>{c.family || 'N/A'}</span>
              </td>
              <td className="px-2 py-1.5 text-right text-dark-text">{c.orientation?.toFixed(1) ?? '—'}°</td>
              <td className="px-2 py-1.5 text-right text-dark-text">{c.length_px ?? '—'}</td>
              <td className="px-2 py-1.5 text-right text-dark-text">{(c.length_mm / 10)?.toFixed(1) ?? '—'}</td>
              <td className="px-2 py-1.5 text-center">
                <span className={`text-[9px] font-bold uppercase ${(c.length_mm || 0) > 50 ? 'text-dark-danger' : 'text-dark-success'}`}>
                  {(c.length_mm || 0) > 50 ? 'ALTO' : 'BAJO'}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Tabs ─────────────────────────────────────────────────────────

type TabKey = 'base' | 'current' | 'comparison' | 'metrics' | 'csv';

interface TabDef {
  key: TabKey;
  label: string;
  badge?: number;
}

interface ResultsPanelProps {
  baseAnalysis: any;
  currentAnalysis: any;
  comparisonResult: any;
  loading?: boolean;
}

export default function ResultsPanel({
  baseAnalysis,
  currentAnalysis,
  comparisonResult,
  loading,
}: ResultsPanelProps) {
  const [activeTab, setActiveTab] = React.useState<TabKey>('base');

  const hasAnyResult = baseAnalysis || currentAnalysis || comparisonResult;

  const tabs: TabDef[] = useMemo(() => [
    { key: 'base', label: 'Imagen Base', badge: baseAnalysis?.total_fisuras },
    { key: 'current', label: 'Imagen Actual', badge: currentAnalysis?.total_fisuras },
    { key: 'comparison', label: 'Comparación', badge: comparisonResult && !loading ? 1 : undefined },
    { key: 'metrics', label: 'Métricas' },
    { key: 'csv', label: 'CSV / Tabla', badge: currentAnalysis?.cracks?.length || baseAnalysis?.cracks?.length },
  ], [baseAnalysis, currentAnalysis, comparisonResult, loading]);

  // Auto-switch tab cuando llegan resultados
  React.useEffect(() => {
    if (baseAnalysis && !currentAnalysis && !comparisonResult) setActiveTab('base');
  }, [baseAnalysis, currentAnalysis, comparisonResult]);

  if (!hasAnyResult) {
    return null; // No mostrar nada si no hay resultados
  }

  return (
    <div className="rounded-xl border border-dark-border bg-dark-surface shadow-card overflow-hidden">
      {/* ── Tab Bar ────────────────────────────────────────────────── */}
      <div className="flex border-b border-dark-border bg-dark-elevated overflow-x-auto">
        {tabs.map((tab) => {
          // Solo mostrar tabs relevantes
          if (tab.key === 'base' && !baseAnalysis) return null;
          if (tab.key === 'current' && !currentAnalysis) return null;
          if (tab.key === 'comparison' && !comparisonResult) return null;
          if (tab.key === 'metrics' && !currentAnalysis && !baseAnalysis && !comparisonResult) return null;
          if (tab.key === 'csv' && !currentAnalysis && !baseAnalysis) return null;

          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`relative px-4 py-2.5 text-xs font-medium transition-colors shrink-0 ${
                isActive ? 'text-dark-accent' : 'text-dark-muted hover:text-dark-text'
              }`}
            >
              <div className="flex items-center gap-1.5">
                {tab.label}
                {tab.badge !== undefined && (
                  <span className={`rounded-full px-1.5 py-0.5 text-[9px] ${
                    isActive ? 'bg-dark-accent/20 text-dark-accent' : 'bg-dark-border text-dark-textSecondary'
                  }`}>
                    {tab.badge}
                  </span>
                )}
              </div>
              {isActive && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-dark-accent shadow-[0_0_8px_rgba(14,165,197,0.5)]" />}
            </button>
          );
        })}
      </div>

      {/* ── Tab Content ────────────────────────────────────────────── */}
      <div className="p-4 max-h-[500px] overflow-y-auto">
        {loading && (
          <div className="flex items-center justify-center h-20">
            <svg className="h-5 w-5 animate-spin text-dark-accent" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          </div>
        )}

        {!loading && activeTab === 'base' && baseAnalysis && (
          <div className="space-y-4">
            <ImageGrid images={baseAnalysis.images} />
            <div className="rounded-lg border border-dark-border bg-dark-elevated p-3">
              <p className="text-xs font-semibold text-dark-text mb-2">Resumen — Imagen Base</p>
              <SummaryTable summary={baseAnalysis.summary} />
            </div>
          </div>
        )}

        {!loading && activeTab === 'current' && currentAnalysis && (
          <div className="space-y-4">
            <ImageGrid images={currentAnalysis.images} />
            <div className="rounded-lg border border-dark-border bg-dark-elevated p-3">
              <p className="text-xs font-semibold text-dark-text mb-2">Resumen — Imagen Actual</p>
              <SummaryTable summary={currentAnalysis.summary} />
            </div>
            {currentAnalysis.imageBase64 && (
              <div className="rounded-lg border border-dark-border bg-dark-elevated overflow-hidden">
                <p className="text-[10px] font-medium text-dark-muted px-2 py-1 border-b border-dark-border">
                  Overlay de detección
                </p>
                <img
                  src={`data:image/jpeg;base64,${currentAnalysis.imageBase64}`}
                  alt="Overlay detección"
                  className="w-full object-contain max-h-[200px] bg-black"
                />
              </div>
            )}
          </div>
        )}

        {!loading && activeTab === 'comparison' && comparisonResult && (
          <div className="space-y-4">
            <ImageGrid images={comparisonResult.images} />
            <div className="rounded-lg border border-dark-border bg-dark-elevated p-3">
              <p className="text-xs font-semibold text-dark-text mb-2">Resumen de Comparación</p>
              <SummaryTable summary={comparisonResult.summary} />
            </div>
            {/* Detección de desprendimientos */}
            {comparisonResult.comparison?.detachments?.length > 0 && (
              <div className="rounded-lg border border-orange-500/30 bg-orange-500/5 p-3">
                <p className="text-xs font-semibold text-orange-400 mb-2">
                  ⚠️ Desprendimientos Detectados: {comparisonResult.comparison.detachments.length}
                </p>
                <div className="space-y-1 max-h-[200px] overflow-y-auto">
                  {comparisonResult.comparison.detachments.map((d: any, i: number) => (
                    <div key={i} className="flex justify-between text-[11px] py-0.5 border-b border-orange-500/10">
                      <span className="text-dark-textSecondary">Desprendimiento #{i + 1}</span>
                      <span className="text-dark-text font-mono">
                        {d.area_cm2?.toFixed(1)} cm² · ({d.x},{d.y}) {d.w}×{d.h}px
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {comparisonResult.comparison?.detachments?.length === 0 && (
              <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3">
                <p className="text-xs font-semibold text-emerald-400">
                  ✅ Sin desprendimientos detectados
                </p>
              </div>
            )}
            {/* Stats de comparación */}
            {comparisonResult.comparison?.stats && (
              <div className="rounded-lg border border-dark-border bg-dark-elevated p-3">
                <p className="text-xs font-semibold text-dark-text mb-2">Estadísticas de Diferencia</p>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-dark-muted">Píxeles diferentes</span>
                    <p className="text-dark-text font-bold">{comparisonResult.comparison.stats.different_px?.toLocaleString()}</p>
                  </div>
                  <div>
                    <span className="text-dark-muted">% de cambio</span>
                    <p className="text-dark-text font-bold">{comparisonResult.comparison.stats.pct_different}%</p>
                  </div>
                </div>
              </div>
            )}
            {/* Mostrar análisis actual inline */}
            {comparisonResult.current_analysis && (
              <div className="rounded-lg border border-dark-border bg-dark-elevated p-3">
                <p className="text-xs font-semibold text-dark-text mb-2">Análisis de Imagen Actual</p>
                <SummaryTable summary={comparisonResult.current_analysis.summary} />
              </div>
            )}
          </div>
        )}

        {!loading && activeTab === 'metrics' && (
          <div className="space-y-3">
            {(baseAnalysis || currentAnalysis) && (
              <div className="rounded-lg border border-dark-border bg-dark-elevated p-3">
                <p className="text-xs font-semibold text-dark-text mb-2">Métricas</p>
                <SummaryTable summary={currentAnalysis?.summary || baseAnalysis?.summary} />
              </div>
            )}
            {comparisonResult && (
              <div className="rounded-lg border border-dark-border bg-dark-elevated p-3">
                <p className="text-xs font-semibold text-dark-text mb-2">Comparación</p>
                <SummaryTable summary={comparisonResult.summary} />
              </div>
            )}
          </div>
        )}

        {!loading && activeTab === 'csv' && (
          <CracksTable cracks={currentAnalysis?.cracks || baseAnalysis?.cracks} />
        )}
      </div>
    </div>
  );
}

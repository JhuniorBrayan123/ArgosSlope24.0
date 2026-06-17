'use client';

/**
 * ARGOS SLOPE 4.0 — Analytics Dashboard.
 *
 * Full analytics dashboard with period selector, multi-fissure comparison
 * charts (Line/Bar), TTT projections, period comparison, and export.
 * Uses analytics.store for state and fissuresService for supplemental data.
 */

import { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import dynamic from 'next/dynamic';
import {
  LineChart,
  BarChart,
  Line,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { useAnalyticsStore } from '@/stores/analytics.store';
import type { AnalyticsPeriod, ChartDataPoint } from '@/stores/analytics.store';
import { useFissureStore } from '@/stores/fissure.store';
import type { FisuraResponse } from '@/services/api-client';

// ── Recharts dynamic import guard (ssr: false handled by parent page) ──

// ── Dark-theme chart constants ────────────────────────────────────────
const AXIS_STROKE = '#8888aa';
const GRID_STROKE = '#2a2a4a';
const TICK_FONT = { fontSize: 12, fill: '#8888aa' };

const CHART_COLORS = [
  '#00d4aa', '#f59e0b', '#ef4444', '#3b82f6',
  '#a855f7', '#ec4899', '#14b8a6', '#f97316',
];

// ── Period label map ──────────────────────────────────────────────────
const PERIOD_LABELS: Record<AnalyticsPeriod, string> = {
  '7d': '7 días',
  '30d': '30 días',
  '90d': '90 días',
  '1y': '1 año',
  custom: 'Personalizado',
};

// ── Custom recharts tooltip ───────────────────────────────────────────
function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-dark-border bg-dark-surface px-3 py-2 text-sm shadow-xl">
      <p className="mb-1 font-medium text-dark-secondary">{label}</p>
      {payload.map((entry: any, i: number) => (
        <p key={i} style={{ color: entry.color }} className="font-semibold">
          {entry.name}: {Number(entry.value).toFixed(3)}
        </p>
      ))}
    </div>
  );
}

// ── Helper: format date for display ──────────────────────────────────
function formatFecha(fecha: string): string {
  try {
    return new Date(fecha).toLocaleDateString('es-ES', {
      day: '2-digit',
      month: '2-digit',
    });
  } catch {
    return fecha;
  }
}

// ── TTT Projection card type ─────────────────────────────────────────
interface TttProjection {
  fisuraId: number;
  roiId: string;
  daysToCritical: number | null;
  status: string;
}

// ── Period comparison stats ──────────────────────────────────────────
interface PeriodStats {
  avgAncho: number;
  maxDelta: number;
  totalMediciones: number;
  avgVelocidad: number;
}

// ── Chart type ───────────────────────────────────────────────────────
type ChartMode = 'ancho' | 'velocidad' | 'delta';

// ====================================================================
// AnalyticsDashboard
// ====================================================================

export default function AnalyticsDashboard() {
  // ── Stores ──────────────────────────────────────────────────────
  const {
    period,
    customRange,
    selectedFissures,
    chartData,
    loading,
    error,
    setPeriod,
    setCustomRange,
    toggleFissure,
    fetchAnalytics,
    reset,
  } = useAnalyticsStore();

  const fissureStore = useFissureStore();

  // ── Local state ─────────────────────────────────────────────────
  const [fissuresList, setFissuresList] = useState<FisuraResponse[]>([]);
  const [showFissureDropdown, setShowFissureDropdown] = useState(false);
  const [chartMode, setChartMode] = useState<ChartMode>('ancho');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [showCustomPicker, setShowCustomPicker] = useState(false);
  const [tttProjections, setTttProjections] = useState<TttProjection[]>([]);
  const [tttLoading, setTttLoading] = useState(false);

  // Ref for chart export
  const chartContainerRef = useRef<HTMLDivElement>(null);

  // ── Fetch fissures list on mount ───────────────────────────────
  useEffect(() => {
    fissureStore.fetchFissures();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync local list from store
  useEffect(() => {
    if (fissureStore.fissures.length > 0) {
      setFissuresList(fissureStore.fissures);
    }
  }, [fissureStore.fissures]);

  // ── Fetch analytics when period changes ────────────────────────
  useEffect(() => {
    fetchAnalytics();
  }, [period, customRange]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Fetch TTT projections ──────────────────────────────────────
  useEffect(() => {
    let mounted = true;
    async function loadTtt() {
      setTttLoading(true);
      try {
        const { fissuresService } = await import('@/services/fissures.service');
        const predictions = await fissuresService.getPredicciones() as any[];
        if (!mounted) return;
        const mapped: TttProjection[] = (predictions || []).map((p: any) => ({
          fisuraId: p.fisuraId ?? p.fisura_id ?? p.id ?? 0,
          roiId: p.roiId ?? p.roi_id ?? '—',
          daysToCritical: p.daysToCritical ?? p.dias_para_critico ?? null,
          status: p.status ?? p.estado ?? p.tendencia ?? 'desconocido',
        }));
        setTttProjections(mapped);
      } catch {
        // predictions may not be available — leave empty
      } finally {
        if (mounted) setTttLoading(false);
      }
    }
    loadTtt();
    return () => { mounted = false; };
  }, []);

  // ── Compute chart data derived from store chartData ────────────
  const processedChartData = useMemo(() => {
    if (!chartData || chartData.length === 0) return [];
    return chartData.map((point) => {
      const formatted: Record<string, any> = {
        fecha: formatFecha(point.fecha),
        _rawFecha: point.fecha,
      };
      // Copy all numeric keys as-is
      Object.entries(point).forEach(([key, val]) => {
        if (key !== 'fecha' && typeof val === 'number') {
          formatted[key] = val;
        }
      });
      return formatted;
    });
  }, [chartData]);

  // ── Filter chart data by selected fissures ─────────────────────
  const filteredChartData = useMemo(() => {
    if (selectedFissures.length === 0) return processedChartData;
    return processedChartData.map((point) => {
      const filtered: Record<string, any> = { fecha: point.fecha };
      selectedFissures.forEach((fid) => {
        // Look for keys matching this fissure ID
        Object.entries(point).forEach(([key, val]) => {
          if (key.includes(`_${fid}_`) || key.includes(`${fid}_`) || key.endsWith(`_${fid}`)) {
            filtered[key] = val;
          }
        });
      });
      return filtered;
    });
  }, [processedChartData, selectedFissures]);

  // ── Compute stats summary ──────────────────────────────────────
  const statsSummary = useMemo(() => {
    if (!chartData || chartData.length === 0) {
      return { totalMediciones: 0, avgAncho: 0, maxDelta: 0, criticas: 0 };
    }
    let totalAncho = 0;
    let maxDelta = 0;
    let count = 0;
    chartData.forEach((point) => {
      Object.entries(point).forEach(([key, val]) => {
        if (key.includes('ancho') && typeof val === 'number') {
          totalAncho += val;
          count++;
        }
        if (key.includes('delta') && typeof val === 'number') {
          maxDelta = Math.max(maxDelta, val);
        }
      });
    });
    return {
      totalMediciones: chartData.length * Math.max(1, selectedFissures.length || 1),
      avgAncho: count > 0 ? totalAncho / count : 0,
      maxDelta,
      criticas: fissuresList.filter((f) => f.esCritica).length,
    };
  }, [chartData, selectedFissures, fissuresList]);

  // ── Period comparison stats (current vs previous period) ───────
  const periodComparison = useMemo(() => {
    if (!chartData || chartData.length < 2) return null;
    const mid = Math.floor(chartData.length / 2);
    const current = chartData.slice(mid);
    const previous = chartData.slice(0, mid);

    const calcStats = (data: ChartDataPoint[]): PeriodStats => {
      let avgAncho = 0;
      let maxDelta = 0;
      let count = 0;
      data.forEach((point) => {
        Object.entries(point).forEach(([key, val]) => {
          if (key.includes('ancho') && typeof val === 'number') {
            avgAncho += val;
            count++;
          }
          if (key.includes('delta') && typeof val === 'number') {
            maxDelta = Math.max(maxDelta, val);
          }
        });
      });
      return {
        avgAncho: count > 0 ? avgAncho / count : 0,
        maxDelta,
        totalMediciones: data.length,
        avgVelocidad: 0,
      };
    };

    return {
      current: calcStats(current),
      previous: calcStats(previous),
    };
  }, [chartData]);

  // ── Get reference lines for the selected chart mode ────────────
  const chartKeys = useMemo(() => {
    if (!chartData || chartData.length === 0 || selectedFissures.length === 0) return [];
    // Find keys in the first data point that match the chart mode
    const sample = chartData[0];
    const modeMap: Record<ChartMode, string> = {
      ancho: 'ancho',
      velocidad: 'velocidad',
      delta: 'delta',
    };
    const search = modeMap[chartMode];
    return Object.keys(sample).filter((key) =>
      key.toLowerCase().includes(search) &&
      key !== 'fecha' &&
      typeof sample[key] === 'number'
    );
  }, [chartData, selectedFissures, chartMode]);

  // ── Export chart as PNG ────────────────────────────────────────
  const handleExportChart = useCallback(() => {
    const container = chartContainerRef.current;
    if (!container) return;

    // Find the SVG inside the chart container
    const svg = container.querySelector('svg');
    if (!svg) return;

    const svgData = new XMLSerializer().serializeToString(svg);
    const canvas = document.createElement('canvas');
    const rect = svg.getBoundingClientRect();
    canvas.width = rect.width * 2;
    canvas.height = rect.height * 2;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const img = new Image();
    img.onload = () => {
      ctx.scale(2, 2);
      // Dark background
      ctx.fillStyle = '#1a1a2e';
      ctx.fillRect(0, 0, rect.width, rect.height);
      ctx.drawImage(img, 0, 0);
      const link = document.createElement('a');
      link.download = `analitica-${period}-${Date.now()}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    };
    img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData)));
  }, [period]);

  // ── Handle custom range apply ──────────────────────────────────
  const handleApplyCustomRange = () => {
    if (customStart && customEnd) {
      setCustomRange({ start: customStart, end: customEnd });
      setShowCustomPicker(false);
    }
  };

  // ── Loading ─────────────────────────────────────────────────────
  if (loading && chartData.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center rounded-xl border border-dark-border bg-dark-surface">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-dark-accent border-t-transparent" />
          <p className="text-sm text-dark-secondary">Cargando datos analíticos…</p>
        </div>
      </div>
    );
  }

  // ── Error ───────────────────────────────────────────────────────
  if (error && chartData.length === 0) {
    return (
      <div className="rounded-xl border border-dark-border bg-dark-surface p-6">
        <div className="flex flex-col items-center gap-3">
          <p className="text-sm text-dark-danger">{error}</p>
          <button
            onClick={fetchAnalytics}
            className="rounded-lg bg-dark-accent px-4 py-2 text-sm font-semibold text-dark-primary transition-opacity hover:opacity-90"
          >
            Reintentar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ─────────────────────────────────────────────────────────────
           Period Selector + Fissure Selector row
           ───────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        {/* Period selector */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-dark-secondary">
            Período:
          </span>
          {(['7d', '30d', '90d', '1y'] as AnalyticsPeriod[]).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                period === p
                  ? 'bg-dark-accent text-dark-primary'
                  : 'bg-dark-hover text-dark-secondary hover:bg-dark-border hover:text-dark-text'
              }`}
            >
              {PERIOD_LABELS[p]}
            </button>
          ))}
          <button
            onClick={() => {
              setShowCustomPicker(!showCustomPicker);
              if (period !== 'custom') {
                setPeriod('custom');
              }
            }}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
              period === 'custom'
                ? 'bg-dark-accent text-dark-primary'
                : 'bg-dark-hover text-dark-secondary hover:bg-dark-border hover:text-dark-text'
            }`}
          >
            Personalizado
          </button>
        </div>

        {/* Multi-fissure selector */}
        <div className="relative">
          <button
            onClick={() => setShowFissureDropdown(!showFissureDropdown)}
            className="flex items-center gap-2 rounded-lg bg-dark-hover px-3 py-1.5 text-xs font-semibold text-dark-secondary transition-all hover:bg-dark-border hover:text-dark-text"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
            Fisuras ({selectedFissures.length} seleccionadas)
          </button>

          {showFissureDropdown && (
            <>
              <div
                className="fixed inset-0 z-30"
                onClick={() => setShowFissureDropdown(false)}
              />
              <div className="absolute right-0 z-40 mt-1 w-64 rounded-xl border border-dark-border bg-dark-surface p-2 shadow-2xl">
                <p className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wider text-dark-secondary">
                  Seleccionar fisuras
                </p>
                {fissuresList.length === 0 && (
                  <p className="px-2 py-3 text-center text-xs text-dark-secondary">
                    No hay fisuras disponibles
                  </p>
                )}
                <div className="max-h-48 overflow-y-auto">
                  {fissuresList.map((f) => (
                    <label
                      key={f.id}
                      className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-dark-text transition-colors hover:bg-dark-hover"
                    >
                      <input
                        type="checkbox"
                        checked={selectedFissures.includes(f.id)}
                        onChange={() => toggleFissure(f.id)}
                        className="accent-dark-accent"
                      />
                      <span className="font-mono text-dark-secondary">#{f.id}</span>
                      <span>{f.roiId}</span>
                      {f.esCritica && (
                        <span className="ml-auto rounded-full bg-dark-danger/15 px-1.5 py-0.5 text-[10px] font-semibold text-dark-danger">
                          Crítico
                        </span>
                      )}
                    </label>
                  ))}
                </div>
                {selectedFissures.length > 0 && (
                  <button
                    onClick={() => {
                      selectedFissures.forEach((id) => toggleFissure(id));
                    }}
                    className="mt-2 w-full rounded-lg bg-dark-hover px-2 py-1 text-[11px] text-dark-secondary transition-colors hover:text-dark-text"
                  >
                    Limpiar selección
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Custom date picker */}
      {showCustomPicker && (
        <div className="flex flex-wrap items-end gap-3 rounded-xl border border-dark-border bg-dark-surface p-4">
          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-dark-secondary">
              Desde
            </label>
            <input
              type="date"
              value={customStart}
              onChange={(e) => setCustomStart(e.target.value)}
              className="rounded-lg border border-dark-border bg-dark-primary px-3 py-1.5 text-sm text-dark-text focus:border-dark-accent focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-dark-secondary">
              Hasta
            </label>
            <input
              type="date"
              value={customEnd}
              onChange={(e) => setCustomEnd(e.target.value)}
              className="rounded-lg border border-dark-border bg-dark-primary px-3 py-1.5 text-sm text-dark-text focus:border-dark-accent focus:outline-none"
            />
          </div>
          <button
            onClick={handleApplyCustomRange}
            disabled={!customStart || !customEnd}
            className="rounded-lg bg-dark-accent px-4 py-1.5 text-xs font-semibold text-dark-primary transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            Aplicar
          </button>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
           Stats Summary Row
           ───────────────────────────────────────────────────────────── */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-dark-border bg-dark-surface p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-dark-secondary">
            Mediciones
          </p>
          <p className="mt-1 text-2xl font-bold text-dark-text">
            {statsSummary.totalMediciones}
          </p>
        </div>
        <div className="rounded-xl border border-dark-border bg-dark-surface p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-dark-secondary">
            Ancho Promedio
          </p>
          <p className="mt-1 text-2xl font-bold text-dark-accent">
            {statsSummary.avgAncho.toFixed(2)} mm
          </p>
        </div>
        <div className="rounded-xl border border-dark-border bg-dark-surface p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-dark-secondary">
            Δ% Máximo
          </p>
          <p className={`mt-1 text-2xl font-bold ${statsSummary.maxDelta > 5 ? 'text-dark-danger' : 'text-dark-warning'}`}>
            {statsSummary.maxDelta.toFixed(1)}%
          </p>
        </div>
        <div className="rounded-xl border border-dark-border bg-dark-surface p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-dark-secondary">
            Críticas
          </p>
          <p className={`mt-1 text-2xl font-bold ${statsSummary.criticas > 0 ? 'text-dark-danger' : 'text-dark-accent'}`}>
            {statsSummary.criticas}
          </p>
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────
           Chart Section
           ───────────────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-dark-border bg-dark-surface p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-dark-text">
            Evolución Temporal
          </h2>
          <div className="flex items-center gap-2">
            {/* Chart type toggle */}
            <div className="flex rounded-lg border border-dark-border overflow-hidden">
              {(['ancho', 'velocidad', 'delta'] as ChartMode[]).map((mode) => (
                <button
                  key={mode}
                  onClick={() => setChartMode(mode)}
                  className={`px-3 py-1.5 text-xs font-semibold transition-all ${
                    chartMode === mode
                      ? 'bg-dark-accent text-dark-primary'
                      : 'bg-dark-primary text-dark-secondary hover:text-dark-text'
                  }`}
                >
                  {mode === 'ancho' ? 'Ancho' : mode === 'velocidad' ? 'Velocidad' : 'Delta %'}
                </button>
              ))}
            </div>
            {/* Export button */}
            <button
              onClick={handleExportChart}
              disabled={filteredChartData.length === 0}
              className="flex items-center gap-1.5 rounded-lg bg-dark-hover px-3 py-1.5 text-xs font-semibold text-dark-secondary transition-all hover:bg-dark-border hover:text-dark-text disabled:opacity-40"
            >
              <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Exportar PNG
            </button>
          </div>
        </div>

        {/* Empty state */}
        {filteredChartData.length === 0 && (
          <div className="flex h-64 items-center justify-center rounded-lg border border-dashed border-dark-border bg-dark-primary">
            <div className="text-center">
              <p className="text-sm text-dark-secondary">
                {selectedFissures.length === 0
                  ? 'Seleccione una o más fisuras para visualizar datos'
                  : 'No hay datos disponibles para el período seleccionado'}
              </p>
            </div>
          </div>
        )}

        {/* Chart */}
        {filteredChartData.length > 0 && (
          <div ref={chartContainerRef} className="relative">
            {loading && (
              <div className="absolute inset-0 z-10 flex items-center justify-center rounded-lg bg-dark-surface/60">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-dark-accent border-t-transparent" />
              </div>
            )}
            <ResponsiveContainer width="100%" height={320}>
              {chartMode === 'delta' ? (
                <BarChart data={filteredChartData} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
                  <XAxis dataKey="fecha" stroke={AXIS_STROKE} tick={TICK_FONT} axisLine={{ stroke: GRID_STROKE }} />
                  <YAxis stroke={AXIS_STROKE} tick={TICK_FONT} axisLine={{ stroke: GRID_STROKE }} unit="%" />
                  <Tooltip content={<ChartTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 12, color: '#8888aa' }} />
                  {chartKeys.length > 0
                    ? chartKeys.map((key, i) => (
                        <Bar
                          key={key}
                          dataKey={key}
                          name={key.replace(/_/g, ' ')}
                          fill={CHART_COLORS[i % CHART_COLORS.length]}
                          radius={[2, 2, 0, 0]}
                        />
                      ))
                    : // Fallback: show all numeric keys
                      Object.keys(filteredChartData[0] || {})
                        .filter((k) => k !== 'fecha' && k !== '_rawFecha' && typeof filteredChartData[0]?.[k] === 'number')
                        .map((key, i) => (
                          <Bar
                            key={key}
                            dataKey={key}
                            name={key.replace(/_/g, ' ')}
                            fill={CHART_COLORS[i % CHART_COLORS.length]}
                            radius={[2, 2, 0, 0]}
                          />
                        ))}
                </BarChart>
              ) : (
                <LineChart data={filteredChartData} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
                  <XAxis dataKey="fecha" stroke={AXIS_STROKE} tick={TICK_FONT} axisLine={{ stroke: GRID_STROKE }} />
                  <YAxis stroke={AXIS_STROKE} tick={TICK_FONT} axisLine={{ stroke: GRID_STROKE }} unit={chartMode === 'velocidad' ? ' mm/día' : ' mm'} />
                  <Tooltip content={<ChartTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 12, color: '#8888aa' }} />
                  {chartKeys.length > 0
                    ? chartKeys.map((key, i) => (
                        <Line
                          key={key}
                          type="monotone"
                          dataKey={key}
                          name={key.replace(/_/g, ' ')}
                          stroke={CHART_COLORS[i % CHART_COLORS.length]}
                          strokeWidth={2}
                          dot={{ r: 3, fill: CHART_COLORS[i % CHART_COLORS.length] }}
                          activeDot={{ r: 5 }}
                          connectNulls={false}
                        />
                      ))
                    : // Fallback
                      Object.keys(filteredChartData[0] || {})
                        .filter((k) => k !== 'fecha' && k !== '_rawFecha' && typeof filteredChartData[0]?.[k] === 'number')
                        .map((key, i) => (
                          <Line
                            key={key}
                            type="monotone"
                            dataKey={key}
                            name={key.replace(/_/g, ' ')}
                            stroke={CHART_COLORS[i % CHART_COLORS.length]}
                            strokeWidth={2}
                            dot={{ r: 3, fill: CHART_COLORS[i % CHART_COLORS.length] }}
                            activeDot={{ r: 5 }}
                            connectNulls={false}
                          />
                        ))}
                </LineChart>
              )}
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* ─────────────────────────────────────────────────────────────
           TTT Projection Cards + Period Comparison row
           ───────────────────────────────────────────────────────────── */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* TTT Projections */}
        <div className="rounded-xl border border-dark-border bg-dark-surface p-5">
          <h2 className="mb-4 text-lg font-semibold text-dark-text">
            Proyección TTT
          </h2>
          {tttLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-dark-accent border-t-transparent" />
            </div>
          ) : tttProjections.length === 0 ? (
            <div className="flex h-24 items-center justify-center rounded-lg border border-dashed border-dark-border bg-dark-primary">
              <p className="text-xs text-dark-secondary">
                Datos de proyección no disponibles
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {tttProjections
                .filter((t) => selectedFissures.length === 0 || selectedFissures.includes(t.fisuraId))
                .slice(0, 5)
                .map((t) => (
                  <div
                    key={t.fisuraId}
                    className="flex items-center justify-between rounded-lg border border-dark-border bg-dark-primary p-3"
                  >
                    <div>
                      <p className="text-sm font-semibold text-dark-text">{t.roiId}</p>
                      <p className="text-[11px] text-dark-secondary">Fisura #{t.fisuraId}</p>
                    </div>
                    <div className="text-right">
                      {t.daysToCritical !== null ? (
                        <>
                          <p
                            className={`text-lg font-bold ${
                              t.daysToCritical <= 7
                                ? 'text-dark-danger'
                                : t.daysToCritical <= 30
                                ? 'text-dark-warning'
                                : 'text-dark-accent'
                            }`}
                          >
                            {t.daysToCritical}
                          </p>
                          <p className="text-[11px] text-dark-secondary">días</p>
                        </>
                      ) : (
                        <p className="text-sm text-dark-secondary">—</p>
                      )}
                    </div>
                  </div>
                ))}
            </div>
          )}
        </div>

        {/* Period Comparison */}
        <div className="rounded-xl border border-dark-border bg-dark-surface p-5">
          <h2 className="mb-4 text-lg font-semibold text-dark-text">
            Comparación de Períodos
          </h2>
          {periodComparison ? (
            <div className="space-y-4">
              {/* Header */}
              <div className="grid grid-cols-3 gap-2 text-center text-[11px] font-semibold uppercase tracking-wider text-dark-secondary">
                <div />
                <div>Período Anterior</div>
                <div>Período Actual</div>
              </div>
              {/* Avg Ancho */}
              <div className="grid grid-cols-3 gap-2 rounded-lg border border-dark-border bg-dark-primary p-3 text-center">
                <div className="text-left text-xs font-medium text-dark-text">Ancho Prom.</div>
                <div className="font-mono text-sm text-dark-secondary">
                  {periodComparison.previous.avgAncho.toFixed(2)} mm
                </div>
                <div className="font-mono text-sm text-dark-text">
                  {periodComparison.current.avgAncho.toFixed(2)} mm
                </div>
              </div>
              {/* Max Delta */}
              <div className="grid grid-cols-3 gap-2 rounded-lg border border-dark-border bg-dark-primary p-3 text-center">
                <div className="text-left text-xs font-medium text-dark-text">Δ% Máx</div>
                <div className="font-mono text-sm text-dark-secondary">
                  {periodComparison.previous.maxDelta.toFixed(1)}%
                </div>
                <div
                  className={`font-mono text-sm font-semibold ${
                    periodComparison.current.maxDelta > periodComparison.previous.maxDelta
                      ? 'text-dark-danger'
                      : 'text-dark-accent'
                  }`}
                >
                  {periodComparison.current.maxDelta.toFixed(1)}%
                </div>
              </div>
              {/* Trend indicator */}
              <div className="rounded-lg bg-dark-primary p-3 text-center">
                <p className="text-xs text-dark-secondary">Tendencia</p>
                <p
                  className={`mt-1 text-sm font-bold ${
                    periodComparison.current.avgAncho > periodComparison.previous.avgAncho
                      ? 'text-dark-danger'
                      : 'text-dark-accent'
                  }`}
                >
                  {periodComparison.current.avgAncho > periodComparison.previous.avgAncho
                    ? '↑ En aumento'
                    : periodComparison.current.avgAncho < periodComparison.previous.avgAncho
                    ? '↓ Disminuyendo'
                    : '→ Estable'}
                </p>
              </div>
            </div>
          ) : (
            <div className="flex h-24 items-center justify-center rounded-lg border border-dashed border-dark-border bg-dark-primary">
              <p className="text-xs text-dark-secondary">
                Se requieren al menos 2 puntos de datos para la comparación
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

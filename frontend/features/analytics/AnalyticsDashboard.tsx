'use client';

/**
 * ARGOS SLOPE 4.0 — Analytics Dashboard.
 *
 * Simplified analytics dashboard with period selector, KPI cards,
 * average width trend chart, and risk distribution chart.
 */

import { useEffect, useState, useMemo } from 'react';
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell
} from 'recharts';
import reportsService, { ReportSummaryResponse, ReportTrendPoint, ReportAlertSummary } from '@/services/reports.service';

// ── Types ────────────────────────────────────────────────────────────

type AnalyticsPeriod = '7d' | '30d' | '90d' | '1y' | 'custom';

// ── Constants ────────────────────────────────────────────────────────

const PERIOD_LABELS: Record<AnalyticsPeriod, string> = {
  '7d': '7 días',
  '30d': '30 días',
  '90d': '90 días',
  '1y': '1 año',
  custom: 'Personalizado',
};

const AXIS_STROKE = '#8888aa';
const GRID_STROKE = '#2a2a4a';
const TICK_FONT = { fontSize: 12, fill: '#8888aa' };

const ALERT_COLORS: Record<string, string> = {
  'Critico': '#ef4444',
  'Advertencia': '#f59e0b',
  'Informativo': '#00d4aa',
};

// ── Custom Tooltips ──────────────────────────────────────────────────

function TrendTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-dark-border bg-dark-surface px-3 py-2 text-sm shadow-xl">
      <p className="mb-1 font-medium text-dark-textSecondary">{label}</p>
      <p className="font-semibold text-dark-accent">
        Ancho Promedio: {Number(payload[0].value).toFixed(2)} mm
      </p>
      {payload[1] && (
        <p className="font-semibold text-dark-text mt-1">
          Fisuras medidas: {payload[1].value}
        </p>
      )}
    </div>
  );
}

function RiskTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-dark-border bg-dark-surface px-3 py-2 text-sm shadow-xl">
      <p className="mb-1 font-medium text-dark-textSecondary">{label}</p>
      <p className="font-semibold text-dark-text">
        Cantidad: {payload[0].value}
      </p>
    </div>
  );
}

// ====================================================================
// AnalyticsDashboard
// ====================================================================

export default function AnalyticsDashboard() {
  const [period, setPeriod] = useState<AnalyticsPeriod>('7d');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [showCustomPicker, setShowCustomPicker] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [summary, setSummary] = useState<ReportSummaryResponse | null>(null);
  const [trends, setTrends] = useState<ReportTrendPoint[]>([]);
  const [alerts, setAlerts] = useState<ReportAlertSummary[]>([]);

  // Calculate actual date range based on period
  const dateRange = useMemo(() => {
    if (period === 'custom' && customStart && customEnd) {
      return { start: customStart, end: customEnd };
    }
    if (period !== 'custom') {
      const now = new Date();
      const end = now.toISOString().split('T')[0];
      const start = new Date(now);
      if (period === '7d') start.setDate(start.getDate() - 7);
      if (period === '30d') start.setDate(start.getDate() - 30);
      if (period === '90d') start.setDate(start.getDate() - 90);
      if (period === '1y') start.setFullYear(start.getFullYear() - 1);
      return { start: start.toISOString().split('T')[0], end };
    }
    return null;
  }, [period, customStart, customEnd]);

  // Load data
  useEffect(() => {
    if (!dateRange) return;

    let mounted = true;
    const loadAnalytics = async () => {
      setLoading(true);
      setError(null);
      try {
        const dias = period === '1y' ? 365 : period === '90d' ? 90 : period === '30d' ? 30 : 7;
        const [sumRes, trendsRes, alertsRes] = await Promise.all([
          reportsService.getSummary(dateRange.start, dateRange.end),
          reportsService.getTrends(dias, dateRange.start, dateRange.end),
          reportsService.getAlertsSummary(dateRange.start, dateRange.end)
        ]);
        
        if (!mounted) return;
        setSummary(sumRes);
        setTrends(trendsRes);
        setAlerts(alertsRes);
      } catch (err) {
        if (mounted) setError('Error al cargar datos analíticos.');
      } finally {
        if (mounted) setLoading(false);
      }
    };

    loadAnalytics();
    return () => { mounted = false; };
  }, [dateRange, period]);

  const handleApplyCustomRange = () => {
    if (customStart && customEnd) {
      setPeriod('custom');
      setShowCustomPicker(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* ── Period Selector ── */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-dark-textSecondary mr-2">
          Período:
        </span>
        {(['7d', '30d', '90d', '1y'] as AnalyticsPeriod[]).map((p) => (
          <button
            key={p}
            onClick={() => { setPeriod(p); setShowCustomPicker(false); }}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
              period === p
                ? 'bg-dark-accent text-dark-primary'
                : 'bg-dark-hover text-dark-textSecondary hover:bg-dark-border hover:text-dark-text'
            }`}
          >
            {PERIOD_LABELS[p]}
          </button>
        ))}
        <button
          onClick={() => setShowCustomPicker(!showCustomPicker)}
          className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
            period === 'custom' || showCustomPicker
              ? 'bg-dark-accent text-dark-primary'
              : 'bg-dark-hover text-dark-textSecondary hover:bg-dark-border hover:text-dark-text'
          }`}
        >
          Personalizado
        </button>
      </div>

      {/* ── Custom Date Picker ── */}
      {showCustomPicker && (
        <div className="flex flex-wrap items-end gap-3 rounded-xl border border-dark-border bg-dark-surface p-4">
          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-dark-textSecondary">
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
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-dark-textSecondary">
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

      {/* ── Error ── */}
      {error && (
        <div className="rounded-xl border border-dark-danger/30 bg-dark-danger/5 p-4 text-sm text-dark-danger">
          {error}
        </div>
      )}

      {/* ── Loading Overlay Wrapper ── */}
      <div className="relative min-h-[400px]">
        {loading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-dark-primary/60 backdrop-blur-sm">
            <div className="flex flex-col items-center gap-3">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-dark-accent border-t-transparent" />
              <p className="text-sm font-medium text-dark-text">Actualizando datos...</p>
            </div>
          </div>
        )}

        {/* ── KPI Cards ── */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-6">
          <div className="rounded-xl border border-dark-border bg-dark-surface p-5 transition-shadow hover:shadow-lg">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-dark-textSecondary">Fisuras Registradas</p>
            <p className="mt-2 text-3xl font-bold text-dark-text">{summary?.totalCracks || 0}</p>
          </div>
          <div className="rounded-xl border border-dark-border bg-dark-surface p-5 transition-shadow hover:shadow-lg">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-dark-textSecondary">Alertas Activas</p>
            <p className={`mt-2 text-3xl font-bold ${(summary?.activeAlerts || 0) > 0 ? 'text-dark-danger' : 'text-dark-accent'}`}>
              {summary?.activeAlerts || 0}
            </p>
          </div>
          <div className="rounded-xl border border-dark-border bg-dark-surface p-5 transition-shadow hover:shadow-lg">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-dark-textSecondary">Ancho Promedio</p>
            <p className="mt-2 text-3xl font-bold text-dark-text">{summary?.avgWidthPx.toFixed(2) || '0.00'} mm</p>
          </div>
          <div className="rounded-xl border border-dark-border bg-dark-surface p-5 transition-shadow hover:shadow-lg">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-dark-textSecondary">Crecimiento Máximo</p>
            <p className={`mt-2 text-3xl font-bold ${(summary?.maxGrowthPercent || 0) > 5 ? 'text-dark-danger' : 'text-dark-warning'}`}>
              {summary?.maxGrowthPercent.toFixed(1) || '0.0'}%
            </p>
          </div>
        </div>

        {/* ── Charts ── */}
        <div className="grid gap-6 lg:grid-cols-3">
          
          {/* Trend Chart */}
          <div className="lg:col-span-2 rounded-xl border border-dark-border bg-dark-surface p-5">
            <h2 className="mb-6 text-sm font-semibold text-dark-text uppercase tracking-wider">
              Evolución de Ancho Promedio
            </h2>
            <div className="h-64">
              {trends.length === 0 ? (
                <div className="flex h-full items-center justify-center rounded-lg border border-dashed border-dark-border">
                  <p className="text-sm text-dark-textSecondary">No hay datos de medición para este período</p>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={trends} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorWidth" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#00d4aa" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#00d4aa" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} vertical={false} />
                    <XAxis 
                      dataKey="date" 
                      stroke={AXIS_STROKE} 
                      tick={TICK_FONT} 
                      tickFormatter={(val) => {
                        const d = new Date(val);
                        return `${d.getDate()}/${d.getMonth()+1}`;
                      }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis stroke={AXIS_STROKE} tick={TICK_FONT} axisLine={false} tickLine={false} />
                    <Tooltip content={<TrendTooltip />} />
                    <Area 
                      type="monotone" 
                      dataKey="avgWidthPx" 
                      stroke="#00d4aa" 
                      strokeWidth={3}
                      fillOpacity={1} 
                      fill="url(#colorWidth)" 
                    />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          {/* Alert Distribution Chart */}
          <div className="rounded-xl border border-dark-border bg-dark-surface p-5">
            <h2 className="mb-6 text-sm font-semibold text-dark-text uppercase tracking-wider">
              Distribución de Alertas
            </h2>
            <div className="h-64">
              {alerts.length === 0 ? (
                <div className="flex h-full items-center justify-center rounded-lg border border-dashed border-dark-border">
                  <p className="text-sm text-dark-textSecondary">Sin alertas activas</p>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={alerts} layout="vertical" margin={{ top: 0, right: 20, left: 10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} horizontal={false} />
                    <XAxis type="number" stroke={AXIS_STROKE} tick={TICK_FONT} axisLine={false} tickLine={false} />
                    <YAxis dataKey="tipo" type="category" stroke={AXIS_STROKE} tick={TICK_FONT} axisLine={false} tickLine={false} width={80} />
                    <Tooltip cursor={{fill: 'rgba(255,255,255,0.05)'}} content={<RiskTooltip />} />
                    <Bar dataKey="count" radius={[0, 4, 4, 0]} barSize={24}>
                      {alerts.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={ALERT_COLORS[entry.tipo] || '#3b82f6'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
          
        </div>
      </div>
    </div>
  );
}

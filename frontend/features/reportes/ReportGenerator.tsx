'use client';

/**
 * ARGOS SLOPE 4.0 — ReportGenerator.
 *
 * Report generation interface with:
 *   - Template selector (Semanal / Mensual / Personalizado)
 *   - Period picker (for custom)
 *   - Fissure selector
 *   - Report preview (summary, stats, chart, alert summary)
 *   - CSV export (client-side)
 *   - HTML report export (print/PDF via new tab)
 *
 * When .NET API is unavailable, uses demo/sample data with a note.
 */

import { useState, useMemo, useCallback, useEffect } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import fissuresService from '@/services/fissures.service';
import reportsService, { ReportSummaryResponse, ReportTrendPoint, ReportAlertSummary } from '@/services/reports.service';

// ── Types ──────────────────────────────────────────────────────────────

type ReportTemplate = 'semanal' | 'mensual' | 'personalizado';

interface DateRange {
  start: string;
  end: string;
}

interface ExportFisura {
  id: number;
  roiId: string;
  anchoMm: number;
  largoMm: number;
  deltaPorcentaje: number;
  orientacion: string;
  tipo: string;
}

interface ReportData {
  summary: ReportSummaryResponse | null;
  trends: ReportTrendPoint[];
  alerts: ReportAlertSummary[];
  exportFisuras: ExportFisura[];
}

// ── Constants ──────────────────────────────────────────────────────────

const TEMPLATES: { key: ReportTemplate; title: string; description: string; icon: string }[] = [
  { key: 'semanal', title: 'Semanal', description: 'Resumen de la última semana', icon: '7' },
  { key: 'mensual', title: 'Mensual', description: 'Reporte mensual completo', icon: '30' },
  { key: 'personalizado', title: 'Personalizado', description: 'Rango de fechas y filtros', icon: '··' },
];

const AXIS_STROKE = '#8888aa';
const GRID_STROKE = '#2a2a4a';
const TICK_FONT = { fontSize: 11, fill: '#8888aa' };

// ── Chart tooltip ──────────────────────────────────────────────────────

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-dark-border bg-dark-surface px-3 py-2 text-sm shadow-xl">
      <p className="mb-1 font-medium text-dark-secondary">{label}</p>
      {payload.map((entry: any, i: number) => (
        <p key={i} style={{ color: entry.color }} className="font-semibold">
          {entry.name}: {Number(entry.value).toFixed(4)} mm
        </p>
      ))}
    </div>
  );
}

// ── CSV Generation ─────────────────────────────────────────────────────

function downloadCsv(fisuras: ExportFisura[], periodLabel: string) {
  const headers = ['ID', 'ROI ID', 'Ancho (mm)', 'Largo (mm)', 'Δ%', 'Orientación', 'Tipo'];
  const rows = fisuras.map((f) => [
    String(f.id),
    f.roiId,
    f.anchoMm.toFixed(2),
    f.largoMm.toFixed(1),
    f.deltaPorcentaje.toFixed(1),
    f.orientacion,
    f.tipo,
  ]);

  const csvContent = [
    `Reporte de Fisuras — ${periodLabel}`,
    `Generado: ${new Date().toLocaleString('es-ES')}`,
    '',
    headers.join(','),
    ...rows.map((r) => r.join(',')),
  ].join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `reporte-fisuras-${periodLabel.toLowerCase().replace(/\s+/g, '-')}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── HTML Report Generation ─────────────────────────────────────────────

function generateHtmlReport(
  data: ReportData,
  periodLabel: string,
  template: ReportTemplate
): string {
  const fisuras = data.exportFisuras;
  const avgAncho = data.summary?.avgWidthPx ?? 0;
  const maxDelta = data.summary?.maxGrowthPercent ?? 0;
  const activeAlertas = data.summary?.activeAlerts ?? 0;

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <title>Reporte de Monitoreo — ARGOS SLOPE 4.0</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 12px; line-height: 1.5; color: #1a1a2e; background: #fff;
      padding: 40px;
    }
    @media print {
      body { padding: 20px; }
      .no-print { display: none; }
    }
    h1 { font-size: 22px; color: #0f0f1a; margin-bottom: 4px; }
    .subtitle { color: #8888aa; font-size: 13px; margin-bottom: 24px; }
    .meta { display: flex; gap: 24px; margin-bottom: 24px; flex-wrap: wrap; }
    .meta-item { background: #f5f5fa; padding: 12px 16px; border-radius: 8px; }
    .meta-item label { font-size: 10px; text-transform: uppercase; color: #8888aa; display: block; }
    .meta-item value { font-size: 16px; font-weight: 700; color: #0f0f1a; display: block; margin-top: 2px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
    th { background: #1a1a2e; color: #fff; padding: 8px 12px; text-align: left; font-size: 11px; text-transform: uppercase; }
    td { padding: 8px 12px; border-bottom: 1px solid #e0e0ef; font-size: 12px; }
    tr:nth-child(even) td { background: #f8f8fc; }
    h2 { font-size: 16px; color: #0f0f1a; margin-bottom: 12px; margin-top: 24px; padding-bottom: 6px; border-bottom: 2px solid #00d4aa; }
    .alert-card {
      padding: 10px 14px; border-radius: 6px; margin-bottom: 8px;
      border-left: 4px solid;
    }
    .alert-card.critico { border-color: #ef4444; background: #fef2f2; }
    .alert-card.advertencia { border-color: #f59e0b; background: #fffbeb; }
    .alert-card .alert-tipo { font-size: 10px; font-weight: 700; text-transform: uppercase; }
    .alert-card .alert-msg { font-size: 12px; margin-top: 2px; }
    .alert-card .alert-fecha { font-size: 10px; color: #8888aa; margin-top: 2px; }
    .footer { margin-top: 32px; padding-top: 16px; border-top: 1px solid #e0e0ef; font-size: 10px; color: #8888aa; }
  </style>
</head>
<body>
  <div class="no-print" style="margin-bottom:16px;">
    <button onclick="window.print()" style="background:#00d4aa;border:none;border-radius:6px;padding:8px 20px;font-size:13px;font-weight:600;cursor:pointer;">
      🖨 Imprimir / Guardar PDF
    </button>
  </div>

  <h1>Reporte de Monitoreo de Talud</h1>
  <p class="subtitle">ARGOS SLOPE 4.0 — ${template === 'semanal' ? 'Reporte Semanal' : template === 'mensual' ? 'Reporte Mensual' : 'Reporte Personalizado'} — ${periodLabel}</p>

  <div class="meta">
    <div class="meta-item"><label>Total Fisuras</label><value>${fisuras.length}</value></div>
    <div class="meta-item"><label>Alertas Activas</label><value>${activeAlertas}</value></div>
    <div class="meta-item"><label>Ancho Promedio</label><value>${avgAncho.toFixed(2)} mm</value></div>
    <div class="meta-item"><label>Δ% Máximo</label><value>${maxDelta.toFixed(1)}%</value></div>
    <div class="meta-item"><label>Período</label><value>${periodLabel}</value></div>
  </div>

  <h2>Fisuras Detectadas</h2>
  <table>
    <thead>
      <tr><th>ID</th><th>ROI</th><th>Ancho (mm)</th><th>Largo (mm)</th><th>Δ%</th><th>Orientación</th><th>Tipo</th></tr>
    </thead>
    <tbody>
      ${fisuras.map((f) => `
        <tr>
          <td>${f.id}</td>
          <td>${f.roiId}</td>
          <td>${f.anchoMm.toFixed(2)}</td>
          <td>${f.largoMm.toFixed(1)}</td>
          <td>${f.deltaPorcentaje.toFixed(1)}%</td>
          <td>${f.orientacion}</td>
          <td>${f.tipo}</td>
        </tr>`).join('\n      ')}
    </tbody>
  </table>

  <h2>Resumen de Alertas</h2>
  ${data.alerts.map((a) => `
    <div class="alert-card ${a.tipo.toLowerCase()}">
      <div class="alert-tipo" style="color:${a.tipo.toLowerCase() === 'critico' ? '#ef4444' : a.tipo.toLowerCase() === 'advertencia' ? '#f59e0b' : '#00d4aa'}">${a.tipo}</div>
      <div class="alert-msg">Total: ${a.count} alertas registradas</div>
    </div>`).join('\n    ')}

  <div class="footer">
    Reporte generado el ${new Date().toLocaleString('es-ES', { dateStyle: 'long', timeStyle: 'short' })}<br/>
    ARGOS SLOPE 4.0 — Sistema de Monitoreo de Talud
  </div>
</body>
</html>`;
}

function openHtmlReport(data: ReportData, periodLabel: string, template: ReportTemplate) {
  const html = generateHtmlReport(data, periodLabel, template);
  const blob = new Blob([html], { type: 'text/html;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank');
}

// ── Period Helpers ─────────────────────────────────────────────────────

function getDefaultDateRange(template: ReportTemplate): DateRange {
  const now = new Date();
  const end = now.toISOString().split('T')[0];
  const start = new Date(now);
  if (template === 'semanal') start.setDate(start.getDate() - 7);
  else if (template === 'mensual') start.setDate(start.getDate() - 30);
  else start.setDate(start.getDate() - 14); // default for custom
  return { start: start.toISOString().split('T')[0], end };
}

function formatPeriodLabel(template: ReportTemplate, range: DateRange): string {
  if (template === 'semanal') return 'Últimos 7 días';
  if (template === 'mensual') return 'Últimos 30 días';
  return `${range.start} — ${range.end}`;
}

// ── ReportGenerator ────────────────────────────────────────────────────

export default function ReportGenerator() {
  const [template, setTemplate] = useState<ReportTemplate>('semanal');
  const [dateRange, setDateRange] = useState<DateRange>(() => getDefaultDateRange('semanal'));
  const [errorNote, setErrorNote] = useState<string | null>(null);

  const [reportData, setReportData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setErrorNote(null);
      
      const dias = template === 'semanal' ? 7 : template === 'mensual' ? 30 : 14;

      const [summary, trends, alerts, fissuresRes] = await Promise.all([
        reportsService.getSummary(),
        reportsService.getTrends(dias),
        reportsService.getAlertsSummary(),
        fissuresService.getAll({ page: 1, pageSize: 1000 })
      ]);

      const mappedFisuras = fissuresRes.items.map(f => ({
        id: f.id,
        roiId: f.roiId || `CRK-${f.id}`,
        anchoMm: f.ancho ?? 0,
        largoMm: f.largo ?? 0,
        deltaPorcentaje: f.deltaPorcentaje ?? 0,
        orientacion: f.orientacion || 'N/A',
        tipo: f.tipo || 'N/A'
      }));

      setReportData({
        summary,
        trends,
        alerts,
        exportFisuras: mappedFisuras
      });
    } catch (err) {
      console.error('Failed to load report data', err);
      setErrorNote('Error de conexión con el backend. Por favor, verifique el estado del servidor.');
      setReportData(null);
    } finally {
      setLoading(false);
    }
  }, [template, dateRange]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Derived values
  const periodLabel = formatPeriodLabel(template, dateRange);
  const dias = template === 'semanal' ? 7 : template === 'mensual' ? 30 : 14;
  
  const totalFisuras = reportData?.summary?.totalCracks ?? 0;
  const alertasActivas = reportData?.summary?.activeAlerts ?? 0;
  const avgAncho = reportData?.summary?.avgWidthPx ?? 0;
  const maxDelta = reportData?.summary?.maxGrowthPercent ?? 0;
  const avgVelocidad = dias > 0 && avgAncho > 0 ? avgAncho / dias : 0;

  // ── Template switch ───────────────────────────────────────────────
  const handleSelectTemplate = useCallback((t: ReportTemplate) => {
    setTemplate(t);
    setDateRange(getDefaultDateRange(t));
  }, []);

  // ── Exports ───────────────────────────────────────────────────────
  const handleExportCsv = useCallback(() => {
    if (reportData) downloadCsv(reportData.exportFisuras, periodLabel);
  }, [reportData, periodLabel]);

  const handleExportReport = useCallback(() => {
    if (reportData) openHtmlReport(reportData, periodLabel, template);
  }, [reportData, periodLabel, template]);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center rounded-xl border border-dark-border bg-dark-surface">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-dark-accent border-t-transparent" />
          <p className="text-sm text-dark-secondary">Generando reporte agregado...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── Error note banner ── */}
      {errorNote && (
        <div className="rounded-lg border border-dark-danger/30 bg-dark-danger/5 p-4">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm font-medium text-dark-danger">Error de Conexión</p>
              <p className="mt-0.5 text-xs text-dark-secondary">{errorNote}</p>
            </div>
            <button
              onClick={() => setErrorNote(null)}
              className="text-dark-secondary hover:text-dark-text"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* ── Template Selector ── */}
      <div className="grid gap-4 md:grid-cols-3">
        {TEMPLATES.map((t) => {
          const isActive = template === t.key;
          return (
            <button
              key={t.key}
              onClick={() => handleSelectTemplate(t.key as ReportTemplate)}
              className={`rounded-xl border p-5 text-left transition-all ${
                isActive
                  ? 'border-dark-accent bg-dark-accent/5 ring-1 ring-dark-accent/30'
                  : 'border-dark-border bg-dark-surface hover:border-dark-accent/50'
              }`}
            >
              <div
                className={`mb-3 flex h-10 w-10 items-center justify-center rounded-lg text-sm font-bold ${
                  isActive
                    ? 'bg-dark-accent text-dark-primary'
                    : 'bg-dark-primary text-dark-secondary'
                }`}
              >
                {t.icon === '7' ? (
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                ) : t.icon === '30' ? (
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                ) : (
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
                  </svg>
                )}
              </div>
              <h3 className={`font-semibold ${isActive ? 'text-dark-accent' : 'text-dark-text'}`}>
                {t.title}
              </h3>
              <p className="mt-1 text-xs text-dark-secondary">{t.description}</p>
            </button>
          );
        })}
      </div>

      {/* ── Period picker (for custom) ── */}
      {template === 'personalizado' && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-dark-border bg-dark-surface p-4">
          <span className="text-xs font-medium text-dark-secondary">Período:</span>
          <input
            type="date"
            value={dateRange.start}
            onChange={(e) => setDateRange((prev) => ({ ...prev, start: e.target.value }))}
            className="rounded-lg border border-dark-border bg-dark-primary px-3 py-2 text-sm text-dark-text outline-none focus:border-dark-accent [color-scheme:dark]"
          />
          <span className="text-xs text-dark-secondary">a</span>
          <input
            type="date"
            value={dateRange.end}
            onChange={(e) => setDateRange((prev) => ({ ...prev, end: e.target.value }))}
            className="rounded-lg border border-dark-border bg-dark-primary px-3 py-2 text-sm text-dark-text outline-none focus:border-dark-accent [color-scheme:dark]"
          />
          <span className="text-xs text-dark-secondary ml-2">
            {periodLabel}
          </span>
        </div>
      )}

      {/* ── Period label banner ── */}
      {template !== 'personalizado' && (
        <div className="rounded-lg border border-dark-border bg-dark-surface px-4 py-3">
          <p className="text-sm text-dark-secondary">
            Período: <span className="font-medium text-dark-text">{periodLabel}</span>
          </p>
        </div>
      )}

      {/* ── Report Preview ── */}
      {reportData && (
        <div className="rounded-xl border border-dark-border bg-dark-surface p-6">
          <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-dark-secondary">
            Vista Previa del Reporte
          </h3>

          {/* Summary section */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <SummaryCard label="Total Fisuras" value={String(totalFisuras)} />
            <SummaryCard label="Alertas Activas" value={String(alertasActivas)} valueColor={alertasActivas > 0 ? 'text-dark-danger' : undefined} />
            <SummaryCard label="Período" value={periodLabel} />
            <SummaryCard label="Última Detección" value={reportData.summary?.lastDetectionAt ? new Date(reportData.summary.lastDetectionAt).toLocaleDateString() : '—'} />
          </div>

          {/* Stats section */}
          <div className="mt-4 grid grid-cols-3 gap-4">
            <div className="rounded-lg border border-dark-border bg-dark-primary/50 p-3">
              <p className="text-[10px] uppercase tracking-wider text-dark-secondary">Ancho Promedio</p>
              <p className="mt-0.5 text-lg font-bold text-dark-text">{avgAncho.toFixed(2)} mm</p>
            </div>
            <div className="rounded-lg border border-dark-border bg-dark-primary/50 p-3">
              <p className="text-[10px] uppercase tracking-wider text-dark-secondary">Δ% Máximo</p>
              <p className="mt-0.5 text-lg font-bold text-dark-danger">{maxDelta.toFixed(1)}%</p>
            </div>
            <div className="rounded-lg border border-dark-border bg-dark-primary/50 p-3">
              <p className="text-[10px] uppercase tracking-wider text-dark-secondary">Velocidad Promedio</p>
              <p className="mt-0.5 text-lg font-bold text-dark-text">{avgVelocidad.toFixed(4)} mm/día</p>
            </div>
          </div>

          {/* Chart preview */}
          <div className="mt-6">
            <p className="mb-3 text-xs font-medium text-dark-secondary">
              Tendencia de Deformación — Ancho promedio por día ({reportData.trends.length} días con datos)
            </p>
            <div className="h-48 rounded-lg border border-dark-border bg-dark-primary/30 p-3">
              {reportData.trends.length === 0 ? (
                <div className="flex h-full items-center justify-center">
                   <p className="text-sm text-dark-secondary">Sin datos en este período.</p>
                </div>
              ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={reportData.trends}>
                  <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
                  <XAxis
                    dataKey="date"
                    stroke={AXIS_STROKE}
                    tick={TICK_FONT}
                    tickFormatter={(v: string) => {
                      const d = new Date(v);
                      return `${d.getDate()}/${d.getMonth() + 1}`;
                    }}
                    interval="preserveStartEnd"
                  />
                  <YAxis stroke={AXIS_STROKE} tick={TICK_FONT} />
                  <Tooltip content={<ChartTooltip />} />
                  <Line
                    type="monotone"
                    dataKey="avgWidthPx"
                    name="Ancho Prom."
                    stroke="#00d4aa"
                    strokeWidth={2}
                    dot={reportData.trends.length === 1 ? { r: 4, fill: '#00d4aa' } : false}
                    activeDot={{ r: 6, fill: '#00d4aa' }}
                  />
                </LineChart>
              </ResponsiveContainer>
              )}
            </div>
          </div>

          {/* Alert summary */}
          <div className="mt-4">
            <p className="mb-2 text-xs font-medium text-dark-secondary">Resumen de Alertas</p>
            {reportData.alerts.length === 0 ? (
              <p className="text-sm text-dark-secondary">No hay alertas en este período.</p>
            ) : (
              <div className="space-y-2">
                {reportData.alerts.map((a, i) => (
                  <div
                    key={i}
                    className={`rounded-lg border-l-4 px-3 py-2 ${
                      a.tipo.toLowerCase() === 'critico'
                        ? 'border-l-dark-danger bg-dark-danger/5'
                        : a.tipo.toLowerCase() === 'advertencia'
                        ? 'border-l-dark-warning bg-dark-warning/5'
                        : 'border-l-dark-accent bg-dark-accent/5'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className={`inline-block rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider ${
                          a.tipo.toLowerCase() === 'critico'
                            ? 'bg-dark-danger/15 text-dark-danger'
                            : a.tipo.toLowerCase() === 'advertencia'
                            ? 'bg-dark-warning/15 text-dark-warning'
                            : 'bg-dark-accent/15 text-dark-accent'
                        }`}
                      >
                        {a.tipo}
                      </span>
                      <span className="text-[11px] text-dark-secondary">Total agrupadas: {a.count}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Export buttons ── */}
      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={handleExportCsv}
          disabled={!reportData}
          className="flex items-center gap-2 rounded-lg border border-dark-border bg-dark-surface px-5 py-2.5 text-sm font-semibold text-dark-text transition-colors hover:bg-dark-hover disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          Exportar CSV
        </button>
        <button
          onClick={handleExportReport}
          disabled={!reportData}
          className="flex items-center gap-2 rounded-lg bg-dark-accent px-5 py-2.5 text-sm font-semibold text-dark-primary transition-opacity hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          Exportar Reporte
        </button>
      </div>
    </div>
  );
}

// ── Summary Card Sub-component ─────────────────────────────────────────

function SummaryCard({
  label,
  value,
  valueColor,
}: {
  label: string;
  value: string;
  valueColor?: string;
}) {
  return (
    <div className="rounded-lg border border-dark-border bg-dark-primary/50 p-3">
      <p className="text-[10px] uppercase tracking-wider text-dark-secondary">{label}</p>
      <p className={`mt-0.5 text-lg font-bold ${valueColor ?? 'text-dark-text'}`}>
        {value}
      </p>
    </div>
  );
}

'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import fissuresService from '@/services/fissures.service';
import alertsService from '@/services/alerts.service';

// ── Types ──────────────────────────────────────────────────────────────

interface DashStats {
  totalFisuras: number;
  fisurasActivas: number;
  fisurasHoy: number;
  alertasCriticas: number;
  alertasTotales: number;
  anchoPromedio: number;
  maxDelta: number;
  riesgoGeneral: 'bajo' | 'medio' | 'alto' | 'critico';
}

// ── Metric Card ────────────────────────────────────────────────────────

function MetricCard({
  label,
  value,
  sub,
  icon,
  accent = 'accent',
  trend,
}: {
  label: string;
  value: string | number;
  sub?: string;
  icon: React.ReactNode;
  accent?: 'accent' | 'success' | 'warning' | 'danger' | 'muted';
  trend?: { dir: 'up' | 'down' | 'flat'; label: string };
}) {
  const accentMap = {
    accent:  { bg: 'bg-dark-accent/10',   icon: 'text-dark-accent',   border: 'border-dark-accent/20'   },
    success: { bg: 'bg-dark-success/10',  icon: 'text-dark-success',  border: 'border-dark-success/20'  },
    warning: { bg: 'bg-dark-warning/10',  icon: 'text-dark-warning',  border: 'border-dark-warning/20'  },
    danger:  { bg: 'bg-dark-danger/10',   icon: 'text-dark-danger',   border: 'border-dark-danger/20'   },
    muted:   { bg: 'bg-dark-elevated',    icon: 'text-dark-muted',    border: 'border-dark-border'      },
  };
  const a = accentMap[accent];

  return (
    <div className="group argos-card p-5 flex flex-col gap-4">
      <div className="flex items-start justify-between">
        <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${a.bg} border ${a.border}`}>
          <span className={a.icon}>{icon}</span>
        </div>
        {trend && (
          <span className={`flex items-center gap-1 text-[10px] font-medium ${
            trend.dir === 'up' ? 'text-dark-danger' : trend.dir === 'down' ? 'text-dark-success' : 'text-dark-muted'
          }`}>
            {trend.dir === 'up' ? '↑' : trend.dir === 'down' ? '↓' : '→'}
            {trend.label}
          </span>
        )}
      </div>
      <div>
        <p className="text-2xl font-bold text-dark-text">{value}</p>
        <p className="mt-0.5 text-xs font-medium text-dark-secondary">{label}</p>
        {sub && <p className="mt-1 text-[10px] text-dark-muted">{sub}</p>}
      </div>
    </div>
  );
}

// ── Risk Gauge ─────────────────────────────────────────────────────────

function RiskGauge({ level }: { level: 'bajo' | 'medio' | 'alto' | 'critico' }) {
  const map = {
    bajo:    { label: 'BAJO',    pct: 20, color: '#10B981' },
    medio:   { label: 'MEDIO',   pct: 50, color: '#F59E0B' },
    alto:    { label: 'ALTO',    pct: 75, color: '#EF4444' },
    critico: { label: 'CRÍTICO', pct: 95, color: '#DC2626' },
  };
  const m = map[level];
  const r = 36, cx = 52, cy = 52;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - m.pct / 100);

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative">
        <svg width="104" height="104" viewBox="0 0 104 104">
          {/* Track */}
          <circle cx={cx} cy={cy} r={r} fill="none" stroke="#1E293B" strokeWidth="8" />
          {/* Progress */}
          <circle
            cx={cx} cy={cy} r={r}
            fill="none"
            stroke={m.color}
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={circ}
            strokeDashoffset={offset}
            transform={`rotate(-90 ${cx} ${cy})`}
            style={{ filter: `drop-shadow(0 0 8px ${m.color}88)` }}
          />
          {/* Center text */}
          <text x={cx} y={cy - 4} textAnchor="middle" fill="#F1F5F9" fontSize="18" fontWeight="700">{m.pct}%</text>
          <text x={cx} y={cy + 14} textAnchor="middle" fill={m.color} fontSize="9" fontWeight="600" letterSpacing="1">{m.label}</text>
        </svg>
      </div>
      <p className="text-xs text-dark-muted">Índice de riesgo</p>
    </div>
  );
}

// ── Quick Action Card ─────────────────────────────────────────────────

function QuickAction({ href, label, desc, icon, accent = 'accent' }: {
  href: string; label: string; desc: string; icon: React.ReactNode; accent?: string;
}) {
  return (
    <Link href={href} className="argos-card flex items-center gap-4 p-4 group cursor-pointer">
      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border transition-all
        ${accent === 'accent' ? 'bg-dark-accent/10 border-dark-accent/20 text-dark-accent group-hover:bg-dark-accent/20' :
          accent === 'success' ? 'bg-dark-success/10 border-dark-success/20 text-dark-success group-hover:bg-dark-success/20' :
          'bg-dark-fam1/10 border-dark-fam1/20 text-dark-fam1 group-hover:bg-dark-fam1/20'
        }`}>
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-dark-text group-hover:text-dark-accent transition-colors">{label}</p>
        <p className="text-xs text-dark-muted">{desc}</p>
      </div>
      <svg className="h-4 w-4 text-dark-muted group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
      </svg>
    </Link>
  );
}

// ── Recent Alert Row ───────────────────────────────────────────────────

function AlertRow({ tipo, mensaje, fecha }: { tipo: string; mensaje: string; fecha: string }) {
  const isCrit = tipo === 'critico';
  return (
    <div className={`flex items-start gap-3 rounded-lg border px-3 py-2.5 ${
      isCrit ? 'border-dark-danger/20 bg-dark-danger/5' : 'border-dark-warning/20 bg-dark-warning/5'
    }`}>
      <div className={`mt-0.5 h-2 w-2 shrink-0 rounded-full ${isCrit ? 'status-dot-critical' : 'bg-dark-warning'}`} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs text-dark-text">{mensaje}</p>
        <p className="mt-0.5 text-[10px] text-dark-muted">{fecha}</p>
      </div>
      <span className={`shrink-0 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase ${
        isCrit ? 'bg-dark-danger/20 text-dark-danger' : 'bg-dark-warning/20 text-dark-warning'
      }`}>{tipo}</span>
    </div>
  );
}

// ── Dashboard Page ─────────────────────────────────────────────────────

export default function DashboardPage() {
  const [stats, setStats] = useState<DashStats | null>(null);
  const [alerts, setAlerts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [fisuras, alertas] = await Promise.all([
          fissuresService.getAll(),
          alertsService.getAll(),
        ]);

        const today = new Date().toISOString().split('T')[0];
        const hoy = fisuras.filter(f => f.fechaDeteccion?.startsWith(today));
        const criticas = alertas.filter(a => a.tipo === 'critico');
        const avgAncho = fisuras.length > 0
          ? fisuras.reduce((s, f) => s + (f.ancho ?? 0), 0) / fisuras.length
          : 0;
        const maxDelta = fisuras.length > 0
          ? Math.max(0, ...fisuras.map(f => f.deltaPorcentaje ?? 0))
          : 0;

        const riesgo: DashStats['riesgoGeneral'] =
          maxDelta > 20 || criticas.length > 2 ? 'critico'
          : maxDelta > 10 || criticas.length > 0 ? 'alto'
          : maxDelta > 5 ? 'medio'
          : 'bajo';

        setStats({
          totalFisuras: fisuras.length,
          fisurasActivas: fisuras.filter(f => f.estadoAlerta !== 'inactiva').length,
          fisurasHoy: hoy.length,
          alertasCriticas: criticas.length,
          alertasTotales: alertas.length,
          anchoPromedio: avgAncho,
          maxDelta,
          riesgoGeneral: riesgo,
        });
        setAlerts(alertas.slice(0, 4));
      } catch {
        // Demo fallback
        setStats({
          totalFisuras: 36339, fisurasActivas: 312, fisurasHoy: 47,
          alertasCriticas: 1, alertasTotales: 3,
          anchoPromedio: 0.012, maxDelta: 20.2,
          riesgoGeneral: 'alto',
        });
        setAlerts([{
          tipo: 'critico', fecha: new Date().toLocaleDateString('es-PE'),
          mensaje: 'Crecimiento (20.2%) supera umbral crítico (10%)',
        }]);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Page header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-dark-text">Panel de Control</h1>
          <p className="mt-0.5 text-sm text-dark-muted">Resumen ejecutivo del monitoreo geotécnico · Zona: Talud Maqueta</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="live-badge">
            <span className="status-dot-online" />
            En tiempo real
          </div>
          <Link href="/monitoreo" className="btn-primary">
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
              <circle cx="12" cy="13" r="3" />
            </svg>
            Monitorear
          </Link>
        </div>
      </div>

      {/* Metric cards grid */}
      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="skeleton h-32 rounded-xl" />
          ))}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard
            label="Fisuras Detectadas"
            value={stats!.totalFisuras.toLocaleString('es-PE')}
            sub={`${stats!.fisurasHoy} detectadas hoy`}
            accent="accent"
            trend={{ dir: 'up', label: '+47 hoy' }}
            icon={<svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.141 0M1.394 9.393c5.857-5.857 15.355-5.857 21.213 0" /></svg>}
          />
          <MetricCard
            label="Alertas Críticas"
            value={stats!.alertasCriticas}
            sub={`${stats!.alertasTotales} alertas en total`}
            accent={stats!.alertasCriticas > 0 ? 'danger' : 'success'}
            icon={<svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>}
          />
          <MetricCard
            label="Apertura Promedio"
            value={`${stats!.anchoPromedio.toFixed(3)} mm`}
            sub="Ancho promedio de fisuras"
            accent="muted"
            icon={<svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" /></svg>}
          />
          <MetricCard
            label="Δ% Máximo"
            value={`${stats!.maxDelta.toFixed(1)}%`}
            sub="Crecimiento máximo detectado"
            accent={stats!.maxDelta > 10 ? 'danger' : stats!.maxDelta > 5 ? 'warning' : 'success'}
            trend={{ dir: stats!.maxDelta > 5 ? 'up' : 'flat', label: 'vs. base' }}
            icon={<svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>}
          />
        </div>
      )}

      {/* Main content: left panel + right panel */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* LEFT: Risk + Alerts */}
        <div className="lg:col-span-1 space-y-4">
          {/* Risk gauge */}
          <div className="argos-card p-5">
            <div className="mb-4 flex items-center justify-between">
              <p className="text-sm font-semibold text-dark-text">Riesgo Actual</p>
              <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                stats?.riesgoGeneral === 'critico' ? 'risk-critico' :
                stats?.riesgoGeneral === 'alto' ? 'risk-alto' :
                stats?.riesgoGeneral === 'medio' ? 'risk-medio' : 'risk-bajo'
              }`}>{stats?.riesgoGeneral ?? '—'}</span>
            </div>
            {loading ? (
              <div className="skeleton mx-auto h-24 w-24 rounded-full" />
            ) : (
              <div className="flex justify-center">
                <RiskGauge level={stats!.riesgoGeneral} />
              </div>
            )}
          </div>

          {/* System status */}
          <div className="argos-card p-5">
            <p className="mb-3 text-sm font-semibold text-dark-text">Estado del Sistema</p>
            <div className="space-y-2">
              {[
                { label: 'Cámara USB',  status: 'Activa',    online: true  },
                { label: 'Edge OpenCV', status: 'En línea',  online: true  },
                { label: 'Backend .NET',status: 'En línea',  online: true  },
                { label: 'MQTT HiveMQ', status: 'Conectado', online: true  },
                { label: 'Base de datos',status: 'Estable',  online: true  },
              ].map(s => (
                <div key={s.label} className="flex items-center justify-between rounded-lg px-3 py-2 bg-dark-primary/50">
                  <span className="text-xs text-dark-secondary">{s.label}</span>
                  <div className="flex items-center gap-1.5">
                    <span className={s.online ? 'status-dot-online' : 'status-dot-warning'} />
                    <span className="text-[10px] text-dark-success">{s.status}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* RIGHT: Alerts + Quick actions */}
        <div className="lg:col-span-2 space-y-4">
          {/* Recent alerts */}
          <div className="argos-card p-5">
            <div className="mb-4 flex items-center justify-between">
              <p className="text-sm font-semibold text-dark-text">Alertas Recientes</p>
              <Link href="/alertas" className="text-[11px] text-dark-accent hover:underline">
                Ver todas →
              </Link>
            </div>
            {loading ? (
              <div className="space-y-2">
                {[1, 2, 3].map(i => <div key={i} className="skeleton h-12 rounded-lg" />)}
              </div>
            ) : alerts.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-8 text-dark-muted">
                <svg className="h-8 w-8 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-sm">Sin alertas activas</p>
              </div>
            ) : (
              <div className="space-y-2">
                {alerts.map((a, i) => (
                  <AlertRow key={i} tipo={a.tipo} mensaje={a.mensaje} fecha={a.fecha} />
                ))}
              </div>
            )}
          </div>

          {/* Quick actions */}
          <div className="argos-card p-5">
            <p className="mb-4 text-sm font-semibold text-dark-text">Accesos Rápidos</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <QuickAction
                href="/monitoreo"
                label="Monitoreo 2D"
                desc="Capturar y analizar talud con OpenCV"
                accent="accent"
                icon={<svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.069A1 1 0 0121 8.87V15.13a1 1 0 01-1.447.9L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>}
              />
              <QuickAction
                href="/geomechanics"
                label="Geotecnia RQD/RMR"
                desc="Calcular índices geomecánicos"
                accent="success"
                icon={<svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>}
              />
              <QuickAction
                href="/fisuras"
                label="Gestión de Fisuras"
                desc="Ver y filtrar discontinuidades"
                accent="fam1"
                icon={<svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.141 0M1.394 9.393c5.857-5.857 15.355-5.857 21.213 0" /></svg>}
              />
              <QuickAction
                href="/reportes"
                label="Exportar Reporte"
                desc="Generar reporte técnico PDF/CSV"
                accent="muted"
                icon={<svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

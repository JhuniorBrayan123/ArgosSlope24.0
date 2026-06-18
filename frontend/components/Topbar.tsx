'use client';

import { usePathname } from 'next/navigation';
import { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import ThemeToggle from './ThemeToggle';

// ── Breadcrumb map ────────────────────────────────────────────────────

const ROUTE_LABELS: Record<string, string> = {
  '':              'Inicio',
  'monitoreo':     'Monitoreo 2D',
  'fisuras':       'Fisuras',
  'alertas':       'Alertas',
  'analitica':     'Analítica',
  'geomechanics':  'Geotecnia',
  'reportes':      'Reportes',
  'configuracion': 'Configuración',
  'historial':     'Historial',
};

function Breadcrumb() {
  const pathname = usePathname() || '/';
  const parts = pathname.split('/').filter(Boolean);

  return (
    <nav className="flex items-center gap-1 text-xs" aria-label="breadcrumb">
      <span className="text-dark-muted">ARGOS</span>
      {parts.map((part, i) => (
        <span key={i} className="flex items-center gap-1">
          <svg className="h-3 w-3 text-dark-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
          <span className={i === parts.length - 1 ? 'font-semibold text-dark-text' : 'text-dark-muted'}>
            {ROUTE_LABELS[part] ?? part}
          </span>
        </span>
      ))}
    </nav>
  );
}

// ── Connection status ─────────────────────────────────────────────────

function ConnectionStatus() {
  const [time, setTime] = useState('');

  useEffect(() => {
    const tick = () => {
      const now = new Date();
      setTime(now.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="hidden items-center gap-4 md:flex">
      {/* Last capture */}
      <div className="flex items-center gap-1.5 text-xs text-dark-muted">
        <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <span>{time}</span>
      </div>

      {/* System statuses */}
      {[
        { label: 'Edge',    online: true  },
        { label: 'MQTT',    online: true  },
      ].map(s => (
        <div key={s.label} className="hidden items-center gap-1.5 xl:flex">
          <span className={s.online ? 'status-dot-online' : 'status-dot-warning'} />
          <span className="text-[11px] text-dark-muted">{s.label}</span>
        </div>
      ))}
    </div>
  );
}

// ── Topbar Component ─────────────────────────────────────────────────

export default function Topbar() {
  const { user } = useAuth();
  const pathname = usePathname() || '/';
  const parts = pathname.split('/').filter(Boolean);
  const currentPage = ROUTE_LABELS[parts[parts.length - 1] ?? ''] ?? 'Inicio';

  return (
    <header className="fixed top-0 right-0 left-0 z-30 flex h-14 items-center border-b border-dark-border bg-dark-secondary/80 backdrop-blur-sm px-4 gap-4">
      {/* Left: breadcrumb */}
      <div 
        className="flex flex-1 items-center gap-3 transition-all duration-300"
        style={{ paddingLeft: 'var(--sidebar-current, 240px)' }}
      >
        <Breadcrumb />
      </div>

      {/* Center: zone label */}
      <div className="hidden lg:flex items-center gap-2">
        <div className="live-badge">
          <span className="status-dot-online animate-pulse" />
          Zona: Talud Maqueta
        </div>
      </div>

      {/* Right: status + actions */}
      <div className="flex items-center gap-3">
        <ConnectionStatus />

        {/* Quick capture button */}
        <button
          id="topbar-quick-capture"
          className="hidden items-center gap-2 rounded-lg bg-dark-accent/10 border border-dark-accent/20 px-3 py-1.5 text-xs font-semibold text-dark-accent transition-all hover:bg-dark-accent/20 md:flex"
        >
          <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
            <circle cx="12" cy="13" r="3" />
          </svg>
          Capturar
        </button>

        {/* Notifications */}
        <button
          id="topbar-notifications"
          className="relative rounded-lg p-2 text-dark-muted transition-colors hover:bg-dark-hover hover:text-dark-text"
        >
          <svg className="h-4.5 w-4.5 h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
          </svg>
          {/* Badge */}
          <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-dark-danger" />
        </button>

        {/* Theme Toggle */}
        <ThemeToggle />

        {/* Profile */}
        {user && (
          <div className="flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-dark-hover cursor-pointer">
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-dark-accent/20 text-xs font-bold text-dark-accent">
              {user.name.charAt(0)}
            </div>
            <div className="hidden flex-col md:flex">
              <span className="text-[11px] font-semibold leading-none text-dark-text">{user.name.split(' ')[0]}</span>
              <span className="mt-0.5 text-[10px] leading-none text-dark-muted">{user.role}</span>
            </div>
          </div>
        )}
      </div>
    </header>
  );
}

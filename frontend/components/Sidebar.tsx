'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useEffect, type JSX } from 'react';
import { useAuth } from '@/context/AuthContext';

// ── Icons ─────────────────────────────────────────────────────────────

const Icon = ({ d, d2 }: { d: string; d2?: string }) => (
  <svg className="h-5 w-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
    <path d={d} />
    {d2 && <path d={d2} />}
  </svg>
);

// ── Nav structure ─────────────────────────────────────────────────────

interface NavItem { href: string; label: string; icon: JSX.Element; badge?: string; }
interface NavGroup { label: string; items: NavItem[]; }

const navGroups: NavGroup[] = [
  {
    label: 'Operación',
    items: [
      { href: '/monitoreo',  label: 'Monitoreo 2D', icon: <Icon d="M15 10l4.553-2.069A1 1 0 0121 8.87V15.13a1 1 0 01-1.447.9L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /> },
      { href: '/fisuras',    label: 'Fisuras',      icon: <Icon d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.141 0M1.394 9.393c5.857-5.857 15.355-5.857 21.213 0" /> },
      { href: '/alertas',    label: 'Alertas',      icon: <Icon d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" d2="M12 9v4M12 17h.01" />, badge: 'LIVE' },
    ],
  },
  {
    label: 'Análisis',
    items: [
      { href: '/analitica',      label: 'Analítica',   icon: <Icon d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /> },
      { href: '/geomechanics',   label: 'Geotecnia',   icon: <Icon d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /> },
      { href: '/reportes',       label: 'Reportes',    icon: <Icon d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" d2="M14 2v6h6M16 13H8M16 17H8M10 9H8" /> },
    ],
  },
  {
    label: 'Sistema',
    items: [
      { href: '/configuracion', label: 'Configuración', icon: <Icon d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" d2="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /> },
    ],
  },
];

// ── Logo Icon ──────────────────────────────────────────────────────────

import Logo from './Logo';

// ── System Status Footer ───────────────────────────────────────────────

function SystemStatus({ collapsed }: { collapsed: boolean }) {
  const statuses = [
    { label: 'Edge',    online: true  },
    { label: 'Backend', online: true  },
    { label: 'MQTT',    online: true  },
    { label: 'Cámara',  online: false },
  ];

  if (collapsed) {
    const allOnline = statuses.every(s => s.online);
    return (
      <div className="flex justify-center py-2">
        <span className={`status-dot ${allOnline ? 'status-dot-online' : 'status-dot-warning'}`} />
      </div>
    );
  }

  return (
    <div className="space-y-2 px-3">
      <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-dark-muted px-1 mb-1">Estado del Sistema</p>
      <div className="rounded-lg border border-dark-border bg-dark-elevated p-2.5 space-y-1.5 shadow-inner">
        {statuses.map(s => (
          <div key={s.label} className="flex items-center justify-between">
            <span className="text-[11px] text-[#94A3B8]">{s.label}</span>
            <div className="flex items-center gap-1.5">
              <span className={s.online ? 'status-dot-online' : 'status-dot-warning'} />
              <span className={`text-[10px] font-medium ${s.online ? 'text-dark-success' : 'text-dark-warning'}`}>
                {s.online ? 'En línea' : 'Desconect.'}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Sidebar Component ──────────────────────────────────────────────────

export default function Sidebar() {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    document.documentElement.style.setProperty('--sidebar-current', collapsed ? '64px' : '240px');
  }, [collapsed]);

  const sidebarW = collapsed ? 'w-16' : 'w-60';

  return (
    <aside
      className={`fixed left-0 top-0 z-40 flex h-screen flex-col border-r border-dark-border bg-dark-secondary shadow-[4px_0_24px_rgba(0,0,0,0.1)] transition-all duration-300 ease-in-out ${sidebarW}`}
    >
      {/* Header */}
      <div className={`flex h-14 shrink-0 items-center border-b border-dark-border px-3 ${collapsed ? 'justify-center' : 'justify-between'}`}>
        <Logo compact={collapsed} />
        {!collapsed && (
          <button
            id="sidebar-collapse-btn"
            onClick={() => setCollapsed(true)}
            className="rounded-md p-1.5 text-dark-textSecondary transition-colors hover:bg-dark-hover hover:text-dark-text"
            title="Colapsar sidebar"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
        )}
        {collapsed && (
          <button
            id="sidebar-expand-btn"
            onClick={() => setCollapsed(false)}
            className="absolute -right-3 top-5 flex h-6 w-6 items-center justify-center rounded-full border border-dark-border bg-dark-surface text-dark-textSecondary shadow-card transition-colors hover:text-dark-accent hover:border-dark-accent/50"
            title="Expandir sidebar"
          >
            <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </button>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-4">
        {navGroups.map((group) => (
          <div key={group.label}>
            {!collapsed && (
              <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-dark-muted mb-2 px-3">{group.label}</p>
            )}
            <ul className="space-y-0.5">
              {group.items.map((item) => {
                const isActive = pathname === item.href || pathname?.startsWith(item.href + '/');
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      title={collapsed ? item.label : undefined}
                      className={`nav-item ${isActive ? 'active' : ''} ${collapsed ? 'justify-center px-0' : ''}`}
                    >
                      <span className="shrink-0">{item.icon}</span>
                      {!collapsed && (
                        <>
                          <span className="flex-1 truncate text-sm">{item.label}</span>
                          {item.badge && (
                            <span className={`rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider ${
                              item.badge === 'LIVE'
                                ? 'bg-dark-accent/15 text-dark-accent'
                                : item.badge === '3D'
                                ? 'bg-indigo-500/15 text-indigo-400'
                                : 'bg-dark-warning/15 text-dark-warning'
                            }`}>
                              {item.badge}
                            </span>
                          )}
                        </>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* System status */}
      <div className="shrink-0 border-t border-dark-border py-3">
        <SystemStatus collapsed={collapsed} />
      </div>

      {/* User profile */}
      {user && (
        <div className={`shrink-0 border-t border-dark-border bg-dark-surface p-3 shadow-inner ${collapsed ? 'flex justify-center' : ''}`}>
          {collapsed ? (
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-dark-accent text-xs font-bold text-white">
              {user.name.charAt(0)}
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-dark-accent text-xs font-bold text-white">
                {user.name.charAt(0)}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-semibold text-dark-text">{user.name}</p>
                <p className="truncate text-[10px] text-dark-muted">{user.role}</p>
              </div>
              <button
                id="logout-btn"
                onClick={logout}
                title="Cerrar sesión"
                className="shrink-0 rounded p-1.5 text-dark-textSecondary transition-colors hover:text-dark-text hover:bg-dark-hover"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
              </button>
            </div>
          )}
        </div>
      )}

      {/* Version */}
      {!collapsed && (
        <div className="shrink-0 border-t border-dark-border/50 px-4 py-2">
          <p className="text-[10px] text-dark-muted">v4.0.0 &mdash; ARGOS SLOPE</p>
        </div>
      )}
    </aside>
  );
}

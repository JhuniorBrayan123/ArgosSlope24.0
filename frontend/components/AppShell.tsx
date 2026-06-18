'use client';

import { usePathname } from 'next/navigation';
import { type ReactNode } from 'react';
import { useAuth } from '@/context/AuthContext';
import Sidebar from '@/components/Sidebar';
import Topbar from '@/components/Topbar';

// Routes that bypass the shell (full-page)
const PUBLIC_ROUTES = ['/login', '/register', '/recover'];

export default function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname() || '';
  const { user, isLoading } = useAuth();
  const isPublic = PUBLIC_ROUTES.some(r => pathname.startsWith(r));

  // Public pages render without shell
  if (isPublic) {
    return <>{children}</>;
  }

  // Loading state
  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-dark-primary">
        <div className="flex flex-col items-center gap-4">
          {/* Logo */}
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-dark-accent/10 border border-dark-accent/20 shadow-glow-accent animate-pulse-slow">
            <svg viewBox="0 0 24 24" className="h-8 w-8 text-dark-accent" fill="none">
              <path d="M2 20 L9 6 L14 13 L18 9 L22 20 Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" fill="currentColor" fillOpacity="0.1" />
              <path d="M2 20 L22 20" stroke="currentColor" strokeWidth="1.5" />
            </svg>
          </div>
          <div className="text-center">
            <p className="text-sm font-semibold text-dark-text">ARGOS SLOPE 4.0</p>
            <p className="mt-0.5 text-xs text-dark-muted">Cargando sistema…</p>
          </div>
          <div className="flex gap-1">
            {[0, 1, 2].map(i => (
              <div
                key={i}
                className="h-1.5 w-1.5 rounded-full bg-dark-accent animate-pulse"
                style={{ animationDelay: `${i * 150}ms` }}
              />
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Not authenticated — redirect handled by AuthContext
  if (!user) return null;

  return (
    <div className="flex h-screen overflow-hidden bg-dark-primary">
      {/* Sidebar */}
      <Sidebar />

      {/* Main area: topbar + content — sidebar offset handled via CSS var */}
      <div
        id="app-main"
        className="flex flex-1 flex-col h-screen overflow-hidden transition-all duration-300"
        style={{ paddingLeft: 'var(--sidebar-current, 240px)' }}
      >
        <Topbar />
        <main className="flex-1 flex flex-col min-h-0 pt-14 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}

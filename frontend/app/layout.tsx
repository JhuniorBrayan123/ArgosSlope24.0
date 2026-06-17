import type { ReactNode } from 'react';
import { Inter } from 'next/font/google';
import './globals.css';
import { AuthProvider } from '@/context/AuthContext';
import AppShell from '@/components/AppShell';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

export const metadata = {
  title: 'ARGOS SLOPE 4.0 — Monitoreo de Taludes Mineros',
  description: 'Plataforma inteligente de monitoreo geotécnico: análisis 2D/3D, detección de fisuras, RQD/RMR y alertas de riesgo.',
  keywords: 'monitoreo talud, geotecnia, minería, fisuras, RQD, RMR, ARGOS SLOPE',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es" className={inter.variable}>
      <body className="bg-dark-primary text-dark-text antialiased">
        <AuthProvider>
          <AppShell>{children}</AppShell>
        </AuthProvider>
      </body>
    </html>
  );
}

'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { AuthRightColumn } from '@/components/AuthBackground';
import Logo from '@/components/Logo';
import { motion } from 'framer-motion';

// ── Main Layout ───────────────────────────────────────────────────────

export default function LoginPage() {
  const { login, user, isLoading } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!isLoading && user) {
      router.replace('/');
    }
  }, [user, isLoading, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) { setError('Ingrese su correo electrónico.'); return; }
    setError('');
    setIsSubmitting(true);
    try {
      const ok = await login(email, password, remember);
      if (ok) {
        router.replace('/');
      } else {
        setError('Credenciales incorrectas. Verifique e intente de nuevo.');
      }
    } catch {
      setError('Error de conexión. Verifique el sistema.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen bg-dark-primary text-dark-text">
      {/* ── LEFT COLUMN: AUTH FORM ── */}
      <motion.div
        initial={{ x: -50, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className="flex w-full flex-col justify-center px-8 lg:w-[480px] xl:w-[540px] xl:px-16 shrink-0 relative z-10 bg-[#18181B] shadow-[20px_0_40px_rgba(0,0,0,0.15)]"
      >
        <div className="w-full max-w-[400px] mx-auto">
          {/* Logo & Header */}
          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.2, duration: 0.5 }}
            className="mb-10"
          >
            <Logo className="mb-6 scale-125 origin-left" />
            <p className="mt-4 text-sm text-[#A1A1AA] font-medium">
              Acceso al sistema de monitoreo inteligente.
            </p>
          </motion.div>

          {/* Login Form */}
          <form onSubmit={handleSubmit} className="space-y-5">
            {error && (
              <div className="flex items-start gap-2 rounded-lg border border-dark-danger/30 bg-dark-danger/10 px-3 py-2.5 animate-shake">
                <svg
                  className="mt-0.5 h-4 w-4 shrink-0 text-dark-danger"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"
                  />
                </svg>
                <p className="text-xs text-dark-danger">{error}</p>
              </div>
            )}

            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-dark-muted">
                Correo electrónico
              </label>
              <div className="relative group">
                <div className="pointer-events-none absolute inset-y-0 left-3 flex items-center">
                  <svg
                    className="h-4 w-4 text-dark-muted group-focus-within:text-dark-accent transition-colors"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                    />
                  </svg>
                </div>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="operador@argos.mine"
                  required
                  className="argos-input pl-10 focus:shadow-[0_0_12px_var(--accent-glow)] transition-shadow bg-dark-elevated border-dark-border"
                  autoComplete="email"
                />
              </div>
            </div>

            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <label className="block text-xs font-semibold uppercase tracking-wide text-dark-muted">
                  Contraseña
                </label>
                <a
                  href="/recover"
                  className="text-xs font-medium text-dark-accent hover:text-dark-text transition-colors"
                >
                  ¿Olvidaste tu clave?
                </a>
              </div>
              <div className="relative group">
                <div className="pointer-events-none absolute inset-y-0 left-3 flex items-center">
                  <svg
                    className="h-4 w-4 text-dark-muted group-focus-within:text-dark-accent transition-colors"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                    />
                  </svg>
                </div>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="argos-input pl-10 focus:shadow-[0_0_12px_var(--accent-glow)] transition-shadow bg-dark-elevated border-dark-border"
                  autoComplete="current-password"
                />
              </div>
            </div>

            <div className="flex items-center pt-1 pb-2">
              <input
                id="remember"
                type="checkbox"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
                className="h-4 w-4 rounded border-dark-border bg-dark-elevated text-dark-accent focus:ring-dark-accent focus:ring-offset-dark-primary"
              />
              <label
                htmlFor="remember"
                className="ml-2 block text-sm text-dark-textSecondary"
              >
                Recordar sesión
              </label>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="relative w-full overflow-hidden rounded-lg bg-dark-accent py-3.5 text-sm font-bold text-white transition-all duration-300 hover:brightness-110 hover:shadow-glow-accent hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50"
            >
              {isSubmitting ? (
                <span className="flex items-center justify-center gap-2">
                  <svg
                    className="h-4 w-4 animate-spin"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                    />
                  </svg>
                  Validando…
                </span>
              ) : (
                "Acceder al Sistema"
              )}
            </button>
          </form>

          {/* Links adicionales */}
          <div className="mt-8 text-center">
            <p className="text-sm text-dark-textSecondary">
              ¿No tienes una cuenta?{" "}
              <a
                href="/register"
                className="font-bold text-dark-accent hover:text-dark-text hover:underline transition-all"
              >
                Crear cuenta nueva
              </a>
            </p>
          </div>

          <p className="mt-8 text-center text-[11px] text-dark-muted">
            v4.0.0 &copy; 2024 | Entorno de Monitoreo Seguro
          </p>
        </div>
      </motion.div>

      {/* ── RIGHT COLUMN: VISUAL BRANDING ── */}
      <AuthRightColumn />
    </div>
  );
}

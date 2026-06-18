'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AuthRightColumn } from '@/components/AuthBackground';

export default function RegisterPage() {
  const router = useRouter();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim() || !email.trim() || !password || !confirmPassword) {
      setError('Todos los campos son obligatorios.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Las contraseñas no coinciden.');
      return;
    }
    
    setError('');
    setIsSubmitting(true);
    
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
      const res = await fetch(`${apiUrl}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fullName, email, password }),
      });
      
      const data = await res.json();
      
      if (res.ok) {
        setSuccess('Usuario registrado exitosamente. Serás redirigido al login.');
        setTimeout(() => {
          router.push('/login');
        }, 2500);
      } else {
        setError(data.message || 'Error al registrar el usuario.');
      }
    } catch {
      setError('Error de conexión. Verifique el sistema.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen bg-[#0F1115]">
      {/* ── LEFT COLUMN: AUTH FORM ── */}
      <div className="flex w-full flex-col justify-center px-8 lg:w-[480px] xl:w-[540px] xl:px-16 shrink-0 relative z-10 bg-[#0F1115] shadow-[20px_0_40px_rgba(0,0,0,0.5)] animate-slide-in-left">
        
        <div className="w-full max-w-[400px] mx-auto animate-fade-in">
        
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-dark-accent/10 border border-dark-accent/30 shadow-glow-accent">
            <svg viewBox="0 0 40 40" className="h-6 w-6" fill="none">
              <path d="M4 34 L16 10 L24 22 L30 16 L36 34 Z" stroke="#0EA5C5" strokeWidth="1.5" strokeLinejoin="round" fill="rgba(14,165,197,0.08)" />
            </svg>
          </div>
          <h1 className="text-xl font-bold tracking-tight text-dark-text">Crear Cuenta</h1>
          <p className="mt-1 text-xs text-dark-textSecondary">Registro de nuevo operador en el sistema</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="rounded-lg border border-dark-danger/30 bg-dark-danger/10 px-3 py-2 animate-shake">
              <p className="text-xs text-dark-danger text-center">{error}</p>
            </div>
          )}
          {success && (
            <div className="rounded-lg border border-dark-success/30 bg-dark-success/10 px-3 py-2">
              <p className="text-xs text-dark-success text-center">{success}</p>
            </div>
          )}

          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-dark-muted">Nombre Completo</label>
            <input
              type="text"
              value={fullName}
              onChange={e => setFullName(e.target.value)}
              placeholder="Ej. Juan Pérez"
              required
              className="argos-input focus:shadow-[0_0_12px_rgba(14,165,197,0.25)] transition-shadow bg-[#0F1115] border-[#2A3143] px-3 py-2.5 w-full rounded-lg text-sm text-white placeholder-slate-500"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-dark-muted">Correo electrónico</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="correo@ejemplo.com"
              required
              className="argos-input focus:shadow-[0_0_12px_rgba(14,165,197,0.25)] transition-shadow bg-[#0F1115] border-[#2A3143] px-3 py-2.5 w-full rounded-lg text-sm text-white placeholder-slate-500"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-dark-muted">Contraseña</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              className="argos-input focus:shadow-[0_0_12px_rgba(14,165,197,0.25)] transition-shadow bg-[#0F1115] border-[#2A3143] px-3 py-2.5 w-full rounded-lg text-sm text-white placeholder-slate-500"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-dark-muted">Confirmar Contraseña</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              placeholder="••••••••"
              required
              className="argos-input focus:shadow-[0_0_12px_rgba(14,165,197,0.25)] transition-shadow bg-[#0F1115] border-[#2A3143] px-3 py-2.5 w-full rounded-lg text-sm text-white placeholder-slate-500"
            />
          </div>

          <button
            type="submit"
            disabled={isSubmitting || !!success}
            className="mt-6 relative w-full overflow-hidden rounded-lg bg-dark-accent py-3.5 text-sm font-bold text-dark-primary transition-all duration-300 hover:bg-[#22d3ee] hover:shadow-glow-accent disabled:opacity-50"
          >
            {isSubmitting ? 'Registrando...' : 'Registrar Cuenta'}
          </button>
        </form>

        <div className="mt-6 text-center">
          <a href="/login" className="text-xs font-medium text-dark-textSecondary hover:text-[#22d3ee] transition-colors">
            Volver al Inicio de Sesión
          </a>
        </div>
      </div>
      </div>

      {/* ── RIGHT COLUMN: VISUAL BRANDING ── */}
      <AuthRightColumn />
    </div>
  );
}

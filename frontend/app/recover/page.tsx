'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AuthRightColumn } from '@/components/AuthBackground';

export default function RecoverPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [tempPassword, setTempPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      setError('El correo electrónico es obligatorio.');
      return;
    }
    
    setError('');
    setTempPassword('');
    setIsSubmitting(true);
    
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
      const res = await fetch(`${apiUrl}/api/auth/recover`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      
      const data = await res.json();
      
      if (res.ok) {
        setTempPassword(data.tempPassword);
      } else {
        setError(data.message || 'Error al recuperar la clave.');
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
            <svg viewBox="0 0 24 24" className="h-6 w-6 text-[#0EA5C5]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"></path>
            </svg>
          </div>
          <h1 className="text-xl font-bold tracking-tight text-dark-text">Recuperar Clave</h1>
          <p className="mt-1 text-xs text-dark-textSecondary">Generar acceso temporal para cuenta existente</p>
        </div>

        {tempPassword ? (
          <div className="space-y-4 text-center">
             <div className="rounded-lg border border-dark-success/30 bg-dark-success/10 p-4 animate-fade-in">
                <p className="text-sm font-semibold text-dark-success mb-2">¡Contraseña temporal generada!</p>
                <p className="text-xs text-dark-muted mb-4">Copia esta contraseña e ingresa al sistema para cambiarla inmediatamente.</p>
                
                <div className="bg-[#0F1115] border border-[#2A3143] rounded-md p-3 select-all">
                  <span className="font-mono text-lg text-white font-bold">{tempPassword}</span>
                </div>
             </div>
             
             <button
                onClick={() => router.push('/login')}
                className="relative w-full overflow-hidden rounded-lg bg-dark-accent py-3.5 text-sm font-bold text-dark-primary transition-all duration-300 hover:bg-[#22d3ee] hover:shadow-glow-accent"
              >
                Ir a Iniciar Sesión
              </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="rounded-lg border border-dark-danger/30 bg-dark-danger/10 px-3 py-2 animate-shake">
                <p className="text-xs text-dark-danger text-center">{error}</p>
              </div>
            )}

            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-dark-muted">Correo electrónico registrado</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="operador@argos.mine"
                required
                className="argos-input focus:shadow-[0_0_12px_rgba(14,165,197,0.25)] transition-shadow bg-[#0F1115] border-[#2A3143] px-3 py-2.5 w-full rounded-lg text-sm text-white placeholder-slate-500"
              />
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="mt-6 relative w-full overflow-hidden rounded-lg bg-dark-accent py-3.5 text-sm font-bold text-dark-primary transition-all duration-300 hover:bg-[#22d3ee] hover:shadow-glow-accent disabled:opacity-50"
            >
              {isSubmitting ? 'Verificando...' : 'Obtener Clave Temporal'}
            </button>
          </form>
        )}

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

'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';

// ── Floating Metric Card ──────────────────────────────────────────────

function FloatingMetricCard({
  title,
  value,
  subtitle,
  icon,
  position,
  delay
}: {
  title: string;
  value: string;
  subtitle: string;
  icon: React.ReactNode;
  position: string;
  delay: string;
}) {
  return (
    <div
      className={`absolute ${position} glass-card z-20 flex items-center gap-4 p-4 shadow-2xl backdrop-blur-md border border-dark-border/40 animate-bounce-slow`}
      style={{ animationDelay: delay }}
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-dark-accent/20 border border-dark-accent/30 text-dark-accent shadow-glow-accent">
        {icon}
      </div>
      <div>
        <p className="text-[10px] font-bold uppercase tracking-wider text-dark-muted">{title}</p>
        <p className="text-xl font-bold text-dark-text leading-tight">{value}</p>
        <p className="text-xs text-dark-success font-medium">{subtitle}</p>
      </div>
    </div>
  );
}

// ── Animated Topographic Canvas Background ────────────────────────────

function MiningBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const parent = canvas.parentElement;
    if (!parent) return;

    let animFrame: number;
    let t = 0;

    const resize = () => {
      canvas.width = parent.clientWidth;
      canvas.height = parent.clientHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    // Particles
    const particles = Array.from({ length: 80 }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      r: Math.random() * 1.5 + 0.3,
      opacity: Math.random() * 0.5 + 0.1,
      speed: Math.random() * 0.3 + 0.05,
      drift: (Math.random() - 0.5) * 0.2,
    }));

    const draw = () => {
      t += 0.003;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Gradient background (Deep Petroleum Blue)
      const grad = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
      grad.addColorStop(0, '#060B14');
      grad.addColorStop(0.5, '#0B1426');
      grad.addColorStop(1, '#060B14');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Topographic contour lines
      const levels = 8;
      for (let i = 0; i < levels; i++) {
        const baseY = (canvas.height / (levels + 1)) * (i + 1);
        const alpha = 0.04 + (i / levels) * 0.06;
        ctx.beginPath();
        ctx.strokeStyle = `rgba(14,165,197,${alpha})`;
        ctx.lineWidth = 1;
        ctx.moveTo(0, baseY);
        for (let x = 0; x <= canvas.width; x += 4) {
          const y =
            baseY +
            Math.sin((x / canvas.width) * 5 + t + i) * (20 + i * 8) +
            Math.sin((x / canvas.width) * 2 - t * 0.5 + i * 0.5) * 15;
          ctx.lineTo(x, y);
        }
        ctx.stroke();
      }

      // Point cloud grid
      const step = 45;
      for (let gx = step; gx < canvas.width; gx += step) {
        for (let gy = step; gy < canvas.height; gy += step) {
          const noiseX = Math.sin(gx * 0.02 + t) * 8;
          const noiseY = Math.cos(gy * 0.02 + t * 0.8) * 8;
          const dist = Math.sqrt(
            Math.pow(gx - canvas.width / 2, 2) + Math.pow(gy - canvas.height / 2, 2)
          );
          const fade = Math.max(0, 1 - dist / (canvas.width * 0.7));
          const alpha = fade * 0.15;
          if (alpha < 0.01) continue;
          ctx.beginPath();
          ctx.arc(gx + noiseX, gy + noiseY, 1, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(14,165,197,${alpha})`;
          ctx.fill();
        }
      }

      // Floating particles
      particles.forEach((p) => {
        p.y -= p.speed;
        p.x += p.drift;
        if (p.y < -5) { p.y = canvas.height + 5; p.x = Math.random() * canvas.width; }
        if (p.x < -5) p.x = canvas.width + 5;
        if (p.x > canvas.width + 5) p.x = -5;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(14,165,197,${p.opacity})`;
        ctx.fill();
      });

      // Diagonal scanner line
      const scanX = ((t * 100) % (canvas.width + canvas.height)) - canvas.height;
      ctx.beginPath();
      ctx.moveTo(scanX, 0);
      ctx.lineTo(scanX + canvas.height, canvas.height);
      ctx.strokeStyle = 'rgba(14,165,197,0.05)';
      ctx.lineWidth = 80;
      ctx.stroke();

      animFrame = requestAnimationFrame(draw);
    };

    draw();
    return () => {
      cancelAnimationFrame(animFrame);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />;
}

// ── Main Layout ───────────────────────────────────────────────────────

export default function LoginPage() {
  const { login, user, isLoading } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('admin@argos.mine');
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
    <div className="flex min-h-screen bg-[#0F1115]">
      
      {/* ── LEFT COLUMN: AUTH FORM ── */}
      <div className="flex w-full flex-col justify-center px-8 lg:w-[480px] xl:w-[540px] xl:px-16 shrink-0 relative z-10 bg-[#0F1115] shadow-[20px_0_40px_rgba(0,0,0,0.5)] animate-slide-in-left">
        
        <div className="w-full max-w-[400px] mx-auto animate-fade-in">
          {/* Logo & Header */}
          <div className="mb-10">
            <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-dark-accent/10 border border-dark-accent/30 shadow-glow-accent">
              <svg viewBox="0 0 40 40" className="h-8 w-8" fill="none">
                <path d="M4 34 L16 10 L24 22 L30 16 L36 34 Z" stroke="#0EA5C5" strokeWidth="1.5" strokeLinejoin="round" fill="rgba(14,165,197,0.08)" />
                <path d="M4 34 L36 34" stroke="#0EA5C5" strokeWidth="1.5" />
                <path d="M16 10 L18 14 L15 17 L19 21" stroke="#10B981" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                <circle cx="19" cy="21" r="1.5" fill="#10B981" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-dark-text">ARGOS SLOPE 4.0</h1>
            <p className="mt-2 text-sm text-dark-secondary">Plataforma Inteligente de Monitoreo de Taludes</p>
          </div>

          {/* Login Form */}
          <form onSubmit={handleSubmit} className="space-y-5">
            {error && (
              <div className="flex items-start gap-2 rounded-lg border border-dark-danger/30 bg-dark-danger/10 px-3 py-2.5 animate-shake">
                <svg className="mt-0.5 h-4 w-4 shrink-0 text-dark-danger" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
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
                  <svg className="h-4 w-4 text-dark-muted group-focus-within:text-dark-accent transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                </div>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="operador@argos.mine"
                  required
                  className="argos-input pl-10 focus:shadow-[0_0_12px_rgba(14,165,197,0.25)] transition-shadow bg-[#151923] border-[#2A3143]"
                  autoComplete="email"
                />
              </div>
            </div>

            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <label className="block text-xs font-semibold uppercase tracking-wide text-dark-muted">
                  Contraseña
                </label>
                <a href="#" className="text-xs font-medium text-dark-accent hover:text-[#22d3ee] transition-colors">
                  ¿Olvidaste tu clave?
                </a>
              </div>
              <div className="relative group">
                <div className="pointer-events-none absolute inset-y-0 left-3 flex items-center">
                  <svg className="h-4 w-4 text-dark-muted group-focus-within:text-dark-accent transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                </div>
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="argos-input pl-10 focus:shadow-[0_0_12px_rgba(14,165,197,0.25)] transition-shadow bg-[#151923] border-[#2A3143]"
                  autoComplete="current-password"
                />
              </div>
            </div>

            <div className="flex items-center pt-1 pb-2">
              <input
                id="remember"
                type="checkbox"
                checked={remember}
                onChange={e => setRemember(e.target.checked)}
                className="h-4 w-4 rounded border-dark-border bg-[#151923] text-dark-accent focus:ring-dark-accent focus:ring-offset-dark-primary"
              />
              <label htmlFor="remember" className="ml-2 block text-sm text-dark-secondary">
                Recordar sesión
              </label>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="relative w-full overflow-hidden rounded-lg bg-dark-accent py-3.5 text-sm font-bold text-dark-primary transition-all duration-300 hover:bg-[#22d3ee] hover:shadow-glow-accent hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50"
            >
              {isSubmitting ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Validando…
                </span>
              ) : (
                'Acceder al Sistema'
              )}
            </button>
          </form>

          {/* Demo Accounts Wrapper */}
          <div className="mt-8 rounded-xl border border-dark-border/40 bg-[#151923]/50 p-4">
            <p className="mb-3 flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-dark-muted">
              <span className="h-px flex-1 bg-dark-border/60"></span>
              Accesos Demo
              <span className="h-px flex-1 bg-dark-border/60"></span>
            </p>
            <div className="flex flex-col gap-1.5">
              {[
                ['admin@argos.mine', 'Administrador'],
                ['operador@argos.mine', 'Operador'],
                ['geotecnico@argos.mine', 'Geotécnico'],
              ].map(([mail, role]) => (
                <button
                  key={mail}
                  type="button"
                  onClick={() => setEmail(mail)}
                  className="group flex items-center justify-between rounded-lg px-3 py-2 transition-all hover:bg-dark-accent/10 border border-transparent hover:border-dark-accent/20"
                >
                  <span className="text-xs font-medium text-dark-secondary group-hover:text-dark-text transition-colors">{mail}</span>
                  <span className="rounded bg-dark-primary px-1.5 py-0.5 text-[10px] font-semibold text-dark-muted group-hover:text-dark-accent">{role}</span>
                </button>
              ))}
            </div>
          </div>

          <p className="mt-8 text-center text-[11px] text-dark-muted">
            v4.0.0 &copy; 2024 | Entorno de Monitoreo Seguro
          </p>
        </div>
      </div>

      {/* ── RIGHT COLUMN: VISUAL BRANDING (Hidden on Mobile) ── */}
      <div className="hidden lg:flex flex-1 relative bg-[#0B1426] overflow-hidden items-center justify-center">
        
        {/* Background Image */}
        <div 
          className="absolute inset-0 z-0 opacity-40 bg-cover bg-center bg-no-repeat transition-opacity duration-1000"
          style={{ backgroundImage: 'url(/assets/Gemini_Generated_Image_6ndxyd6ndxyd6ndx.png)' }}
        />

        {/* Animated Canvas */}
        <div className="relative z-0 w-full h-full mix-blend-screen opacity-80">
          <MiningBackground />
        </div>

        {/* Dark Vignette Overlay for Depth */}
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,rgba(6,11,20,0.9)_100%)] pointer-events-none z-10" />

        {/* Hero Content Overlay */}
        <div className="absolute z-20 max-w-2xl px-12 text-center pointer-events-none">
          <div className="inline-block rounded-full bg-dark-accent/10 border border-dark-accent/30 px-4 py-1.5 mb-6 backdrop-blur-sm animate-fade-stagger" style={{ animationDelay: '0.1s' }}>
            <span className="text-xs font-bold tracking-widest uppercase text-dark-accent flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-dark-success animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.6)]"></span>
              Sistema SCADA & Gemelo Digital en Línea
            </span>
          </div>
          <h2 className="text-4xl xl:text-5xl font-extrabold text-white mb-6 leading-tight drop-shadow-2xl animate-fade-stagger" style={{ animationDelay: '0.3s' }}>
            Monitoreo Inteligente de <span className="text-transparent bg-clip-text bg-gradient-to-r from-dark-accent to-[#10B981]">Taludes Mineros</span>
          </h2>
          <p className="text-lg text-slate-300 font-medium drop-shadow-md animate-fade-stagger" style={{ animationDelay: '0.5s' }}>
            Detección de Fisuras · RMR/RQD · Análisis de Riesgo Geotécnico
          </p>
          <p className="mt-4 text-sm text-slate-400 animate-fade-stagger" style={{ animationDelay: '0.7s' }}>
            Más precisión, más control y mayor seguridad operacional.
          </p>
        </div>

        {/* Floating Technical Cards */}
        <FloatingMetricCard
          title="RQD Estimado"
          value="84.5%"
          subtitle="Calidad Buena"
          position="top-24 left-16 xl:left-32"
          delay="0s"
          icon={
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
          }
        />

        <FloatingMetricCard
          title="Fisuras Activas"
          value="1,420"
          subtitle="Analizadas hoy"
          position="bottom-32 left-12 xl:left-24"
          delay="1.5s"
          icon={
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.141 0M1.394 9.393c5.857-5.857 15.355-5.857 21.213 0" />
            </svg>
          }
        />

        <FloatingMetricCard
          title="Estado Operativo"
          value="Normal"
          subtitle="Sistema en línea"
          position="top-1/2 right-12 xl:right-24"
          delay="0.75s"
          icon={
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.121 17.804A13.937 13.937 0 0112 16c2.5 0 4.847.655 6.879 1.804M15 10a3 3 0 11-6 0 3 3 0 016 0zm6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
        />

      </div>
    </div>
  );
}

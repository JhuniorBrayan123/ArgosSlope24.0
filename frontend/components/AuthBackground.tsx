'use client';

import { useEffect, useRef } from 'react';

// ── Floating Metric Card ──────────────────────────────────────────────

export function FloatingMetricCard({
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

export function MiningBackground() {
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

      // Gradient background (Deep Charcoal)
      const grad = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
      grad.addColorStop(0, '#09090B');
      grad.addColorStop(0.5, '#18181B');
      grad.addColorStop(1, '#09090B');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Topographic contour lines
      const levels = 8;
      for (let i = 0; i < levels; i++) {
        const baseY = (canvas.height / (levels + 1)) * (i + 1);
        const alpha = 0.04 + (i / levels) * 0.06;
        ctx.beginPath();
        ctx.strokeStyle = `rgba(255,107,0,${alpha})`;
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
          ctx.fillStyle = `rgba(255,107,0,${alpha})`;
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
        ctx.fillStyle = `rgba(255,107,0,${p.opacity})`;
        ctx.fill();
      });

      // Diagonal scanner line
      const scanX = ((t * 100) % (canvas.width + canvas.height)) - canvas.height;
      ctx.beginPath();
      ctx.moveTo(scanX, 0);
      ctx.lineTo(scanX + canvas.height, canvas.height);
      ctx.strokeStyle = 'rgba(255,107,0,0.05)';
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

// ── Shared Right Column ──────────────────────────────────────────────

export function AuthRightColumn() {
  return (
    <div className="hidden lg:flex flex-1 relative bg-dark-primary overflow-hidden items-center justify-center animate-fade-in">
      
      {/* Background Image - Add scale animation */}
      <div 
        className="absolute inset-0 z-0 opacity-40 bg-cover bg-center bg-no-repeat animate-scale-in"
        style={{ backgroundImage: 'url(/assets/Gemini_Generated_Image_6ndxyd6ndxyd6ndx.png)' }}
      />

      {/* Animated Canvas */}
      <div className="relative z-0 w-full h-full mix-blend-screen opacity-80">
        <MiningBackground />
      </div>

      {/* Dark Vignette Overlay for Depth */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,rgba(9,9,11,0.9)_100%)] pointer-events-none z-10" />

      {/* Hero Content Overlay */}
      <div className="absolute z-20 max-w-2xl px-12 text-center pointer-events-none">
        <div className="inline-block rounded-full bg-dark-accent/10 border border-dark-accent/30 px-4 py-1.5 mb-6 backdrop-blur-sm animate-fade-stagger" style={{ animationDelay: '0.1s' }}>
          <span className="text-xs font-bold tracking-widest uppercase text-dark-accent flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-dark-success animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.6)]"></span>
            Sistema SCADA & Gemelo Digital en Línea
          </span>
        </div>
        <h2 className="text-4xl xl:text-5xl font-extrabold text-white mb-6 leading-tight drop-shadow-2xl animate-fade-stagger" style={{ animationDelay: '0.3s' }}>
          Monitoreo Inteligente de <span className="text-transparent bg-clip-text bg-gradient-to-r from-dark-accent to-[#F59E0B]">Taludes Mineros</span>
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
  );
}

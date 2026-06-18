'use client';

import Image from 'next/image';
import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';

interface LogoProps {
  className?: string;
  compact?: boolean;
}

export default function Logo({ className = '', compact = false }: LogoProps) {
  const [mounted, setMounted] = useState(false);
  const { theme } = useTheme();

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return <div className={`h-8 w-32 bg-dark-hover rounded animate-pulse ${className}`} />;
  }

  const isDark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);

  // argos-logo.jpeg is for dark mode (light text)
  // argos-logo-modo oscuro-fondo blanco.jpeg is for light mode (dark text on white)
  const src = isDark 
    ? '/assets/argos-logo.jpeg' 
    : '/assets/argos-logo-modo oscuro-fondo blanco.jpeg';

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <div className="relative flex items-center justify-center bg-white rounded overflow-hidden p-1">
        <Image 
          src={src} 
          alt="ARGOS SLOPE 4.0 Logo" 
          width={compact ? 40 : 120} 
          height={compact ? 40 : 40}
          className="object-contain mix-blend-multiply"
          priority
        />
      </div>
      {!compact && (
        <div className="flex flex-col">
          <span className="font-bold text-dark-text tracking-wide text-sm leading-tight">ARGOS SLOPE</span>
          <span className="text-[10px] text-dark-accent font-mono">v4.0</span>
        </div>
      )}
    </div>
  );
}

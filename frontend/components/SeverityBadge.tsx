import React from 'react';

interface SeverityBadgeProps {
  critical: boolean;
  value?: number; // Optional delta percentage to determine middle risk
}

export default function SeverityBadge({ critical, value }: SeverityBadgeProps) {
  if (critical) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-dark-danger/15 px-2.5 py-0.5 text-[11px] font-bold text-dark-danger border border-dark-danger/20 animate-pulse-slow">
        <span className="h-1.5 w-1.5 rounded-full bg-dark-danger shadow-[0_0_5px_rgba(239,68,68,0.8)]" />
        Crítico
      </span>
    );
  }
  
  if (value && value > 10) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-dark-warning/15 px-2.5 py-0.5 text-[11px] font-semibold text-dark-warning border border-dark-warning/20">
        <span className="h-1.5 w-1.5 rounded-full bg-dark-warning" />
        Riesgo Medio
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-dark-success/15 px-2.5 py-0.5 text-[11px] font-semibold text-dark-success border border-dark-success/20">
      <span className="h-1.5 w-1.5 rounded-full bg-dark-success" />
      Estable
    </span>
  );
}

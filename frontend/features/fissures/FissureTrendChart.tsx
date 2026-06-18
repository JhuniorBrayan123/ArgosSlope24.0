'use client';

import { useMemo } from 'react';
import { useFissureStore } from '@/stores/fissure.store';

export default function FissureTrendChart() {
  const { fissures } = useFissureStore();

  const chartData = useMemo(() => {
    // Group fissures by date
    const groups = fissures.reduce((acc, f) => {
      const date = new Date(f.fechaDeteccion).toLocaleDateString('es-ES', { month: 'short', day: 'numeric' });
      if (!acc[date]) {
        acc[date] = { count: 0, critical: 0 };
      }
      acc[date].count += 1;
      if (f.esCritica) acc[date].critical += 1;
      return acc;
    }, {} as Record<string, { count: number; critical: number }>);

    // Get last 7 days sorted
    const sortedDates = Object.keys(groups).sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
    const last7 = sortedDates.slice(-7);
    
    // Find max value for scaling
    let max = 0;
    last7.forEach(d => {
      if (groups[d].count > max) max = groups[d].count;
    });

    if (max === 0) max = 1; // Prevent division by zero

    return { groups, last7, max };
  }, [fissures]);

  if (fissures.length === 0) return null;

  return (
    <div className="mb-6 rounded-xl border border-dark-border bg-dark-surface p-5">
      <h3 className="mb-4 text-sm font-semibold text-dark-text">Tendencia de Detecciones (Últimos 7 días)</h3>
      <div className="flex h-32 items-end gap-2 overflow-x-auto pb-2">
        {chartData.last7.map((date) => {
          const { count, critical } = chartData.groups[date];
          const heightPct = Math.max((count / chartData.max) * 100, 5); // min 5%
          const critPct = count > 0 ? (critical / count) * 100 : 0;
          
          return (
            <div key={date} className="group relative flex flex-1 flex-col items-center justify-end">
              {/* Tooltip */}
              <div className="absolute -top-10 hidden flex-col items-center group-hover:flex">
                <div className="whitespace-nowrap rounded bg-dark-primary px-2 py-1 text-xs text-dark-text shadow-lg border border-dark-border z-10">
                  <span className="font-bold">{count}</span> totales (<span className="text-dark-danger">{critical}</span> críticas)
                </div>
              </div>
              
              <div className="w-full max-w-[40px] rounded-t-sm bg-dark-accent/20 relative overflow-hidden transition-all group-hover:bg-dark-accent/30" style={{ height: `${heightPct}%` }}>
                <div 
                  className="absolute bottom-0 w-full bg-dark-danger" 
                  style={{ height: `${critPct}%` }}
                />
              </div>
              <span className="mt-2 text-[10px] text-dark-textSecondary">{date}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

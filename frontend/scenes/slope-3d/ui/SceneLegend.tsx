/**
 * ARGOS SLOPE 4.0 — Scene Legend.
 *
 * Bottom-left legend overlay showing fissure severity colors
 * with counts of fissures by severity type.
 *
 * Matches the design and styling of the legend in Visualizacion3D.tsx
 * while extending it with severity counts.
 */

'use client';

import { useMemo } from 'react';
import { FisuraResponse } from '@/services/api-client';
import { COLOR_FISURA } from '../scene/terrain';

// ── Severity config ───────────────────────────────────────────────────

interface SeverityEntry {
  key: string;
  label: string;
  color: string;
}

const SEVERITIES: SeverityEntry[] = [
  { key: 'fina', label: 'Fina', color: COLOR_FISURA['fina'] },
  { key: 'media', label: 'Media', color: COLOR_FISURA['media'] },
  { key: 'gruesa', label: 'Gruesa', color: COLOR_FISURA['gruesa'] },
];

// ── Props ────────────────────────────────────────────────────────────

export interface SceneLegendProps {
  /** Fissure list to compute counts from */
  fissures: FisuraResponse[];
}

// ── Component ─────────────────────────────────────────────────────────

export default function SceneLegend({ fissures }: SceneLegendProps) {
  const counts = useMemo(() => {
    const map: Record<string, number> = { fina: 0, media: 0, gruesa: 0 };
    for (const f of fissures) {
      const tipo = f.tipo ?? 'desconocido';
      if (map[tipo] !== undefined) {
        map[tipo]++;
      } else {
        map['fina']++; // default for unknown types
      }
    }
    return map;
  }, [fissures]);

  const totalFissures = useMemo(
    () => fissures.length,
    [fissures]
  );

  return (
    <div className="pointer-events-none absolute bottom-4 left-4 z-10 rounded-lg border border-dark-border bg-dark-surface/90 px-4 py-3 text-xs backdrop-blur-sm">
      <p className="mb-2 font-semibold text-dark-text">
        Fisuras
        {totalFissures > 0 && (
          <span className="ml-1.5 text-dark-secondary/60 font-normal">
            ({totalFissures})
          </span>
        )}
      </p>
      <div className="space-y-1.5">
        {SEVERITIES.map((sev) => (
          <div key={sev.key} className="flex items-center gap-2">
            <span
              className="inline-block h-2.5 w-2.5 rounded-full shrink-0"
              style={{ backgroundColor: sev.color }}
            />
            <span className="text-dark-secondary">{sev.label}</span>
            {counts[sev.key] > 0 && (
              <span className="ml-auto text-dark-secondary/50 tabular-nums">
                {counts[sev.key]}
              </span>
            )}
          </div>
        ))}
      </div>
      <p className="mt-2 text-[10px] text-dark-secondary/40">
        Arrastra para orbitar · Rueda para zoom
      </p>
    </div>
  );
}

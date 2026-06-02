/**
 * ARGOS SLOPE 4.0 — SeccionNubePuntos Section Component.
 *
 * Client component that wires the ``useMqttPuntos`` hook to the
 * ``NubePuntos3D`` R3F viewer. Intended to be imported from the
 * server-component dashboard page.
 *
 * Renders:
 *   - Connection status indicator (top-right badge)
 *   - Point cloud viewer with orbit controls
 *   - Crack count overlay when data is present
 *   - Graceful empty/loading state when no MQTT data has arrived
 */

'use client';

import { useEffect, useState } from 'react';
import { useMqttPuntos } from '@/lib/hooks/useMqttPuntos';
import NubePuntos3D from '@/components/NubePuntos3D';

export default function SeccionNubePuntos() {
  const { pointCloud, cracks, imagePath, timestamp, connected } =
    useMqttPuntos();

  const [mounted, setMounted] = useState(false);

  // Avoid hydration mismatch — render only on client
  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div className="rounded-xl border border-dark-border bg-dark-surface p-5">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-dark-text">
              Nube de Puntos 3D
            </h2>
            <p className="text-sm text-dark-secondary">
              Visualización de alertas 3D del dispositivo edge
            </p>
          </div>
        </div>
      </div>
    );
  }

  const crackCount = cracks.length;

  return (
    <section className="space-y-2">
      {/* Section header with connection status */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-dark-text">
            Nube de Puntos 3D
          </h2>
          <p className="text-sm text-dark-secondary">
            Visualización de alertas 3D del dispositivo edge
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Crack count badge */}
          {crackCount > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-dark-warning/15 px-3 py-1 text-xs font-semibold text-dark-warning">
              <span className="h-1.5 w-1.5 rounded-full bg-dark-warning" />
              {crackCount} fisura{crackCount !== 1 ? 's' : ''}
            </span>
          )}

          {/* Connection indicator */}
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${
              connected
                ? 'bg-green-500/15 text-green-400'
                : 'bg-dark-danger/15 text-dark-danger'
            }`}
          >
            <span
              className={`inline-block h-2 w-2 rounded-full ${
                connected
                  ? 'bg-green-400 shadow-[0_0_6px_#22c55e]'
                  : 'bg-dark-danger shadow-[0_0_6px_#ef4444]'
              }`}
            />
            {connected ? 'Conectado' : 'Desconectado'}
          </span>
        </div>
      </div>

      {/* Point cloud viewer */}
      <NubePuntos3D
        points={pointCloud.length > 0 ? pointCloud : null}
        height={480}
        timestamp={timestamp}
      />

      {/* Image path footer (if present) */}
      {imagePath && (
        <p className="text-[11px] text-dark-secondary/50">
          Captura: {imagePath}
        </p>
      )}
    </section>
  );
}

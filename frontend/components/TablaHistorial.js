'use client';

import { useEffect, useState } from 'react';
import { obtenerFisuras } from '@/lib/api';
import ModalDetalleFisura from './ModalDetalleFisura';

/* ──────────────────────────────────────────────────────────────────
   TablaHistorial
   Displays a table of all detected fissures with a detail modal trigger.
   ────────────────────────────────────────────────────────────────── */

export default function TablaHistorial() {
  const [fisuras, setFisuras] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [selectedId, setSelectedId] = useState(null);

  useEffect(() => {
    let mounted = true;

    async function fetchData() {
      try {
        const data = await obtenerFisuras();
        if (mounted) setFisuras(data);
      } catch {
        if (mounted) setError(true);
      } finally {
        if (mounted) setLoading(false);
      }
    }

    fetchData();
    return () => {
      mounted = false;
    };
  }, []);

  if (loading) {
    return (
      <div className="flex h-48 items-center justify-center rounded-xl border border-dark-border bg-dark-surface">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-dark-accent border-t-transparent" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-48 items-center justify-center rounded-xl border border-dark-border bg-dark-surface">
        <p className="text-sm text-dark-secondary">
          No se pudieron cargar los datos. Verifica la conexión con el servidor.
        </p>
      </div>
    );
  }

  if (fisuras.length === 0) {
    return (
      <div className="flex h-48 items-center justify-center rounded-xl border border-dashed border-dark-border bg-dark-surface">
        <p className="text-sm text-dark-secondary">
          No hay fisuras registradas aún.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="overflow-x-auto rounded-xl border border-dark-border bg-dark-surface">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-dark-border bg-dark-primary text-xs font-semibold uppercase tracking-wider text-dark-secondary">
              <th className="px-4 py-3">ID</th>
              <th className="px-4 py-3">ROI</th>
              <th className="px-4 py-3">Fecha Detección</th>
              <th className="px-4 py-3">Largo (mm)</th>
              <th className="px-4 py-3">Ancho (mm)</th>
              <th className="px-4 py-3">Velocidad (mm/día)</th>
              <th className="px-4 py-3">Δ%</th>
              <th className="px-4 py-3">Estado</th>
              <th className="px-4 py-3">Acción</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-dark-border">
            {fisuras.map((f) => {
              const deltaNum = f.delta_porcentaje ?? 0;
              const delta = deltaNum.toFixed(1);
              const isCritical = f.es_critica === true;

              return (
                <tr
                  key={f.id}
                  className={`transition-colors hover:bg-dark-hover ${
                    isCritical ? 'bg-dark-danger/5' : ''
                  }`}
                >
                  <td className="px-4 py-3 font-mono text-xs text-dark-text">
                    #{f.id}
                  </td>
                  <td className="px-4 py-3 font-medium text-dark-text">
                    {f.roi_id}
                  </td>
                  <td className="px-4 py-3 text-dark-secondary">
                    {new Date(f.fecha_deteccion).toLocaleDateString('es-ES', {
                      day: '2-digit',
                      month: 'short',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </td>
                  <td className="px-4 py-3 font-mono text-dark-text">
                    {f.largo_mm.toFixed(1)}
                  </td>
                  <td className="px-4 py-3 font-mono text-dark-text">
                    {f.ancho_mm.toFixed(2)}
                  </td>
                  <td className="px-4 py-3 font-mono">
                    {f.velocidad_mm_day != null ? (
                      <span
                        className={`font-semibold ${
                          f.velocidad_mm_day > 2.0
                            ? 'text-dark-danger'
                            : f.velocidad_mm_day > 0.5
                            ? 'text-dark-warning'
                            : 'text-dark-text'
                        }`}
                      >
                        {f.velocidad_mm_day.toFixed(2)}
                      </span>
                    ) : (
                      <span className="text-dark-secondary">—</span>
                    )}
                  </td>
                  <td
                    className={`px-4 py-3 font-mono font-semibold ${
                      isCritical ? 'text-dark-danger' : 'text-dark-accent'
                    }`}
                  >
                    {delta}%
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                        isCritical
                          ? 'bg-dark-danger/15 text-dark-danger'
                          : 'bg-dark-accent/15 text-dark-accent'
                      }`}
                    >
                      {isCritical ? 'Crítico' : 'Estable'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => setSelectedId(f.id)}
                      className="rounded-md bg-dark-accent/10 px-3 py-1.5 text-xs font-semibold text-dark-accent transition-colors hover:bg-dark-accent/20"
                    >
                      Ver detalle
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Detail modal */}
      {selectedId && (
        <ModalDetalleFisura
          fisuraId={selectedId}
          onClose={() => setSelectedId(null)}
        />
      )}
    </>
  );
}

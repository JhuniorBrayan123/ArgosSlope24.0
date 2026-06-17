'use client';

import { useEffect, useState } from 'react';
import { actualizarConfiguracion, obtenerConfiguracion } from '@/lib/api';

/* ──────────────────────────────────────────────────────────────────
   FormularioConfig
   Editable configuration form for robot parameters.
   ────────────────────────────────────────────────────────────────── */

const CAMPOS = [
  {
    clave: 'distancia_focal_mm',
    label: 'Distancia Focal (f)',
    unidad: 'mm',
    descripcion:
      'Distancia focal de la cámara utilizada para el cálculo de deformación. Este valor se usa en la fórmula D_real = D_px × (Z / f).',
    placeholder: 'Ej: 50',
  },
  {
    clave: 'distancia_sensor_z_mm',
    label: 'Distancia Sensor-Talud (Z)',
    unidad: 'mm',
    descripcion:
      'Distancia desde la cámara hasta la superficie del talud. Afecta directamente la conversión de píxeles a milímetros.',
    placeholder: 'Ej: 10000',
  },
  {
    clave: 'umbral_delta_critico',
    label: 'Umbral Δ Crítico',
    unidad: '%',
    descripcion:
      'Porcentaje de crecimiento (Δ) entre mediciones consecutivas que dispara una alerta crítica en el dashboard.',
    placeholder: 'Ej: 5.0',
  },
  {
    clave: 'tamano_minimo_bloque_rqd_cm',
    label: 'Tamaño Mínimo Bloque RQD',
    unidad: 'cm',
    descripcion:
      'Longitud mínima que debe tener un bloque intacto de testigo para ser contabilizado en el cálculo de RQD.',
    placeholder: 'Ej: 10',
  },
];

export default function FormularioConfig() {
  const [values, setValues] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState(null); // 'ok' | 'error' | null
  const [error, setError] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function fetchData() {
      try {
        const config = await obtenerConfiguracion();
        if (!mounted) return;
        const map = {};
        config.forEach((entry) => {
          map[entry.clave] = entry.valor;
        });
        setValues(map);
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

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    setFeedback(null);

    try {
      for (const campo of CAMPOS) {
        const val = values[campo.clave]?.trim();
        if (val !== undefined && val !== '') {
          await actualizarConfiguracion(campo.clave, val);
        }
      }
      setFeedback('ok');
    } catch {
      setFeedback('error');
    } finally {
      setSaving(false);
    }
  }

  function handleChange(clave, value) {
    setValues((prev) => ({ ...prev, [clave]: value }));
  }

  if (loading) {
    return (
      <div className="flex h-48 items-center justify-center rounded-xl border border-dark-border bg-dark-surface">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-dark-accent border-t-transparent" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-48 items-center justify-center rounded-xl border border-dashed border-dark-border bg-dark-surface">
        <p className="text-sm text-dark-secondary">
          No se pudo cargar la configuración. Verifica la conexión con el servidor.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSave} className="space-y-6">
      {CAMPOS.map((campo) => (
        <div
          key={campo.clave}
          className="rounded-xl border border-dark-border bg-dark-surface p-5"
        >
          <div className="mb-1 flex items-center gap-2">
            <label
              htmlFor={campo.clave}
              className="text-sm font-semibold text-dark-text"
            >
              {campo.label}
            </label>
            <span className="rounded bg-dark-hover px-1.5 py-0.5 text-[10px] font-mono text-dark-secondary">
              {campo.unidad}
            </span>
          </div>

          <p className="mb-3 text-xs leading-relaxed text-dark-secondary">
            {campo.descripcion}
          </p>

          <input
            id={campo.clave}
            type="text"
            value={values[campo.clave] || ''}
            onChange={(e) => handleChange(campo.clave, e.target.value)}
            placeholder={campo.placeholder}
            className="w-full rounded-lg border border-dark-border bg-dark-primary px-4 py-2.5 text-sm text-dark-text placeholder-dark-secondary/50 outline-none transition-colors focus:border-dark-accent focus:ring-1 focus:ring-dark-accent"
          />
        </div>
      ))}

      {/* Feedback */}
      {feedback === 'ok' && (
        <div className="rounded-lg border border-dark-accent/30 bg-dark-accent/10 px-4 py-3 text-sm text-dark-accent">
          ✅ Configuración guardada correctamente.
        </div>
      )}
      {feedback === 'error' && (
        <div className="rounded-lg border border-dark-danger/30 bg-dark-danger/10 px-4 py-3 text-sm text-dark-danger">
          ❌ Error al guardar la configuración. Intenta nuevamente.
        </div>
      )}

      {/* Save button */}
      <div className="flex justify-end">
        <button
          type="submit"
          disabled={saving}
          className="flex items-center gap-2 rounded-lg bg-dark-accent px-6 py-2.5 text-sm font-semibold text-dark-primary transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving && (
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-dark-primary border-t-transparent" />
          )}
          {saving ? 'Guardando...' : 'Guardar Configuración'}
        </button>
      </div>
    </form>
  );
}

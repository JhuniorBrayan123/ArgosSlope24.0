'use client';

/**
 * ARGOS SLOPE 4.0 — FissureForm.
 *
 * Modal form for creating / editing a fissure.
 * Fields: ROI ID, Tipo, Orientación, Coordenadas (JSON), Largo, Ancho, Área.
 * Validation: ROI ID required, dimensions must be positive.
 * Uses fissure.store.createFissure / updateFissure.
 */

import { useEffect, useState, useCallback } from 'react';
import { useFissureStore } from '@/stores/fissure.store';
import type { FisuraResponse } from '@/services/api-client';

// ── Form field types ─────────────────────────────────────────────────
interface FormData {
  roiId: string;
  tipo: string;
  orientacion: string;
  coordenadas: string;
  largoMm: string;
  anchoMm: string;
  areaMm2: string;
}

// ── Initial form state ───────────────────────────────────────────────
const EMPTY_FORM: FormData = {
  roiId: '',
  tipo: '',
  orientacion: '',
  coordenadas: '',
  largoMm: '',
  anchoMm: '',
  areaMm2: '',
};

// ── Validation errors ────────────────────────────────────────────────
interface ValidationErrors {
  roiId?: string;
  tipo?: string;
  orientacion?: string;
  coordenadas?: string;
  largoMm?: string;
  anchoMm?: string;
  areaMm2?: string;
}

// ── Tipos predefinidos ───────────────────────────────────────────────
const TIPO_OPTIONS = [
  'Longitudinal',
  'Transversal',
  'Diagonal',
  'Vertical',
  'Horizontal',
  'Superficial',
  'Estructural',
];

const ORIENTACION_OPTIONS = [
  'N-S',
  'E-O',
  'NE-SO',
  'NO-SE',
  'N-S, E-O',
];

// ====================================================================
// FissureForm
// ====================================================================

interface FissureFormProps {
  /** Existing fissure for edit mode, or null for create mode */
  existingFissure?: FisuraResponse | null;
  onClose: () => void;
  onSuccess?: () => void;
}

export default function FissureForm({
  existingFissure,
  onClose,
  onSuccess,
}: FissureFormProps) {
  const { createFissure, updateFissure, loading } = useFissureStore();

  const isEdit = !!existingFissure;

  // ── Form state ─────────────────────────────────────────────────
  const [form, setForm] = useState<FormData>(EMPTY_FORM);
  const [errors, setErrors] = useState<ValidationErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [showCoordsHelp, setShowCoordsHelp] = useState(false);

  // ── Pre-fill for edit mode ─────────────────────────────────────
  useEffect(() => {
    if (existingFissure) {
      setForm({
        roiId: existingFissure.roiId || '',
        tipo: existingFissure.tipo || '',
        orientacion: existingFissure.orientacion || '',
        coordenadas: existingFissure.coordenadas || '',
        largoMm: String(existingFissure.largoMm || ''),
        anchoMm: String(existingFissure.anchoMm || ''),
        areaMm2: String(existingFissure.areaMm2 || ''),
      });
    }
  }, [existingFissure]);

  // ── Close on Escape ────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  // ── Field change handler ───────────────────────────────────────
  const handleChange = useCallback(
    (field: keyof FormData, value: string) => {
      setForm((prev) => ({ ...prev, [field]: value }));
      // Clear field error on change
      if (errors[field]) {
        setErrors((prev) => ({ ...prev, [field]: undefined }));
      }
    },
    [errors]
  );

  // ── Validation ─────────────────────────────────────────────────
  const validate = useCallback((): ValidationErrors => {
    const errs: ValidationErrors = {};
    if (!form.roiId.trim()) {
      errs.roiId = 'ROI ID es requerido';
    }
    if (!form.tipo.trim()) {
      errs.tipo = 'Tipo es requerido';
    }
    if (!form.orientacion.trim()) {
      errs.orientacion = 'Orientación es requerida';
    }
    if (form.coordenadas.trim()) {
      try {
        JSON.parse(form.coordenadas);
      } catch {
        errs.coordenadas = 'Coordenadas deben ser JSON válido';
      }
    }
    const largo = parseFloat(form.largoMm);
    if (isNaN(largo) || largo <= 0) {
      errs.largoMm = 'Debe ser un número positivo';
    }
    const ancho = parseFloat(form.anchoMm);
    if (isNaN(ancho) || ancho <= 0) {
      errs.anchoMm = 'Debe ser un número positivo';
    }
    if (form.areaMm2.trim()) {
      const area = parseFloat(form.areaMm2);
      if (isNaN(area) || area <= 0) {
        errs.areaMm2 = 'Debe ser un número positivo';
      }
    }
    return errs;
  }, [form]);

  // ── Submit handler ─────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);

    const validationErrors = validate();
    setErrors(validationErrors);
    if (Object.keys(validationErrors).length > 0) return;

    setSubmitLoading(true);
    try {
      const data = {
        roiId: form.roiId.trim(),
        tipo: form.tipo.trim(),
        orientacion: form.orientacion.trim(),
        coordenadas: form.coordenadas.trim() || undefined,
        largoMm: parseFloat(form.largoMm),
        anchoMm: parseFloat(form.anchoMm),
        areaMm2: form.areaMm2.trim() ? parseFloat(form.areaMm2) : 0,
      };

      if (isEdit && existingFissure) {
        await updateFissure(existingFissure.id, data);
      } else {
        await createFissure(data);
      }
      onSuccess?.();
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error al guardar fisura';
      setSubmitError(msg);
    } finally {
      setSubmitLoading(false);
    }
  };

  // ── Input styling helper ───────────────────────────────────────
  const inputClass = (field: keyof ValidationErrors) =>
    `w-full rounded-lg border py-2 px-3 text-sm bg-dark-primary text-dark-text placeholder:text-dark-secondary focus:outline-none transition-colors ${
      errors[field]
        ? 'border-dark-danger'
        : 'border-dark-border focus:border-dark-accent'
    }`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="mx-4 w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl border border-dark-border bg-dark-surface p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Header ─────────────────────────────────────────────── */}
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-xl font-bold text-dark-text">
            {isEdit ? 'Editar Fisura' : 'Nueva Fisura'}
          </h2>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-dark-secondary transition-colors hover:bg-dark-hover hover:text-dark-text"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* ── Form ────────────────────────────────────────────────── */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* ROI ID */}
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-dark-secondary">
              ROI ID <span className="text-dark-danger">*</span>
            </label>
            <input
              type="text"
              value={form.roiId}
              onChange={(e) => handleChange('roiId', e.target.value)}
              placeholder="Ej: ROI-001"
              className={inputClass('roiId')}
            />
            {errors.roiId && (
              <p className="mt-1 text-xs text-dark-danger">{errors.roiId}</p>
            )}
          </div>

          {/* Tipo */}
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-dark-secondary">
              Tipo <span className="text-dark-danger">*</span>
            </label>
            <select
              value={form.tipo}
              onChange={(e) => handleChange('tipo', e.target.value)}
              className={inputClass('tipo')}
            >
              <option value="">Seleccionar tipo…</option>
              {TIPO_OPTIONS.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            {errors.tipo && (
              <p className="mt-1 text-xs text-dark-danger">{errors.tipo}</p>
            )}
          </div>

          {/* Orientación */}
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-dark-secondary">
              Orientación <span className="text-dark-danger">*</span>
            </label>
            <select
              value={form.orientacion}
              onChange={(e) => handleChange('orientacion', e.target.value)}
              className={inputClass('orientacion')}
            >
              <option value="">Seleccionar orientación…</option>
              {ORIENTACION_OPTIONS.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
            {errors.orientacion && (
              <p className="mt-1 text-xs text-dark-danger">{errors.orientacion}</p>
            )}
          </div>

          {/* Coordenadas */}
          <div>
            <div className="mb-1 flex items-center justify-between">
              <label className="text-xs font-semibold uppercase tracking-wider text-dark-secondary">
                Coordenadas (JSON)
              </label>
              <button
                type="button"
                onClick={() => setShowCoordsHelp(!showCoordsHelp)}
                className="text-[11px] text-dark-accent hover:underline"
              >
                {showCoordsHelp ? 'Ocultar ayuda' : '¿Formato?'}
              </button>
            </div>
            <textarea
              value={form.coordenadas}
              onChange={(e) => handleChange('coordenadas', e.target.value)}
              placeholder='[{"x": 10, "y": 20, "z": 5}]'
              rows={3}
              className={inputClass('coordenadas')}
            />
            {showCoordsHelp && (
              <div className="mt-1 rounded-lg bg-dark-primary p-2">
                <p className="text-[11px] text-dark-secondary">
                  Formato: array de objetos con coordenadas x, y, z. Ejemplo:
                </p>
                <pre className="mt-1 overflow-x-auto text-[11px] text-dark-accent">
{`[
  {"x": 12.5, "y": 8.3, "z": 15.0},
  {"x": 14.2, "y": 9.1, "z": 14.8}
]`}
                </pre>
              </div>
            )}
            {errors.coordenadas && (
              <p className="mt-1 text-xs text-dark-danger">{errors.coordenadas}</p>
            )}
          </div>

          {/* Dimensions row */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-dark-secondary">
                Largo (mm) <span className="text-dark-danger">*</span>
              </label>
              <input
                type="number"
                step="0.1"
                min="0"
                value={form.largoMm}
                onChange={(e) => handleChange('largoMm', e.target.value)}
                placeholder="0.0"
                className={inputClass('largoMm')}
              />
              {errors.largoMm && (
                <p className="mt-1 text-xs text-dark-danger">{errors.largoMm}</p>
              )}
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-dark-secondary">
                Ancho (mm) <span className="text-dark-danger">*</span>
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={form.anchoMm}
                onChange={(e) => handleChange('anchoMm', e.target.value)}
                placeholder="0.00"
                className={inputClass('anchoMm')}
              />
              {errors.anchoMm && (
                <p className="mt-1 text-xs text-dark-danger">{errors.anchoMm}</p>
              )}
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-dark-secondary">
                Área (mm²)
              </label>
              <input
                type="number"
                step="0.1"
                min="0"
                value={form.areaMm2}
                onChange={(e) => handleChange('areaMm2', e.target.value)}
                placeholder="0.0"
                className={inputClass('areaMm2')}
              />
              {errors.areaMm2 && (
                <p className="mt-1 text-xs text-dark-danger">{errors.areaMm2}</p>
              )}
            </div>
          </div>

          {/* Submit error */}
          {submitError && (
            <div className="rounded-lg bg-dark-danger/10 p-3">
              <p className="text-xs text-dark-danger">{submitError}</p>
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg bg-dark-hover px-5 py-2 text-sm font-semibold text-dark-secondary transition-colors hover:text-dark-text"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={submitLoading || loading}
              className="flex items-center gap-2 rounded-lg bg-dark-accent px-5 py-2 text-sm font-semibold text-dark-primary transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {submitLoading ? (
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-dark-primary border-t-transparent" />
              ) : null}
              {isEdit ? 'Guardar Cambios' : 'Crear Fisura'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

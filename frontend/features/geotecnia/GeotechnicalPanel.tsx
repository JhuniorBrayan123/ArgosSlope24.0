'use client';

/**
 * ARGOS SLOPE 4.0 — GeotechnicalPanel.
 *
 * Geotechnical calculators in a 3-column grid:
 *   - RQD Calculator (Rock Quality Designation)
 *   - Deformation Calculator (displacement analysis)
 *   - Growth Check (crack growth monitoring)
 *
 * Results history shown below the calculators.
 * Uses geotechnical.store for RQD + Deformation API calls.
 * Growth check uses a local calculation for immediate feedback.
 */

import { useState, useCallback } from 'react';
import { useGeotechnicalStore } from '@/stores/geotechnical.store';
import type { RqdResult, DeformationResult, GrowthResult } from '@/services/api-client';

// ── Types ──────────────────────────────────────────────────────────────

interface LocalGrowthResult {
  maxGrowthPercent: number;
  thresholdPercent: number;
  exceededThreshold: boolean;
  trendDirection: 'incrementando' | 'decrementando' | 'estable';
  totalMeasurements: number;
  values: number[];
}

interface CalcHistoryEntry {
  id: number;
  type: 'rqd' | 'deformation' | 'growth';
  label: string;
  timestamp: string;
}

// ── Helpers ────────────────────────────────────────────────────────────

function classifyRqd(rqd: number): string {
  if (rqd >= 90) return 'Excelente';
  if (rqd >= 75) return 'Buena';
  if (rqd >= 50) return 'Regular';
  if (rqd >= 25) return 'Pobre';
  return 'Muy Pobre';
}

function classifyDeformation(rate: number): string {
  const abs = Math.abs(rate);
  if (abs < 0.1) return 'Estable';
  if (abs < 0.5) return 'Lenta';
  if (abs < 2.0) return 'Moderada';
  if (abs < 10.0) return 'Rápida';
  return 'Muy Rápida';
}

function parseCommaNumbers(input: string): number[] {
  return input
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .map(Number)
    .filter((n) => !isNaN(n) && n > 0);
}

function localCheckGrowth(measurements: number[], thresholdPercent: number): LocalGrowthResult {
  if (measurements.length < 2) {
    return {
      maxGrowthPercent: 0,
      thresholdPercent,
      exceededThreshold: false,
      trendDirection: 'estable',
      totalMeasurements: measurements.length,
      values: measurements,
    };
  }

  // Calculate consecutive deltas
  const deltas: number[] = [];
  for (let i = 1; i < measurements.length; i++) {
    if (measurements[i - 1] === 0) continue;
    const delta = ((measurements[i] - measurements[i - 1]) / measurements[i - 1]) * 100;
    deltas.push(delta);
  }

  const maxDelta = deltas.length > 0 ? Math.max(...deltas.map(Math.abs)) : 0;
  const exceeded = maxDelta > thresholdPercent;

  // Determine trend by comparing first half vs second half averages
  const mid = Math.floor(measurements.length / 2);
  const firstHalf = measurements.slice(0, mid);
  const secondHalf = measurements.slice(mid);
  const firstAvg = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
  const secondAvg = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;

  let trendDirection: LocalGrowthResult['trendDirection'];
  if (secondAvg > firstAvg * 1.03) {
    trendDirection = 'incrementando';
  } else if (secondAvg < firstAvg * 0.97) {
    trendDirection = 'decrementando';
  } else {
    trendDirection = 'estable';
  }

  return {
    maxGrowthPercent: maxDelta,
    thresholdPercent,
    exceededThreshold: exceeded,
    trendDirection,
    totalMeasurements: measurements.length,
    values: measurements,
  };
}

function formatTimestamp(): string {
  return new Date().toLocaleString('es-ES', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// ── GeotechnicalPanel ──────────────────────────────────────────────────

export default function GeotechnicalPanel() {
  // Store
  const {
    rqdResult,
    deformationResult,
    growthResult: storeGrowthResult,
    loading,
    error,
    calculateRqd,
    calculateDeformation,
  } = useGeotechnicalStore();

  // ── RQD state ─────────────────────────────────────────────────────
  const [rqdPieces, setRqdPieces] = useState('');
  const [rqdCoreLength, setRqdCoreLength] = useState('');
  const [rqdMinBlock, setRqdMinBlock] = useState('');
  const [localRqdResult, setLocalRqdResult] = useState<RqdResult | null>(null);

  // ── Deformation state ─────────────────────────────────────────────
  const [defDisplacement, setDefDisplacement] = useState('');
  const [defDays, setDefDays] = useState('');
  const [defDistanceZ, setDefDistanceZ] = useState('');
  const [defFocal, setDefFocal] = useState('');
  const [localDefResult, setLocalDefResult] = useState<DeformationResult | null>(null);

  // ── Growth state ──────────────────────────────────────────────────
  const [growthMeasurements, setGrowthMeasurements] = useState('');
  const [growthThreshold, setGrowthThreshold] = useState('');
  const [localGrowthResult, setLocalGrowthResult] = useState<LocalGrowthResult | null>(null);

  // ── History ───────────────────────────────────────────────────────
  const [history, setHistory] = useState<CalcHistoryEntry[]>([]);
  const [historyCounter, setHistoryCounter] = useState(0);

  // ── Handlers ──────────────────────────────────────────────────────

  const handleCalcRqd = useCallback(async () => {
    const pieces = parseCommaNumbers(rqdPieces);
    if (pieces.length === 0) return;
    const coreLen = parseFloat(rqdCoreLength);
    if (isNaN(coreLen) || coreLen <= 0) return;

    try {
      await calculateRqd({
        pieceLengthsCm: pieces,
        coreLengthM: coreLen,
        minBlockCm: rqdMinBlock ? parseFloat(rqdMinBlock) : undefined,
      });
    } catch {
      // Fallback local calculation (when backend is unavailable)
      const totalPieces = pieces.reduce((a, b) => a + b, 0);
      const piecesAbove10 = pieces.filter((p) => p >= 10);
      const sumAbove10 = piecesAbove10.reduce((a, b) => a + b, 0);
      const coreLenCm = coreLen * 100;
      const rqd = coreLenCm > 0 ? (sumAbove10 / coreLenCm) * 100 : 0;
      const result: RqdResult = {
        rqd: Math.min(100, Math.round(rqd * 100) / 100),
        classification: classifyRqd(rqd),
      };
      setLocalRqdResult(result);
    }

    setHistoryCounter((c) => c + 1);
    setHistory((prev) => [
      { id: historyCounter + 1, type: 'rqd', label: `RQD — ${pieces.length} piezas, ${coreLen}m`, timestamp: formatTimestamp() },
      ...prev,
    ]);
  }, [rqdPieces, rqdCoreLength, rqdMinBlock, calculateRqd, historyCounter]);

  const handleCalcDeformation = useCallback(async () => {
    const displacement = parseFloat(defDisplacement);
    const days = parseFloat(defDays);
    const z = parseFloat(defDistanceZ);
    const f = parseFloat(defFocal);
    if ([displacement, days, z, f].some((v) => isNaN(v) || v <= 0)) return;

    try {
      await calculateDeformation({
        displacementPx: displacement,
        daysElapsed: days,
        zMeters: z,
        fMm: f,
      });
    } catch {
      // Fallback local calculation
      const deformationMm = (displacement * z) / (f * 1000);
      const rate = days > 0 ? deformationMm / days : 0;
      const result: DeformationResult = {
        deformationMm: Math.round(deformationMm * 10000) / 10000,
        rateMmPerDay: Math.round(rate * 10000) / 10000,
        status: classifyDeformation(rate),
      };
      setLocalDefResult(result);
    }

    setHistoryCounter((c) => c + 1);
    setHistory((prev) => [
      {
        id: historyCounter + 1,
        type: 'deformation',
        label: `Deformación — ${displacement}px, ${days}d, Z=${z}m, f=${f}mm`,
        timestamp: formatTimestamp(),
      },
      ...prev,
    ]);
  }, [defDisplacement, defDays, defDistanceZ, defFocal, calculateDeformation, historyCounter]);

  const handleCalcGrowth = useCallback(() => {
    const values = parseCommaNumbers(growthMeasurements);
    if (values.length < 2) return;
    const threshold = parseFloat(growthThreshold);
    if (isNaN(threshold) || threshold <= 0) return;

    const result = localCheckGrowth(values, threshold);
    setLocalGrowthResult(result);

    setHistoryCounter((c) => c + 1);
    setHistory((prev) => [
      {
        id: historyCounter + 1,
        type: 'growth',
        label: `Crecimiento — ${values.length} mediciones, umbral ${threshold}%`,
        timestamp: formatTimestamp(),
      },
      ...prev,
    ]);
  }, [growthMeasurements, growthThreshold, historyCounter]);

  // ── Determine active results ──────────────────────────────────────
  const activeRqdResult = rqdResult ?? localRqdResult;
  const activeDefResult = deformationResult ?? localDefResult;

  return (
    <div className="space-y-6">
      {/* Calculator cards grid */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {/* ═══ RQD Calculator ═══ */}
        <RqdCard
          pieces={rqdPieces}
          onPiecesChange={setRqdPieces}
          coreLength={rqdCoreLength}
          onCoreLengthChange={setRqdCoreLength}
          minBlock={rqdMinBlock}
          onMinBlockChange={setRqdMinBlock}
          onCalculate={handleCalcRqd}
          loading={loading}
          result={activeRqdResult}
        />

        {/* ═══ Deformation Calculator ═══ */}
        <DeformationCard
          displacement={defDisplacement}
          onDisplacementChange={setDefDisplacement}
          days={defDays}
          onDaysChange={setDefDays}
          distanceZ={defDistanceZ}
          onDistanceZChange={setDefDistanceZ}
          focal={defFocal}
          onFocalChange={setDefFocal}
          onCalculate={handleCalcDeformation}
          loading={loading}
          result={activeDefResult}
        />

        {/* ═══ Growth Check ═══ */}
        <GrowthCard
          measurements={growthMeasurements}
          onMeasurementsChange={setGrowthMeasurements}
          threshold={growthThreshold}
          onThresholdChange={setGrowthThreshold}
          onCalculate={handleCalcGrowth}
          result={localGrowthResult}
        />
      </div>

      {/* ── Error state ── */}
      {error && (
        <div className="rounded-lg border border-dark-danger/30 bg-dark-danger/5 p-4">
          <p className="text-sm text-dark-danger">{error}</p>
        </div>
      )}

      {/* ── Results History ── */}
      {history.length > 0 && (
        <div className="rounded-xl border border-dark-border bg-dark-surface p-6">
          <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-dark-secondary">
            Historial de Cálculos
          </h3>
          <div className="space-y-2">
            {history.map((entry) => (
              <div
                key={entry.id}
                className="flex items-center justify-between rounded-lg border border-dark-border bg-dark-primary/50 px-4 py-2.5"
              >
                <div className="flex items-center gap-3">
                  <TypeBadge type={entry.type} />
                  <span className="text-sm text-dark-text">{entry.label}</span>
                </div>
                <span className="text-[11px] text-dark-secondary">{entry.timestamp}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Type Badge ─────────────────────────────────────────────────────────

function TypeBadge({ type }: { type: string }) {
  const config: Record<string, { label: string; color: string }> = {
    rqd: { label: 'RQD', color: 'bg-blue-500/15 text-blue-400 border-blue-500/30' },
    deformation: { label: 'DEF', color: 'bg-purple-500/15 text-purple-400 border-purple-500/30' },
    growth: { label: 'CREC', color: 'bg-orange-500/15 text-orange-400 border-orange-500/30' },
  };
  const c = config[type] ?? { label: type.toUpperCase(), color: 'bg-dark-accent/15 text-dark-accent border-dark-accent/20' };
  return (
    <span className={`inline-block rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${c.color}`}>
      {c.label}
    </span>
  );
}

// ── RQD Card ───────────────────────────────────────────────────────────

function RqdCard({
  pieces,
  onPiecesChange,
  coreLength,
  onCoreLengthChange,
  minBlock,
  onMinBlockChange,
  onCalculate,
  loading,
  result,
}: {
  pieces: string;
  onPiecesChange: (v: string) => void;
  coreLength: string;
  onCoreLengthChange: (v: string) => void;
  minBlock: string;
  onMinBlockChange: (v: string) => void;
  onCalculate: () => void;
  loading: boolean;
  result: RqdResult | null;
}) {
  const canCalc =
    parseCommaNumbers(pieces).length > 0 &&
    parseFloat(coreLength) > 0;

  return (
    <div className="rounded-xl border border-dark-border bg-dark-surface p-6">
      <h2 className="text-lg font-semibold text-dark-text">RQD</h2>
      <p className="mt-0.5 text-xs text-dark-secondary">Rock Quality Designation</p>

      <div className="mt-4 space-y-3">
        {/* Piece lengths */}
        <div>
          <label className="mb-1 block text-[11px] font-medium text-dark-secondary">
            Longitudes de piezas (cm)
          </label>
          <input
            type="text"
            value={pieces}
            onChange={(e) => onPiecesChange(e.target.value)}
            placeholder="ej: 15, 22, 8, 18, 5"
            className="w-full rounded-lg border border-dark-border bg-dark-primary px-3 py-2 text-sm text-dark-text placeholder-dark-secondary/50 outline-none focus:border-dark-accent"
          />
        </div>

        {/* Core length */}
        <div>
          <label className="mb-1 block text-[11px] font-medium text-dark-secondary">
            Longitud del testigo (m)
          </label>
          <input
            type="number"
            value={coreLength}
            onChange={(e) => onCoreLengthChange(e.target.value)}
            placeholder="ej: 1.5"
            step="0.1"
            min="0.1"
            className="w-full rounded-lg border border-dark-border bg-dark-primary px-3 py-2 text-sm text-dark-text placeholder-dark-secondary/50 outline-none focus:border-dark-accent"
          />
        </div>

        {/* Min block (optional) */}
        <div>
          <label className="mb-1 block text-[11px] font-medium text-dark-secondary">
            Bloque mínimo (cm) <span className="text-dark-secondary/50">— opcional</span>
          </label>
          <input
            type="number"
            value={minBlock}
            onChange={(e) => onMinBlockChange(e.target.value)}
            placeholder="ej: 10"
            step="1"
            min="1"
            className="w-full rounded-lg border border-dark-border bg-dark-primary px-3 py-2 text-sm text-dark-text placeholder-dark-secondary/50 outline-none focus:border-dark-accent"
          />
        </div>

        <button
          onClick={onCalculate}
          disabled={!canCalc || loading}
          className="w-full rounded-lg bg-dark-accent px-4 py-2 text-sm font-semibold text-dark-primary transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {loading ? 'Calculando…' : 'Calcular RQD'}
        </button>

        {/* Result */}
        {result && (
          <div className="rounded-lg border border-dark-border bg-dark-primary p-3">
            <p className="text-2xl font-bold text-dark-accent">
              {result.rqd.toFixed(1)}%
            </p>
            <p className="mt-1 text-sm font-medium text-dark-text">
              {result.classification}
            </p>
            <p className="mt-0.5 text-[11px] text-dark-secondary">
              {parseCommaNumbers(pieces).length} pieza(s) analizada(s)
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Deformation Card ───────────────────────────────────────────────────

function DeformationCard({
  displacement,
  onDisplacementChange,
  days,
  onDaysChange,
  distanceZ,
  onDistanceZChange,
  focal,
  onFocalChange,
  onCalculate,
  loading,
  result,
}: {
  displacement: string;
  onDisplacementChange: (v: string) => void;
  days: string;
  onDaysChange: (v: string) => void;
  distanceZ: string;
  onDistanceZChange: (v: string) => void;
  focal: string;
  onFocalChange: (v: string) => void;
  onCalculate: () => void;
  loading: boolean;
  result: DeformationResult | null;
}) {
  const canCalc =
    [displacement, days, distanceZ, focal].every((v) => parseFloat(v) > 0);

  return (
    <div className="rounded-xl border border-dark-border bg-dark-surface p-6">
      <h2 className="text-lg font-semibold text-dark-text">Deformación</h2>
      <p className="mt-0.5 text-xs text-dark-secondary">Análisis de deformación del talud</p>

      <div className="mt-4 space-y-3">
        <div>
          <label className="mb-1 block text-[11px] font-medium text-dark-secondary">
            Desplazamiento (px)
          </label>
          <input
            type="number"
            value={displacement}
            onChange={(e) => onDisplacementChange(e.target.value)}
            placeholder="ej: 12.5"
            step="0.1"
            min="0.1"
            className="w-full rounded-lg border border-dark-border bg-dark-primary px-3 py-2 text-sm text-dark-text placeholder-dark-secondary/50 outline-none focus:border-dark-accent"
          />
        </div>

        <div>
          <label className="mb-1 block text-[11px] font-medium text-dark-secondary">
            Días transcurridos
          </label>
          <input
            type="number"
            value={days}
            onChange={(e) => onDaysChange(e.target.value)}
            placeholder="ej: 30"
            step="1"
            min="1"
            className="w-full rounded-lg border border-dark-border bg-dark-primary px-3 py-2 text-sm text-dark-text placeholder-dark-secondary/50 outline-none focus:border-dark-accent"
          />
        </div>

        <div>
          <label className="mb-1 block text-[11px] font-medium text-dark-secondary">
            Distancia Z (m)
          </label>
          <input
            type="number"
            value={distanceZ}
            onChange={(e) => onDistanceZChange(e.target.value)}
            placeholder="ej: 50"
            step="0.1"
            min="0.1"
            className="w-full rounded-lg border border-dark-border bg-dark-primary px-3 py-2 text-sm text-dark-text placeholder-dark-secondary/50 outline-none focus:border-dark-accent"
          />
        </div>

        <div>
          <label className="mb-1 block text-[11px] font-medium text-dark-secondary">
            Distancia focal (mm)
          </label>
          <input
            type="number"
            value={focal}
            onChange={(e) => onFocalChange(e.target.value)}
            placeholder="ej: 35"
            step="1"
            min="1"
            className="w-full rounded-lg border border-dark-border bg-dark-primary px-3 py-2 text-sm text-dark-text placeholder-dark-secondary/50 outline-none focus:border-dark-accent"
          />
        </div>

        <button
          onClick={onCalculate}
          disabled={!canCalc || loading}
          className="w-full rounded-lg bg-dark-accent px-4 py-2 text-sm font-semibold text-dark-primary transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {loading ? 'Calculando…' : 'Calcular Deformación'}
        </button>

        {/* Result */}
        {result && (
          <div className="rounded-lg border border-dark-border bg-dark-primary p-3 space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-dark-secondary">Deformación</span>
              <span className="text-sm font-bold text-dark-text">
                {result.deformationMm.toFixed(4)} mm
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-dark-secondary">Velocidad</span>
              <span className="text-sm font-bold text-dark-text">
                {result.rateMmPerDay.toFixed(4)} mm/día
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-dark-secondary">Clasificación</span>
              <span
                className={`text-sm font-bold ${
                  result.status === 'Estable'
                    ? 'text-green-400'
                    : result.status === 'Lenta'
                    ? 'text-dark-warning'
                    : 'text-dark-danger'
                }`}
              >
                {result.status}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Growth Card ────────────────────────────────────────────────────────

function GrowthCard({
  measurements,
  onMeasurementsChange,
  threshold,
  onThresholdChange,
  onCalculate,
  result,
}: {
  measurements: string;
  onMeasurementsChange: (v: string) => void;
  threshold: string;
  onThresholdChange: (v: string) => void;
  onCalculate: () => void;
  result: LocalGrowthResult | null;
}) {
  const values = parseCommaNumbers(measurements);
  const canCalc = values.length >= 2 && parseFloat(threshold) > 0;

  return (
    <div className="rounded-xl border border-dark-border bg-dark-surface p-6">
      <h2 className="text-lg font-semibold text-dark-text">Crecimiento</h2>
      <p className="mt-0.5 text-xs text-dark-secondary">Verificación de crecimiento de fisuras</p>

      <div className="mt-4 space-y-3">
        <div>
          <label className="mb-1 block text-[11px] font-medium text-dark-secondary">
            Mediciones (mm)
          </label>
          <input
            type="text"
            value={measurements}
            onChange={(e) => onMeasurementsChange(e.target.value)}
            placeholder="ej: 1.0, 1.2, 1.5, 1.8, 2.2"
            className="w-full rounded-lg border border-dark-border bg-dark-primary px-3 py-2 text-sm text-dark-text placeholder-dark-secondary/50 outline-none focus:border-dark-accent"
          />
          <p className="mt-0.5 text-[10px] text-dark-secondary">
            Valores separados por coma en orden cronológico
          </p>
        </div>

        <div>
          <label className="mb-1 block text-[11px] font-medium text-dark-secondary">
            Umbral de crecimiento (%)
          </label>
          <input
            type="number"
            value={threshold}
            onChange={(e) => onThresholdChange(e.target.value)}
            placeholder="ej: 20"
            step="1"
            min="0.1"
            className="w-full rounded-lg border border-dark-border bg-dark-primary px-3 py-2 text-sm text-dark-text placeholder-dark-secondary/50 outline-none focus:border-dark-accent"
          />
        </div>

        <button
          onClick={onCalculate}
          disabled={!canCalc}
          className="w-full rounded-lg bg-dark-accent px-4 py-2 text-sm font-semibold text-dark-primary transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          Verificar Crecimiento
        </button>

        {/* Result */}
        {result && result.totalMeasurements < 2 && (
          <div className="rounded-lg border border-dark-border bg-dark-primary p-3">
            <p className="text-sm text-dark-secondary">Se requieren al menos 2 mediciones.</p>
          </div>
        )}

        {result && result.totalMeasurements >= 2 && (
          <div className="rounded-lg border border-dark-border bg-dark-primary p-3 space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-dark-secondary">Crecimiento máx.</span>
              <span className="text-sm font-bold text-dark-text">
                {result.maxGrowthPercent.toFixed(2)}%
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-dark-secondary">Umbral</span>
              <span className="text-sm font-bold text-dark-text">
                {result.thresholdPercent}%
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-dark-secondary">Estado</span>
              <span
                className={`text-sm font-bold ${
                  result.exceededThreshold ? 'text-dark-danger' : 'text-green-400'
                }`}
              >
                {result.exceededThreshold ? '⚠ Umbral superado' : '✓ Dentro del umbral'}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-dark-secondary">Tendencia</span>
              <span
                className={`text-sm font-bold ${
                  result.trendDirection === 'incrementando'
                    ? 'text-dark-danger'
                    : result.trendDirection === 'decrementando'
                    ? 'text-green-400'
                    : 'text-dark-warning'
                }`}
              >
                {result.trendDirection === 'incrementando' && '↗ Incrementando'}
                {result.trendDirection === 'decrementando' && '↘ Decrementando'}
                {result.trendDirection === 'estable' && '→ Estable'}
              </span>
            </div>
            <p className="text-[10px] text-dark-secondary">
              {result.totalMeasurements} medición(es) analizada(s)
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

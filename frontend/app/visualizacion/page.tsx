/**
 * ARGOS SLOPE 4.0 — Visualización 3D del Talud (datos reales).
 *
 * UNIFICA dos fuentes:
 *   1. "mineria/talud/alertas" → nube de puntos real (MiDaS)
 *   2. "argos/+/fisura"       → fisuras 2D convertidas a 3D estimado
 *
 * Modos:
 *   A. "En Vivo"   — Consume datos de MQTT en tiempo real
 *   B. "Historial"  — Consulta snapshots desde backend .NET
 *   C. "Comparar"   — Compara dos snapshots reales
 *
 * NEXT_PUBLIC_DEMO_3D=true → modo demo activo (banner visible, datos ejemplo)
 * NEXT_PUBLIC_DEMO_3D=false → solo datos reales del Edge
 */

'use client';

import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import useDatos3D from '@/hooks/useDatos3D';
import { useMonitoringStore } from '@/stores/monitoring.store';
import snapshotsService from '@/services/snapshots.service';
import type {
  Snapshot3DPayload,
  PointCloudPoint,
  Crack3D,
  Snapshot3D,
  SnapshotComparison,
  Mesh3D,
} from '@/services/pointcloud.types';

// ── Feature flag ──────────────────────────────────────────────────────

const IS_DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_3D === 'true';

// ── Dynamic import del visor 3D (ssr: false) ──────────────────────────

const NubePuntos3D = dynamic(
  () => import('@/components/NubePuntos3D'),
  { ssr: false }
);

const Vista2DTalud = dynamic(
  () => import('@/components/Vista2DTalud'),
  { ssr: false }
);

// ── Modos de visualización ─────────────────────────────────────────────

type ViewMode = 'live' | 'history' | 'compare';

const MODE_LABELS: Record<ViewMode, string> = {
  live:    'En Vivo',
  history: 'Historial',
  compare: 'Comparar',
};

// ── Data Source Badge ──────────────────────────────────────────────────

type DataSource = 'mesh-3d' | 'pointcloud-3d' | 'cracks-2d' | 'reconstruction-2d' | 'history' | 'demo' | 'no-data';

const SOURCE_CONFIG: Record<DataSource, { label: string; color: string }> = {
  'mesh-3d': {
    label: '● Reconstrucción 3D real (malla + textura)',
    color: 'bg-emerald-500/15 text-emerald-400',
  },
  'pointcloud-3d': {
    label: '● Nube de puntos (sin malla aún)',
    color: 'bg-amber-500/15 text-amber-400',
  },
  'cracks-2d': {
    label: '● Solo fisuras (sin reconstrucción 3D)',
    color: 'bg-amber-500/15 text-amber-400',
  },
  'reconstruction-2d': {
    label: '● Vista 2D (Calidad 3D insuficiente)',
    color: 'bg-orange-500/15 text-orange-400',
  },
  history: {
    label: '● Snapshot histórico',
    color: 'bg-blue-500/15 text-blue-400',
  },
  demo: {
    label: '⚠ Modo Demo — Sin datos reales',
    color: 'bg-amber-500/15 text-amber-500 font-bold',
  },
  'no-data': {
    label: 'Sin datos disponibles',
    color: 'bg-gray-500/15 text-gray-400',
  },
};

function DataSourceBadge({ source }: { source: DataSource }) {
  const cfg = SOURCE_CONFIG[source];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-medium ${cfg.color}`}
    >
      {cfg.label}
    </span>
  );
}

// ── Empty State ────────────────────────────────────────────────────────

function EmptyState({ mode, message }: { mode: ViewMode; message?: string }) {
  return (
    <div className="flex h-full w-full items-center justify-center rounded-xl border border-dashed border-dark-border bg-dark-primary">
      <div className="flex flex-col items-center gap-3 text-center max-w-md px-6">
        <svg
          className="h-12 w-12 text-dark-secondary/30"
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}
        >
          <path
            strokeLinecap="round" strokeLinejoin="round"
            d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4"
          />
        </svg>
        <p className="text-sm font-medium text-dark-secondary">
          {message || (
            mode === 'live'
              ? 'Esperando snapshot 3D real desde el Edge…'
              : mode === 'history'
              ? 'No hay snapshot 3D disponible en el backend'
              : 'Seleccioná dos snapshots para comparar'
          )}
        </p>
        <p className="text-[11px] text-dark-secondary/40">
          {mode === 'live' && 'Los datos aparecerán automáticamente cuando el Edge publique detecciones.'}
          {mode === 'history' && 'Asegurate de que el backend .NET esté corriendo y tenga snapshots guardados.'}
          {mode === 'compare' && 'La comparación requiere al menos dos snapshots históricos.'}
        </p>
      </div>
    </div>
  );
}

// ── Snapshot Selector ──────────────────────────────────────────────────

function SnapshotSelector({
  snapshots, selectedId, onChange, label,
}: {
  snapshots: Snapshot3D[];
  selectedId: number | null;
  onChange: (id: number | null) => void;
  label: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[11px] font-semibold uppercase tracking-wider text-dark-secondary">
        {label}
      </span>
      <select
        value={selectedId ?? ''}
        onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}
        className="rounded-lg border border-dark-border bg-dark-primary px-2 py-1 text-xs text-dark-text focus:border-dark-accent focus:outline-none"
      >
        <option value="">— Seleccionar —</option>
        {snapshots.map((s) => (
          <option key={s.id} value={s.id}>
            #{s.id} · {new Date(s.captured_at).toLocaleString('es-ES')} · {s.point_count} pts
          </option>
        ))}
      </select>
    </div>
  );
}

// ── Compare Result Panel ────────────────────────────────────────────────

function ComparePanel({ comparison }: { comparison: SnapshotComparison }) {
  return (
    <div className="rounded-xl border border-dark-border bg-dark-surface p-4 grid grid-cols-3 gap-4 text-center">
      <div>
        <p className="text-2xl font-bold text-emerald-400">{comparison.new_cracks.length}</p>
        <p className="text-[11px] text-dark-secondary mt-1">Fisuras nuevas</p>
      </div>
      <div>
        <p className="text-2xl font-bold text-amber-400">{comparison.grown_cracks.length}</p>
        <p className="text-[11px] text-dark-secondary mt-1">Fisuras crecidas</p>
      </div>
      <div>
        <p className="text-2xl font-bold text-dark-secondary">{comparison.removed_cracks.length}</p>
        <p className="text-[11px] text-dark-secondary mt-1">Fisuras cerradas</p>
      </div>
      <div className="col-span-3 border-t border-dark-border pt-3">
        <p className="text-[11px] text-dark-secondary/60">
          Δ puntos: {comparison.point_count_delta >= 0 ? '+' : ''}{comparison.point_count_delta.toLocaleString()} pts
        </p>
      </div>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────

export default function VisualizacionPage() {
  // ── MQTT config desde el store persistente ─────────────────────────
  const mqttUrl  = useMonitoringStore((s) => s.mqttUrl);
  const mqttUser = useMonitoringStore((s) => s.mqttUser);
  const mqttPass = useMonitoringStore((s) => s.mqttPass);

  // ── State ─────────────────────────────────────────────────────────
  const [mode, setMode] = useState<ViewMode>('live');
  const [snapshots, setSnapshots] = useState<Snapshot3D[]>([]);
  const [historyId, setHistoryId] = useState<number | null>(null);
  const [compareA, setCompareA] = useState<number | null>(null);
  const [compareB, setCompareB] = useState<number | null>(null);
  const [historyData, setHistoryData] = useState<Snapshot3DPayload | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [comparison, setComparison] = useState<SnapshotComparison | null>(null);
  const [compareLoading, setCompareLoading] = useState(false);
  const [compareError, setCompareError] = useState<string | null>(null);

  // ── Hook unificado de datos 3D (MQTT) ────────────────────────────
  const {
    datos,
    status: mqttStatus,
    statusMessage: mqttMessage,
    error: mqttError,
  } = useDatos3D(mqttUrl, mqttUser, mqttPass);

  // ── Fetch snapshot list on mount ─────────────────────────────────
  useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        const list = await snapshotsService.list();
        if (mounted) setSnapshots(list);
      } catch {
        // Backend may not have this endpoint yet
      }
    }
    load();
    return () => { mounted = false; };
  }, []);

  // ── Fetch history snapshot when selected ─────────────────────────
  useEffect(() => {
    if (!historyId) {
      setHistoryData(null);
      return;
    }
    let mounted = true;
    setHistoryLoading(true);
    setHistoryError(null);

    async function load() {
      try {
        const snap = await snapshotsService.getById(historyId!);
        if (!mounted) return;
        // Use pre-parsed payload if available, otherwise parse JSON
        const payload: Snapshot3DPayload = snap.payload
          ? snap.payload
          : JSON.parse(snap.payload_json);
        setHistoryData(payload);
      } catch (err) {
        if (mounted) {
          setHistoryError(err instanceof Error ? err.message : 'Error al cargar snapshot');
          setHistoryData(null);
        }
      } finally {
        if (mounted) setHistoryLoading(false);
      }
    }
    load();
    return () => { mounted = false; };
  }, [historyId]);

  // ── Compare two snapshots ─────────────────────────────────────────
  useEffect(() => {
    if (!compareA || !compareB || compareA === compareB) {
      setComparison(null);
      return;
    }
    let mounted = true;
    setCompareLoading(true);
    setCompareError(null);
    setComparison(null);

    async function loadCompare() {
      try {
        const result = await snapshotsService.compare(compareA!, compareB!);
        if (mounted) setComparison(result);
      } catch (err) {
        if (mounted) {
          setCompareError(
            err instanceof Error
              ? err.message
              : 'Error al comparar snapshots. Verificá que el backend esté corriendo.'
          );
        }
      } finally {
        if (mounted) setCompareLoading(false);
      }
    }
    loadCompare();
    return () => { mounted = false; };
  }, [compareA, compareB]);

  // ── Determine what data to show ──────────────────────────────────
  const showLiveData = mode === 'live';

  // ── Convert to NubePuntos3D format ───────────────────────────────
  const mesh: Mesh3D | null = showLiveData
    ? (datos.mesh ?? null)
    : (historyData?.mesh ?? null);

  const imageBase64: string | null = showLiveData
    ? (datos.imageBase64 ?? null)
    : (historyData?.image_base64 ?? null);

  const points: PointCloudPoint[] | null = showLiveData
    ? (datos.pointCloud.length > 0 ? datos.pointCloud : null)
    : (historyData?.point_cloud && historyData.point_cloud.length > 0
        ? historyData.point_cloud
        : null);

  const cracks: Crack3D[] = showLiveData
    ? datos.cracks
    : (historyData?.cracks ?? []);

  // ── Determine data source ────────────────────────────────────────
  const dataSource: DataSource = (() => {
    if (IS_DEMO_MODE && datos.fuente === 'sin-datos' && showLiveData) {
      return 'demo';
    }
    if (showLiveData) {
      if (datos.fuente === 'mesh-3d') return 'mesh-3d';
      if (datos.fuente === 'reconstruction-2d') return 'reconstruction-2d';
      if (datos.fuente === 'pointcloud-3d') return 'pointcloud-3d';
      if (datos.fuente === 'cracks-2d') return 'cracks-2d';
      return IS_DEMO_MODE ? 'demo' : 'no-data';
    }
    if (historyData?.mesh) return 'history';
    if (historyData?.point_cloud?.length) return 'history';
    return 'no-data';
  })();

  // ── Timestamp ────────────────────────────────────────────────────
  const timestamp = showLiveData ? datos.timestamp : (historyData?.timestamp ?? null);

  // ── Build status message ─────────────────────────────────────────
  const getStatusMessage = () => {
    if (showLiveData) {
      if (IS_DEMO_MODE && dataSource === 'demo') {
        return 'Modo demo activo — activá el Edge para datos reales';
      }
      return mqttMessage;
    }
    if (historyLoading) return 'Cargando snapshot histórico…';
    if (historyError) return `Error: ${historyError}`;
    if (historyData) {
      const faces = historyData.mesh
        ? Math.floor(historyData.mesh.indices.length / 3)
        : 0;
      const pc = historyData.point_cloud?.length ?? 0;
      const c  = historyData.cracks?.length ?? 0;
      return faces > 0
        ? `Snapshot #${historyId} · ${faces} caras · ${c} fisuras`
        : `Snapshot #${historyId} · ${pc} pts · ${c} fisuras`;
    }
    return 'Seleccioná un snapshot para visualizar';
  };

  // ── Has data for viewer ───────────────────────────────────────────
  const hasMesh = mesh !== null && mesh.vertices.length >= 9;
  const hasPointCloud = points !== null && points.length > 0;
  const hasCracks     = cracks.length > 0;
  const viewerHasData = IS_DEMO_MODE || hasMesh || hasPointCloud || hasCracks;

  return (
    <div className="flex flex-col gap-4">
      {/* ── Demo mode global warning ─────────────────────────────── */}
      {IS_DEMO_MODE && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/8 px-4 py-2.5">
          <span className="text-amber-400 text-base">⚠</span>
          <div>
            <p className="text-xs font-bold text-amber-400 uppercase tracking-wider">
              Modo Demo Activo
            </p>
            <p className="text-[11px] text-amber-400/70">
              Los datos 3D mostrados son de ejemplo. Activá el Edge y desactivá{' '}
              <span className="font-mono">NEXT_PUBLIC_DEMO_3D</span> para datos reales.
            </p>
          </div>
        </div>
      )}

      {/* ── Header ──────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-dark-text">Talud 3D</h1>
            <DataSourceBadge source={dataSource} />
          </div>
          <p className="mt-1 text-sm text-dark-secondary">
            Visualización espacial y volumetría de grietas
          </p>
          <div className="mt-3 flex items-start gap-2 rounded-lg border border-orange-500/20 bg-orange-500/10 px-4 py-3 text-orange-400">
            <svg className="mt-0.5 h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
            </svg>
            <div className="text-sm">
              <span className="font-bold">Módulo Experimental:</span> La reconstrucción 3D (MiDaS) está en fase de I+D y no se garantiza precisión métrica. Para monitoreo real y confiable, dirígete a <a href="/" className="font-semibold underline hover:text-orange-300">Monitoreo 2D</a>.
            </div>
          </div>
        </div>
      </div>

      {/* ── Mode selector ───────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex rounded-lg border border-dark-border overflow-hidden">
          {(Object.keys(MODE_LABELS) as ViewMode[]).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`px-3 py-1.5 text-xs font-semibold transition-all ${
                mode === m
                  ? 'bg-dark-accent text-dark-primary'
                  : 'bg-dark-primary text-dark-secondary hover:text-dark-text'
              }`}
            >
              {MODE_LABELS[m]}
            </button>
          ))}
        </div>

        {/* History selector */}
        {mode === 'history' && snapshots.length > 0 && (
          <SnapshotSelector
            snapshots={snapshots}
            selectedId={historyId}
            onChange={setHistoryId}
            label="Snapshot:"
          />
        )}

        {/* Compare selectors */}
        {mode === 'compare' && snapshots.length >= 2 && (
          <div className="flex flex-wrap items-center gap-2">
            <SnapshotSelector
              snapshots={snapshots}
              selectedId={compareA}
              onChange={setCompareA}
              label="Snapshot A:"
            />
            <SnapshotSelector
              snapshots={snapshots}
              selectedId={compareB}
              onChange={setCompareB}
              label="Snapshot B:"
            />
          </div>
        )}

        {/* Connection status (live only) */}
        {showLiveData && mqttStatus !== 'connected' && !IS_DEMO_MODE && (
          <span className="text-[11px] text-dark-secondary/60">
            {mqttStatus === 'connecting'
              ? 'Conectando al broker MQTT…'
              : mqttStatus === 'error'
              ? `Error MQTT: ${mqttError}`
              : 'Desconectado del broker MQTT'}
          </span>
        )}
      </div>

      {/* ── Compare summary ─────────────────────────────────────── */}
      {mode === 'compare' && (
        <div>
          {!compareA || !compareB ? (
            <div className="rounded-xl border border-dark-border bg-dark-surface px-4 py-3">
              <p className="text-xs text-dark-secondary">
                {snapshots.length < 2
                  ? 'No hay suficientes snapshots para comparar. Se necesitan al menos 2.'
                  : 'Seleccioná dos snapshots distintos para ver las diferencias.'}
              </p>
            </div>
          ) : compareA === compareB ? (
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3">
              <p className="text-xs text-amber-400">Seleccioná dos snapshots diferentes.</p>
            </div>
          ) : compareLoading ? (
            <div className="rounded-xl border border-dark-border bg-dark-surface px-4 py-3 flex items-center gap-2">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-dark-accent border-t-transparent" />
              <p className="text-xs text-dark-secondary">Comparando snapshots…</p>
            </div>
          ) : compareError ? (
            <div className="rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3">
              <p className="text-xs text-red-400">{compareError}</p>
            </div>
          ) : comparison ? (
            <ComparePanel comparison={comparison} />
          ) : null}
        </div>
      )}

      {/* ── 3D Viewer ─────────────────────────────────────────────── */}
      <div
        className="relative"
        style={{ height: 'calc(100vh - 22rem)', minHeight: '460px' }}
      >
        {/* Historial vacío */}
        {mode === 'history' && !historyId && !historyLoading && (
          <EmptyState mode="history" message="Seleccioná un snapshot del historial para visualizarlo" />
        )}

        {/* Compare sin snapshots suficientes */}
        {mode === 'compare' && snapshots.length < 2 && (
          <EmptyState mode="compare" message="No hay suficientes snapshots para comparar" />
        )}

        {/* Viewer activo */}
        {(showLiveData || (mode === 'history' && (historyId !== null || historyLoading)) || (mode === 'compare' && snapshots.length >= 2)) && (
          <>
            {historyLoading ? (
              <div className="flex h-full items-center justify-center rounded-xl border border-dark-border bg-dark-primary">
                <div className="flex flex-col items-center gap-3">
                  <div className="h-8 w-8 animate-spin rounded-full border-2 border-dark-accent border-t-transparent" />
                  <p className="text-xs text-dark-secondary">Cargando snapshot…</p>
                </div>
              </div>
            ) : showLiveData && datos.fuente === 'reconstruction-2d' ? (
              <Vista2DTalud datos={datos} />
            ) : (
              <NubePuntos3D
                mesh={mode === 'compare' ? null : (hasMesh ? mesh : null)}
                imageBase64={mode === 'compare' ? null : imageBase64}
                points={mode === 'compare' ? null : (hasPointCloud ? points : [])}
                cracks={mode === 'compare' ? [] : cracks}
                height="100%"
                width="100%"
                timestamp={timestamp}
              />
            )}

            {/* Status bar */}
            <div className="mt-2 flex items-center justify-between">
              <p className="text-[11px] text-dark-secondary/60">
                {getStatusMessage()}
              </p>
              <p className="text-[10px] text-dark-secondary/40">
                Arrastrá para orbitar · Rueda para zoom
              </p>
            </div>

            {/* Info cuando solo hay fisuras 2D */}
            {showLiveData && !hasMesh && hasCracks && (
              <div className="mt-2 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2">
                <p className="text-[11px] text-amber-400/80">
                  Mostrando {cracks.length} fisura{cracks.length !== 1 ? 's' : ''} sin malla 3D.
                  La reconstrucción texturizada requiere MiDaS activo en el Edge.
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

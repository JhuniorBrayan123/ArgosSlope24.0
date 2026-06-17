/**
 * ARGOS SLOPE 4.0 — SlopeScene (Main 3D Viewer).
 *
 * Composes the 4-layer architecture:
 *   Scene (terrain) → Controls → Effects → UI (HTML overlay)
 *
 * Uses @react-three/fiber Canvas with procedurally-generated terrain,
 * orbit controls, fissure highlighting, and overlay UI components.
 * Reads/writes state from/to slope.store.
 *
 * Designed to be dynamically imported with ssr: false to avoid
 * Three.js SSR issues.
 */

'use client';

import { useEffect, useState, useCallback, useRef, Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import * as THREE from 'three';
import { FisuraResponse } from '@/services/api-client';
import fissuresService from '@/services/fissures.service';
import { useSlopeStore } from '@/stores/slope.store';

// ── Internal Scene Layers ────────────────────────────────────────────

import { createSlopeTerrain, SLOPE, INCLINACION_RAD } from './scene/terrain';
import OrbitControlsManager from './controls/OrbitControlsManager';
import FissureHighlightEffect from './effects/fissure-highlight.effect';
import HeatmapEffect from './effects/heatmap.effect';
import SceneToolbar from './ui/SceneToolbar';
import SceneLegend from './ui/SceneLegend';
import SceneInfoPanel from './ui/SceneInfoPanel';

// ═══════════════════════════════════════════════════════════════════════
// LAYER 1 — TERRAIN
// ═══════════════════════════════════════════════════════════════════════

function SlopeTerrain() {
  const [geometry] = useState(() => createSlopeTerrain());

  return (
    <mesh geometry={geometry} receiveShadow castShadow>
      <meshStandardMaterial
        vertexColors
        roughness={0.9}
        metalness={0.05}
        side={THREE.DoubleSide}
        flatShading={false}
      />
    </mesh>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// LAYER 2 — CONTROLS (OrbitControlsManager imported above)
// ═══════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════
// LAYER 3 — EFFECTS
// ═══════════════════════════════════════════════════════════════════════

function SceneEffects({ fissures }: { fissures: FisuraResponse[] }) {
  return (
    <>
      <FissureHighlightEffect fissures={fissures} />
      <HeatmapEffect />
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// LAYER 4 — UI OVERLAY
// ═══════════════════════════════════════════════════════════════════════

function SceneUI({
  fissures,
  autoRotate,
  onToggleAutoRotate,
  onResetView,
}: {
  fissures: FisuraResponse[];
  autoRotate: boolean;
  onToggleAutoRotate: () => void;
  onResetView: () => void;
}) {
  return (
    <>
      <SceneToolbar
        autoRotate={autoRotate}
        onToggleAutoRotate={onToggleAutoRotate}
        onResetView={onResetView}
        maxTimeline={100}
      />
      <SceneLegend fissures={fissures} />
      <SceneInfoPanel fissures={fissures} />
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// LOADING FALLBACK
// ═══════════════════════════════════════════════════════════════════════

function LoadingFallback() {
  return (
    <div className="flex h-full w-full items-center justify-center rounded-xl border border-dark-border bg-dark-primary">
      <div className="flex flex-col items-center gap-3">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-dark-accent border-t-transparent" />
        <p className="text-sm text-dark-secondary">
          Cargando visualización 3D...
        </p>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// INNER SCENE (inside Canvas)
// ═══════════════════════════════════════════════════════════════════════

function InnerScene({ fissures }: { fissures: FisuraResponse[] }) {
  // Auto-rotate state lives here (inside Canvas tree, reset via camera ref)
  const [autoRotate, setAutoRotate] = useState(false);
  const cameraRef = useRef<THREE.PerspectiveCamera>(null);
  // We need a way to reset the camera — we'll use a key-based approach
  const [resetKey, setResetKey] = useState(0);

  const toggleAutoRotate = useCallback(() => {
    setAutoRotate((prev) => !prev);
  }, []);

  const handleResetView = useCallback(() => {
    // Force re-mount of OrbitControls by incrementing key
    setResetKey((prev) => prev + 1);
    setAutoRotate(false);
  }, []);

  return (
    <>
      {/* Layer 1: Terrain */}
      <SlopeTerrain />

      {/* Layer 2: Controls */}
      <OrbitControlsManager
        key={resetKey}
        autoRotate={autoRotate}
        autoRotateSpeed={1}
      />

      {/* Layer 3: Effects */}
      <SceneEffects fissures={fissures} />

      {/* Layer 4: UI overlay (renders via HTML outside Canvas) */}
      {/* These go outside the Canvas in the parent; we just return scene layers */}
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// MAIN EXPORT
// ═══════════════════════════════════════════════════════════════════════

export default function SlopeScene() {
  const [fissures, setFissures] = useState<FisuraResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const selectCrack = useSlopeStore((s) => s.selectCrack);
  const viewMode = useSlopeStore((s) => s.viewMode);

  // Auto-rotate state (lives in the parent since toolbar is outside Canvas)
  const [autoRotate, setAutoRotate] = useState(false);
  const [canvasKey, setCanvasKey] = useState(0);

  // Fetch fissures on mount
  useEffect(() => {
    let mounted = true;

    async function fetchData() {
      try {
        setLoading(true);
        setError(null);
        const data = await fissuresService.getAll();
        if (mounted) {
          setFissures(Array.isArray(data) ? data : []);
        }
      } catch (err) {
        if (mounted) {
          const message =
            err instanceof Error ? err.message : 'Error al cargar fisuras';
          setError(message);
          console.warn('[SlopeScene] Failed to fetch fissures:', message);
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    fetchData();

    return () => {
      mounted = false;
    };
  }, []);

  // Clear selection when fissure list changes (stale selection)
  useEffect(() => {
    selectCrack(null);
  }, [fissures, selectCrack]);

  const handleToggleAutoRotate = useCallback(() => {
    setAutoRotate((prev) => !prev);
  }, []);

  const handleResetView = useCallback(() => {
    setCanvasKey((prev) => prev + 1);
    setAutoRotate(false);
  }, []);

  if (loading) {
    return <LoadingFallback />;
  }

  if (error) {
    return (
      <div className="flex h-full w-full items-center justify-center rounded-xl border border-dark-border bg-dark-primary">
        <div className="flex flex-col items-center gap-3 text-center max-w-md px-6">
          <svg className="h-10 w-10 text-red-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <p className="text-sm text-dark-secondary">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="rounded-md bg-dark-accent px-4 py-2 text-xs font-medium text-white hover:opacity-90 transition-opacity"
          >
            Reintentar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-full w-full overflow-hidden rounded-xl border border-dark-border bg-dark-primary">
      {/* Canvas */}
      <Canvas
        key={canvasKey}
        shadows
        camera={{
          position: [10, 8, 10],
          fov: 40,
          near: 0.1,
          far: 50,
        }}
        dpr={[1, 2]}
        gl={{
          antialias: true,
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: 1.0,
        }}
        style={{ width: '100%', height: '100%' }}
      >
        {/* Lights (reused from Visualizacion3D.tsx) */}
        <ambientLight intensity={0.5} />
        <directionalLight
          position={[8, 12, 6]}
          intensity={1.5}
          castShadow
          shadow-mapSize-width={1024}
          shadow-mapSize-height={1024}
        />
        <directionalLight position={[-4, 6, -4]} intensity={0.4} />
        <hemisphereLight args={['#87ceeb', '#3a2a1a', 0.6]} />

        <Suspense fallback={null}>
          <InnerScene fissures={fissures} />
        </Suspense>
      </Canvas>

      {/* UI Overlay (HTML, outside Canvas) */}
      <SceneToolbar
        autoRotate={autoRotate}
        onToggleAutoRotate={handleToggleAutoRotate}
        onResetView={handleResetView}
        maxTimeline={100}
      />
      <SceneLegend fissures={fissures} />
      <SceneInfoPanel fissures={fissures} />
    </div>
  );
}

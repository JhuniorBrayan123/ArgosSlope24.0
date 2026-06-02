/**
 * ARGOS SLOPE 4.0 — NubePuntos3D Component.
 *
 * Renders a coloured 3D point cloud received from the edge device via MQTT.
 * Built with React Three Fiber.
 *
 * Each point is ``[x, y, z, r, g, b]`` where RGB values are 0–255.
 * The component normalises colours, provides orbit controls, and renders
 * an information overlay with point count and timestamp.
 *
 * También renderiza fisuras (cracks) como esferas rojas en la posición 3D,
 * usando las coordenadas x3d, y3d, z3d incluidas en el payload MQTT.
 *
 * Corrección de coordenadas: scale={[-1, -1, 1]} voltea Y (OpenCV Y↓ → Three.js Y↑)
 * y espejea X para que la orientación coincida con la vista de la cámara.
 *
 * Props:
 *   points    — Array of ``[x, y, z, r, g, b]`` tuples.
 *   cracks    — Array of crack objects with ``{ x3d, y3d, z3d, roi_id }``.
 *   width     — Container width (default fills parent).
 *   height    — Container height (default 480).
 *   timestamp — ISO timestamp string for the overlay.
 */

'use client';

import { useMemo, Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';

// ── Props ────────────────────────────────────────────────────────────

interface NubePuntos3DProps {
  points: number[][] | null;
  cracks?: Array<{ x3d?: number; y3d?: number; z3d?: number; roi_id?: string }>;
  width?: number | string;
  height?: number;
  timestamp?: string | null;
}

// ── Point cloud scene ────────────────────────────────────────────────

function NubeScene({
  points,
  cracks,
}: {
  points: number[][];
  cracks?: NubePuntos3DProps['cracks'];
}) {
  // Build buffer geometry from point data
  const geometry = useMemo(() => {
    if (!points || points.length === 0) {
      return new THREE.BufferGeometry();
    }

    const count = points.length;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);

    for (let i = 0; i < count; i++) {
      const [x, y, z, r, g, b] = points[i];
      const idx3 = i * 3;

      // Position
      positions[idx3] = x;
      positions[idx3 + 1] = y;
      positions[idx3 + 2] = z;

      // Colour: input 0–255 → normalise to 0–1
      colors[idx3] = (r ?? 128) / 255;
      colors[idx3 + 1] = (g ?? 128) / 255;
      colors[idx3 + 2] = (b ?? 128) / 255;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    return geo;
  }, [points]);

  // Build crack markers (red spheres at 3D positions)
  const crackMarkers = useMemo(() => {
    if (!cracks || cracks.length === 0) return null;

    return cracks
      .filter((c) => c.x3d !== undefined && c.y3d !== undefined && c.z3d !== undefined)
      .map((c, idx) => (
        <mesh key={`crack-${idx}-${c.roi_id ?? idx}`} position={[c.x3d!, c.y3d!, c.z3d!]}>
          <sphereGeometry args={[0.03, 8, 8]} />
          <meshStandardMaterial color="#ff4444" emissive="#ff0000" emissiveIntensity={0.5} />
        </mesh>
      ));
  }, [cracks]);

  if (!points || points.length === 0) return null;

  return (
    <>
      {/* Ambient light so colours are visible */}
      <ambientLight intensity={1.0} />

      {/* Point cloud — corregido: Y invertido + espejo X */}
      {/* scale: [-1, -1, 1] voltea Y (OpenCV Y↓ → Three.js Y↑) y espejea X */}
      <points geometry={geometry} scale={[-1, -1, 1]}>
        <pointsMaterial
          size={0.02}
          sizeAttenuation
          vertexColors
          transparent={false}
          depthWrite
          depthTest
          opacity={1.0}
        />
      </points>

      {/* Fisuras como esferas rojas en 3D */}
      {crackMarkers}

      {/* Orbit controls with sensible limits */}
      <OrbitControls
        enableDamping
        dampingFactor={0.1}
        minDistance={0.5}
        maxDistance={10}
        autoRotate
        autoRotateSpeed={0.5}
      />
    </>
  );
}

// ── Empty state ──────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="flex flex-col items-center gap-2 text-center">
        <svg
          className="h-12 w-12 text-dark-secondary/40"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4"
          />
        </svg>
        <p className="text-sm text-dark-secondary/60">
          Esperando datos de la nube de puntos...
        </p>
        <p className="text-[11px] text-dark-secondary/40">
          Los puntos aparecerán automáticamente cuando el dispositivo
          edge publique alertas 3D.
        </p>
      </div>
    </div>
  );
}

// ── Loading fallback ─────────────────────────────────────────────────

function LoadingFallback() {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-dark-accent border-t-transparent" />
        <p className="text-xs text-dark-secondary/60">
          Cargando visualización 3D...
        </p>
      </div>
    </div>
  );
}

// ── Overlay info badge ───────────────────────────────────────────────

function InfoOverlay({
  pointCount,
  crackCount,
  timestamp,
}: {
  pointCount: number;
  crackCount: number;
  timestamp?: string | null;
}) {
  return (
    <div className="pointer-events-none absolute bottom-3 left-3 rounded-lg border border-dark-border/60 bg-dark-surface/80 px-3 py-2 text-[11px] leading-relaxed backdrop-blur-sm">
      <p className="font-medium text-dark-accent">
        {pointCount.toLocaleString()} puntos
      </p>
      {crackCount > 0 && (
        <p className="text-amber-400">
          {crackCount} fisura{crackCount !== 1 ? 's' : ''}
        </p>
      )}
      {timestamp && (
        <p className="text-dark-secondary/70">
          {new Date(timestamp).toLocaleString('es-ES', {
            day: '2-digit',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
          })}
        </p>
      )}
      <p className="mt-0.5 text-[10px] text-dark-secondary/40">
        Arrastra para orbitar · Rueda para zoom
      </p>
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────────

export default function NubePuntos3D({
  points,
  cracks,
  width = '100%',
  height = 480,
  timestamp,
}: NubePuntos3DProps) {
  const hasData = points && points.length > 0;
  const pointCount = hasData ? points!.length : 0;
  const crackCount = cracks?.length ?? 0;

  return (
    <div
      className="relative overflow-hidden rounded-xl border border-dark-border bg-[#0f0f1a]"
      style={{ width, height }}
    >
      {hasData ? (
        <>
          <Canvas
            camera={{
              position: [0, 0, 3],
              fov: 50,
              near: 0.01,
              far: 20,
            }}
          >
            <Suspense fallback={null}>
              <NubeScene points={points!} cracks={cracks} />
            </Suspense>
          </Canvas>

          {/* Info overlay */}
          <InfoOverlay
            pointCount={pointCount}
            crackCount={crackCount}
            timestamp={timestamp}
          />
        </>
      ) : (
        <EmptyState />
      )}
    </div>
  );
}

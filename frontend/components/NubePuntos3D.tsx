/**
 * ARGOS SLOPE 4.0 — Talud 3D Viewer (NubePuntos3D).
 *
 * Renders a textured mesh reconstruction from real Edge snapshots.
 * Priority: mesh + camera texture → point cloud fallback → empty state.
 *
 * Fisuras se proyectan sobre la superficie como marcadores coloreados.
 */

'use client';

import { useMemo, Suspense, useState, useEffect } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Html } from '@react-three/drei';
import * as THREE from 'three';

import type { Mesh3D } from '@/services/pointcloud.types';

const IS_DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_3D === 'true';

const CRACK_COLORS: Record<string, string> = {
  fina:    '#00d4aa',
  media:   '#f59e0b',
  gruesa:  '#ef4444',
  none:    '#888888',
  unknown: '#888888',
};

function crackColor(classification?: string): string {
  if (!classification) return CRACK_COLORS.none;
  return CRACK_COLORS[classification.toLowerCase()] ?? CRACK_COLORS.none;
}

export interface CrackMarker {
  x3d?: number;
  y3d?: number;
  z3d?: number;
  roi_id?: string;
  classification?: string;
  length_mm?: number;
  width_mm?: number;
}

interface NubePuntos3DProps {
  /** Textured mesh from Edge Snapshot3D */
  mesh?: Mesh3D | null;
  /** Base64 JPEG texture (without data: prefix) */
  imageBase64?: string | null;
  /** Fallback point cloud when no mesh */
  points?: number[][] | null;
  cracks?: CrackMarker[];
  width?: number | string;
  height?: number | string;
  timestamp?: string | null;
}

// ── Demo mesh: inclined plane (not random points) ───────────────────

function generateDemoMesh(): { mesh: Mesh3D; imageBase64: null } {
  const rows = 40;
  const cols = 60;
  const vertices: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const u = (c / (cols - 1)) * 2 - 1;
      const v = (r / (rows - 1)) * 1.2 - 0.6;
      const depth = 1.5 + u * 0.2 + Math.sin(v * 3) * 0.05;
      vertices.push(u * 0.8, v + u * 0.1, depth);
      uvs.push(c / (cols - 1), 1 - r / (rows - 1));
    }
  }

  for (let r = 0; r < rows - 1; r++) {
    for (let c = 0; c < cols - 1; c++) {
      const i00 = r * cols + c;
      const i10 = r * cols + (c + 1);
      const i01 = (r + 1) * cols + c;
      const i11 = (r + 1) * cols + (c + 1);
      indices.push(i00, i10, i11, i00, i11, i01);
    }
  }

  return {
    mesh: { vertices, indices, uvs },
    imageBase64: null,
  };
}

const DEMO_MESH = generateDemoMesh();

const DEMO_CRACKS: CrackMarker[] = [
  { roi_id: 'DEMO-001', x3d: 0.12, y3d: 0.08, z3d: 1.55, classification: 'fina',   length_mm: 8.3,  width_mm: 0.3 },
  { roi_id: 'DEMO-002', x3d: -0.20, y3d: -0.05, z3d: 1.35, classification: 'media',  length_mm: 14.7, width_mm: 0.8 },
  { roi_id: 'DEMO-003', x3d: 0.35, y3d: 0.22, z3d: 1.7,  classification: 'gruesa', length_mm: 22.1, width_mm: 1.5 },
];

// ── Crack marker on mesh surface ────────────────────────────────────

function CrackMarker3D({ crack, idx }: { crack: CrackMarker; idx: number }) {
  const [hovered, setHovered] = useState(false);
  const color = crackColor(crack.classification);

  if (crack.x3d === undefined || crack.y3d === undefined || crack.z3d === undefined) {
    return null;
  }

  return (
    <group position={[crack.x3d, crack.y3d, crack.z3d]}>
      <mesh
        onPointerEnter={() => setHovered(true)}
        onPointerLeave={() => setHovered(false)}
        scale={hovered ? 1.6 : 1}
      >
        <sphereGeometry args={[0.035, 10, 10]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={hovered ? 1.0 : 0.6}
          roughness={0.2}
          depthTest
        />
      </mesh>
      <mesh>
        <ringGeometry args={[0.04, 0.055, 16]} />
        <meshBasicMaterial color={color} transparent opacity={0.5} side={THREE.DoubleSide} />
      </mesh>
      {hovered && (
        <Html position={[0, 0.1, 0]} center distanceFactor={4} style={{ pointerEvents: 'none' }}>
          <div style={{
            background: 'rgba(10,10,20,0.92)',
            border: `1px solid ${color}55`,
            borderRadius: 8,
            padding: '6px 10px',
            fontSize: 11,
            color: '#e2e8f0',
            whiteSpace: 'nowrap',
          }}>
            <div style={{ fontWeight: 700, color }}>{crack.roi_id || `CRK-${idx + 1}`}</div>
            {crack.classification && (
              <div style={{ color: '#94a3b8', marginTop: 2 }}>{crack.classification.toUpperCase()}</div>
            )}
            {crack.length_mm && (
              <div style={{ color: '#94a3b8' }}>
                {crack.length_mm.toFixed(1)} × {(crack.width_mm ?? 0).toFixed(2)} mm
              </div>
            )}
          </div>
        </Html>
      )}
    </group>
  );
}

// ── Textured mesh from Snapshot3D ───────────────────────────────────

function TexturedMesh({
  mesh,
  imageBase64,
}: {
  mesh: Mesh3D;
  imageBase64?: string | null;
}) {
  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    const verts = new Float32Array(mesh.vertices);
    const idx = mesh.indices.length <= 65535
      ? new Uint16Array(mesh.indices)
      : new Uint32Array(mesh.indices);
    const uv = new Float32Array(mesh.uvs);

    geo.setAttribute('position', new THREE.BufferAttribute(verts, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    geo.computeVertexNormals();
    return geo;
  }, [mesh]);

  const texture = useMemo(() => {
    if (!imageBase64) return null;
    const loader = new THREE.TextureLoader();
    const tex = loader.load(`data:image/jpeg;base64,${imageBase64}`);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.flipY = true;
    return tex;
  }, [imageBase64]);

  useEffect(() => {
    return () => { texture?.dispose(); };
  }, [texture]);

  const depthColors = useMemo(() => {
    if (imageBase64) return null;
    const count = mesh.vertices.length / 3;
    const colors = new Float32Array(count * 3);
    let zMin = Infinity;
    let zMax = -Infinity;
    for (let i = 2; i < mesh.vertices.length; i += 3) {
      const z = mesh.vertices[i];
      if (z < zMin) zMin = z;
      if (z > zMax) zMax = z;
    }
    const range = zMax - zMin || 1;
    for (let i = 0; i < count; i++) {
      const z = mesh.vertices[i * 3 + 2];
      const t = (z - zMin) / range;
      colors[i * 3]     = 0.4 + t * 0.4;
      colors[i * 3 + 1] = 0.35 + t * 0.25;
      colors[i * 3 + 2] = 0.25 + (1 - t) * 0.3;
    }
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    return colors;
  }, [mesh, imageBase64, geometry]);

  return (
    <mesh geometry={geometry} scale={[-1, -1, 1]}>
      {texture ? (
        <meshStandardMaterial map={texture} side={THREE.DoubleSide} roughness={0.85} />
      ) : (
        <meshStandardMaterial vertexColors side={THREE.DoubleSide} roughness={0.7} />
      )}
    </mesh>
  );
}

// ── Point cloud fallback ────────────────────────────────────────────

function PointCloudFallback({ points }: { points: number[][] }) {
  const geometry = useMemo(() => {
    const count = points.length;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const [x, y, z, r, g, b] = points[i];
      positions[i * 3]     = x;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = z;
      colors[i * 3]     = (r ?? 128) / 255;
      colors[i * 3 + 1] = (g ?? 128) / 255;
      colors[i * 3 + 2] = (b ?? 128) / 255;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    return geo;
  }, [points]);

  return (
    <points geometry={geometry} scale={[-1, -1, 1]}>
      <pointsMaterial size={0.018} sizeAttenuation vertexColors />
    </points>
  );
}

// ── Scene ───────────────────────────────────────────────────────────

function TaludScene({
  mesh,
  imageBase64,
  points,
  cracks,
}: {
  mesh: Mesh3D | null;
  imageBase64?: string | null;
  points: number[][];
  cracks?: CrackMarker[];
}) {
  const hasMesh = mesh !== null && mesh.vertices.length >= 9;
  const hasPoints = points.length > 0;

  return (
    <>
      <ambientLight intensity={1.2} />
      <directionalLight position={[2, 3, 4]} intensity={0.6} />

      {hasMesh && <TexturedMesh mesh={mesh!} imageBase64={imageBase64} />}
      {!hasMesh && hasPoints && <PointCloudFallback points={points} />}

      {cracks?.map((c, idx) => (
        <group key={`crack-${idx}-${c.roi_id ?? idx}`} scale={[-1, -1, 1]}>
          <CrackMarker3D crack={c} idx={idx} />
        </group>
      ))}

      <OrbitControls
        enableDamping
        dampingFactor={0.1}
        minDistance={0.3}
        maxDistance={10}
        autoRotate={!hasMesh && !hasPoints}
        autoRotateSpeed={0.4}
      />
    </>
  );
}

// ── UI overlays ─────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="flex flex-col items-center gap-3 text-center max-w-sm px-4">
        <svg className="h-12 w-12 text-dark-secondary/30" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 10h6M9 14h6" />
        </svg>
        <p className="text-sm font-medium text-dark-secondary/70">
          Esperando snapshot 3D real desde el Edge…
        </p>
        <p className="text-[11px] text-dark-secondary/40">
          La reconstrucción 3D (malla texturizada + fisuras) aparecerá cuando el Edge publique
          en <span className="font-mono text-dark-accent/60">mineria/talud/alertas</span>
        </p>
      </div>
    </div>
  );
}

function DemoBanner() {
  return (
    <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 pointer-events-none">
      <div className="flex items-center gap-2 rounded-full border border-amber-500/40 bg-amber-500/10 px-4 py-1.5 backdrop-blur-sm">
        <span className="text-amber-400 text-sm">⚠</span>
        <span className="text-[12px] font-bold tracking-wider text-amber-400 uppercase">
          Modo Demo — Sin datos reales del Edge
        </span>
      </div>
    </div>
  );
}

function InfoOverlay({
  mode,
  faceCount,
  pointCount,
  cracks,
  timestamp,
  hasTexture,
}: {
  mode: 'mesh' | 'points' | 'demo';
  faceCount: number;
  pointCount: number;
  cracks: CrackMarker[];
  timestamp?: string | null;
  hasTexture: boolean;
}) {
  const byClass = (cls: string) => cracks.filter((c) => c.classification?.toLowerCase() === cls).length;

  return (
    <div className="pointer-events-none absolute bottom-3 left-3 rounded-lg border border-dark-border/60 bg-dark-surface/85 px-3 py-2 text-[11px] leading-relaxed backdrop-blur-sm">
      {mode === 'mesh' && (
        <p className="font-semibold text-dark-accent">
          Malla 3D · {faceCount.toLocaleString()} caras
          {hasTexture ? ' · textura real' : ' · color por profundidad'}
        </p>
      )}
      {mode === 'points' && (
        <p className="font-semibold text-amber-400">
          Fallback: {pointCount.toLocaleString()} puntos (sin malla)
        </p>
      )}
      {mode === 'demo' && (
        <p className="font-semibold text-amber-400">Malla demo (plano inclinado)</p>
      )}
      {cracks.length > 0 && (
        <p className="mt-0.5 text-dark-secondary/80">{cracks.length} fisura{cracks.length !== 1 ? 's' : ''} proyectadas</p>
      )}
      {timestamp && (
        <p className="mt-1 text-dark-secondary/60">
          {new Date(timestamp).toLocaleString('es-ES', {
            day: '2-digit', month: 'short',
            hour: '2-digit', minute: '2-digit', second: '2-digit',
          })}
        </p>
      )}
    </div>
  );
}

// ── Main export ─────────────────────────────────────────────────────

export default function NubePuntos3D({
  mesh,
  imageBase64,
  points,
  cracks,
  width = '100%',
  height = 480,
  timestamp,
}: NubePuntos3DProps) {
  const hasRealMesh = !!(mesh && mesh.vertices.length >= 9);
  const hasRealPoints = !!(points && points.length > 0);
  const hasRealCracks = !!(cracks && cracks.length > 0);
  const hasRealData = hasRealMesh || hasRealPoints || hasRealCracks;

  const isShowingDemo = !hasRealData && IS_DEMO_MODE;

  const activeMesh: Mesh3D | null = hasRealMesh
    ? mesh!
    : isShowingDemo
    ? DEMO_MESH.mesh
    : null;

  const activeTexture = hasRealData ? (imageBase64 ?? null) : (isShowingDemo ? null : null);
  const activePoints = hasRealPoints ? (points ?? []) : [];
  const activeCracks = hasRealData ? (cracks ?? []) : (isShowingDemo ? DEMO_CRACKS : []);

  const hasRenderable = !!(activeMesh || activePoints.length > 0 || activeCracks.length > 0);

  const renderMode: 'mesh' | 'points' | 'demo' = activeMesh
    ? (isShowingDemo ? 'demo' : 'mesh')
    : activePoints.length > 0
    ? 'points'
    : 'demo';

  const faceCount = activeMesh ? Math.floor(activeMesh.indices.length / 3) : 0;

  return (
    <div
      className="relative overflow-hidden rounded-xl border border-dark-border bg-[#0d0d1a]"
      style={{ width, height }}
    >
      {hasRenderable ? (
        <>
          <Canvas camera={{ position: [0, 0, 3], fov: 50, near: 0.01, far: 25 }}>
            <Suspense fallback={null}>
              <TaludScene
                mesh={activeMesh}
                imageBase64={activeTexture}
                points={activePoints}
                cracks={activeCracks}
              />
            </Suspense>
          </Canvas>

          {isShowingDemo && <DemoBanner />}

          {hasRealData && !isShowingDemo && (
            <div className="absolute top-3 left-3 pointer-events-none">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-semibold text-emerald-400">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse inline-block" />
                {hasRealMesh ? 'Reconstrucción 3D real del Edge' : 'Datos reales del Edge'}
              </span>
            </div>
          )}

          <InfoOverlay
            mode={renderMode}
            faceCount={faceCount}
            pointCount={activePoints.length}
            cracks={activeCracks}
            timestamp={hasRealData ? timestamp : null}
            hasTexture={!!activeTexture}
          />
        </>
      ) : (
        <EmptyState />
      )}
    </div>
  );
}

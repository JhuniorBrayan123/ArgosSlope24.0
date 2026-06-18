/**
 * @deprecated This component generates a PROCEDURAL TERRAIN with simulated
 * fissure projections onto a mathematical slope surface. It does NOT use
 * real point cloud data from the Edge.
 *
 * It is kept for reference only. The new 3D viewer (NubePuntos3D in
 * app/visualizacion/page.tsx) renders REAL point clouds and cracks from
 * MQTT or historical backend snapshots.
 *
 * To remove: after confirming the new viewer works with real Edge data,
 * delete this file and any remaining references.
 *
 * ⚠ THIS COMPONENT DOES NOT REPRESENT REAL SLOPE DATA.
 */

'use client';

import { useEffect, useState, useRef, useMemo, Suspense, forwardRef } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Html } from '@react-three/drei';
import * as THREE from 'three';
import { obtenerFisuras } from '@/lib/api';

// ═══════════════════════════════════════════════════════════════════════
// TIPOS
// ═══════════════════════════════════════════════════════════════════════

interface FisuraData {
  id: number;
  roi_id: string;
  fecha_deteccion: string;
  largo_mm: number;
  ancho_mm: number;
  area_mm2: number;
  orientacion: string | null;
  tipo: string | null;
  coordenadas: string | null;
}

interface Coord2D {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface CrackLine3D {
  id: number;
  roiId: string;
  puntos: THREE.Vector3[];
  color: string;
  largoMm: number;
  anchoMm: number;
  tipo: string;
}

// ═══════════════════════════════════════════════════════════════════════
// CONSTANTES DEL TALUD
// ═══════════════════════════════════════════════════════════════════════

const SLOPE = {
  ancho: 14,          // ancho total del talud en unidades 3D
  alto: 10,           // altura total
  inclinacion: 55,    // grados de inclinación (45-70°)
  intervalBerma: 2.5, // cada cuánto hay una berma
  profBerma: 0.5,     // qué tan profundo corta la berma
} as const;

const COLOR_FISURA: Record<string, string> = {
  fina: '#00d4aa',
  media: '#f59e0b',
  gruesa: '#ef4444',
};

const INCLINACION_RAD = (SLOPE.inclinacion * Math.PI) / 180;

// ═══════════════════════════════════════════════════════════════════════
// UTILIDADES
// ═══════════════════════════════════════════════════════════════════════

function parseCoordenadas(json: string | null): Coord2D {
  try {
    return JSON.parse(json ?? '{}');
  } catch {
    return { x: 0, y: 0, w: 10, h: 10 };
  }
}

/** Ruido suave para superficie rocosa */
function noise(x: number, z: number): number {
  return (
    Math.sin(x * 1.2 + z * 0.7) * 0.12 +
    Math.cos(x * 0.5 - z * 0.9) * 0.08 +
    Math.sin(x * 2.3 + z * 1.8) * 0.05 +
    Math.cos(x * 3.1 - z * 2.5) * 0.03
  );
}

/** Retorna la altura Y del talud en una coordenada (x, z) */
function alturaTalud(x: number, z: number): number {
  // Convertir (x, z) a parámetro v a lo largo del talud
  // El talud se extiende en Z desde -offset hasta -offset + alto*cos(inclinacion)
  const zMin = -(SLOPE.alto * Math.cos(INCLINACION_RAD) + 1);
  const zMax = -1;
  const v = THREE.MathUtils.clamp((z - zMin) / (zMax - zMin), 0, 1);

  const alturaBase = v * SLOPE.alto * Math.sin(INCLINACION_RAD);

  // Bermas: aplanar en intervalos
  const alturaLocal = v * SLOPE.alto;
  const faseBerma = (alturaLocal % SLOPE.intervalBerma) / SLOPE.intervalBerma;
  let offsetBerma = 0;
  if (faseBerma > 0.7) {
    const t = (faseBerma - 0.7) / 0.3;
    offsetBerma = -t * SLOPE.profBerma;
  }

  return alturaBase + offsetBerma + noise(x, z);
}

// ═══════════════════════════════════════════════════════════════════════
// COMPONENTE: TERRENO (TALUD MINERO)
// ═══════════════════════════════════════════════════════════════════════

const TerrenoTalud = forwardRef<THREE.Mesh>(function TerrenoTalud(_props, ref) {

  const geometry = useMemo(() => {
    const segW = 50;
    const segH = 40;
    const vertices: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];
    const colores: number[] = [];

    const colorRoca = new THREE.Color('#6b5a4a');
    const colorClaro = new THREE.Color('#8a7a6a');
    const colorOscuro = new THREE.Color('#3a2a1a');

    for (let j = 0; j <= segH; j++) {
      const v = j / segH;
      for (let i = 0; i <= segW; i++) {
        const u = i / segW;

        // Posición base inclinada
        const x = (u - 0.5) * SLOPE.ancho;
        const z = -1 - v * SLOPE.alto * Math.cos(INCLINACION_RAD);
        const y = alturaTalud(x, z);

        vertices.push(x, y, z);
        uvs.push(u, v);

        // Color rocoso con variación
        const ruido = noise(x * 2, z * 2);
        const c = colorRoca
          .clone()
          .lerp(colorClaro, 0.3 + ruido)
          .lerp(colorOscuro, 0.2);
        colores.push(c.r, c.g, c.b);
      }
    }

    for (let j = 0; j < segH; j++) {
      for (let i = 0; i < segW; i++) {
        const a = j * (segW + 1) + i;
        const b = a + 1;
        const c = (j + 1) * (segW + 1) + i;
        const d = c + 1;
        indices.push(a, b, c, b, d, c);
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colores, 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();

    // Guardar normales para vertexColors
    const pos = geo.attributes.position;
    const nor = geo.attributes.normal;
    for (let i = 0; i < pos.count; i++) {
      const n = new THREE.Vector3(nor.getX(i), nor.getY(i), nor.getZ(i));
      n.add(new THREE.Vector3(0, 0.5, 0)).normalize();
      nor.setXYZ(i, n.x, n.y, n.z);
    }

    return geo;
  }, []);

  return (
      <mesh ref={ref} geometry={geometry} receiveShadow castShadow>
      <meshStandardMaterial
        vertexColors
        roughness={0.9}
        metalness={0.05}
        side={THREE.DoubleSide}
        flatShading={false}
      />
    </mesh>
  );
});

// ═══════════════════════════════════════════════════════════════════════
// COMPONENTE: LÍNEAS DE FISURA SOBRE EL TALUD
// ═══════════════════════════════════════════════════════════════════════

function generarPuntosFisura(
  coord2d: Coord2D,
  fisura: FisuraData,
  terrenoMesh: THREE.Mesh | null
): THREE.Vector3[] {
  // Mapear centro 2D → 3D
  const nx = (coord2d.x + coord2d.w / 2) / 1280;
  const ny = 1 - (coord2d.y + coord2d.h / 2) / 720;

  const x3d = (nx - 0.5) * SLOPE.ancho;
  const zMin = -(SLOPE.alto * Math.cos(INCLINACION_RAD) + 1);
  const zMax = -1;
  const z3d = zMin + ny * (zMax - zMin);

  // Orientación de la fisura
  const orientRad = parseFloat(fisura.orientacion ?? '0') * (Math.PI / 180);
  const longCrack = Math.min(fisura.largo_mm / 25, 1.8);

  const puntos: THREE.Vector3[] = [];
  const segmentos = 10;

  for (let i = 0; i <= segmentos; i++) {
    const t = (i / segmentos - 0.5) * longCrack;
    const px = x3d + t * Math.cos(orientRad);
    const pz = z3d + t * Math.sin(orientRad);

    // Proyección sobre la superficie del talud
    const py = alturaTalud(px, pz) + 0.02; // +offset para que flote sobre la superficie

    // Irregularidad para que parezca una grieta real
    const irregularidad = (Math.random() - 0.5) * 0.04;
    puntos.push(new THREE.Vector3(px, py + irregularidad, pz));
  }

  return puntos;
}

function transformarFisurasALineas(
  fisuras: FisuraData[],
  terrenoMesh: THREE.Mesh | null
): CrackLine3D[] {
  return fisuras.map((f) => {
    const coords = parseCoordenadas(f.coordenadas);
    const puntos = generarPuntosFisura(coords, f, terrenoMesh);
    return {
      id: f.id,
      roiId: f.roi_id,
      puntos,
      color: COLOR_FISURA[f.tipo ?? ''] ?? '#888888',
      largoMm: f.largo_mm,
      anchoMm: f.ancho_mm,
      tipo: f.tipo ?? 'desconocido',
    };
  });
}

function FisuraLinea({
  crack,
  onClick,
  seleccionado,
}: {
  crack: CrackLine3D;
  onClick: (id: number) => void;
  seleccionado: boolean;
}) {
  const ref = useRef<THREE.Group>(null);
  const [hovered, setHovered] = useState(false);

  // Ancho visual según el ancho real de la fisura
  const lineWidth = Math.min(Math.max(crack.anchoMm / 5, 0.03), 0.15);
  const escala = hovered || seleccionado ? 1.4 : 1;

  return (
    <group ref={ref}>
      {/* Línea principal de la fisura */}
      <mesh onClick={() => onClick(crack.id)}>
        <tubeGeometry
          args={[
            new THREE.CatmullRomCurve3(crack.puntos),
            12,
            lineWidth * escala,
            6,
            false,
          ]}
        />
        <meshStandardMaterial
          color={crack.color}
          emissive={crack.color}
          emissiveIntensity={hovered || seleccionado ? 0.8 : 0.3}
          roughness={0.4}
          metalness={0.1}
        />
      </mesh>

      {/* Brillo (glow) para fisuras críticas */}
      {(hovered || seleccionado || crack.tipo === 'gruesa') && (
        <mesh>
          <tubeGeometry
            args={[
              new THREE.CatmullRomCurve3(crack.puntos),
              8,
              lineWidth * 2.5 * escala,
              4,
              false,
            ]}
          />
          <meshBasicMaterial
            color={crack.color}
            transparent
            opacity={hovered ? 0.3 : seleccionado ? 0.25 : 0.1}
          />
        </mesh>
      )}

      {/* Label al hover */}
      {hovered && (
        <Html
          position={crack.puntos[Math.floor(crack.puntos.length / 2)]
            .clone()
            .add(new THREE.Vector3(0, 0.3, 0))}
          center
          distanceFactor={6}
        >
          <div className="rounded-lg border border-dark-border bg-dark-surface/95 px-3 py-2 text-xs shadow-2xl backdrop-blur-sm">
            <p className="font-bold text-dark-accent">{crack.roiId}</p>
            <p className="text-dark-textSecondary">
              {crack.largoMm.toFixed(1)} × {crack.anchoMm.toFixed(2)} mm
            </p>
            <p className="text-dark-textSecondary">{crack.tipo}</p>
          </div>
        </Html>
      )}
    </group>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// COMPONENTE: ESCENA PRINCIPAL
// ═══════════════════════════════════════════════════════════════════════

function EscenaTalud({
  fisuras,
  onCrackClick,
  selectedId,
}: {
  fisuras: FisuraData[];
  onCrackClick: (id: number) => void;
  selectedId: number | null;
}) {
  const terrenoRef = useRef<THREE.Mesh>(null);
  const [terrenoMesh, setTerrenoMesh] = useState<THREE.Mesh | null>(null);

  useEffect(() => {
    if (terrenoRef.current) {
      setTerrenoMesh(terrenoRef.current);
    }
  }, []);

  const lineasFisura = useMemo(
    () => transformarFisurasALineas(fisuras, terrenoMesh),
    [fisuras, terrenoMesh]
  );

  return (
    <>
      {/* Luces */}
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

      {/* Talud minero */}
      <TerrenoTalud ref={terrenoRef} />

      {/* Fisuras como líneas */}
      {lineasFisura.map((crack) => (
        <FisuraLinea
          key={crack.id}
          crack={crack}
          onClick={onCrackClick}
          seleccionado={crack.id === selectedId}
        />
      ))}

      {/* Controles */}
      <OrbitControls
        enableDamping
        dampingFactor={0.1}
        minDistance={4}
        maxDistance={25}
        maxPolarAngle={Math.PI / 2.1}
        target={[0, SLOPE.alto * 0.4 * Math.sin(INCLINACION_RAD), -2]}
      />
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// LOADING FALLBACK
// ═══════════════════════════════════════════════════════════════════════

function LoadingFallback() {
  return (
    <div className="flex h-full items-center justify-center rounded-xl border border-dark-border bg-dark-surface">
      <div className="flex flex-col items-center gap-3">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-dark-accent border-t-transparent" />
        <p className="text-sm text-dark-textSecondary">Cargando visualización 3D...</p>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// COMPONENTE PRINCIPAL
// ═══════════════════════════════════════════════════════════════════════

interface Visualizacion3DProps {
  fisuraId?: number | null;
  onSelectFisura?: (id: number) => void;
}

export default function Visualizacion3D({
  fisuraId,
  onSelectFisura,
}: Visualizacion3DProps) {
  const [fisuras, setFisuras] = useState<FisuraData[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<number | null>(fisuraId ?? null);

  useEffect(() => {
    let mounted = true;
    async function fetchData() {
      try {
        const data = await obtenerFisuras();
        if (mounted) setFisuras(data);
      } catch {
        // Silencioso
      } finally {
        if (mounted) setLoading(false);
      }
    }
    fetchData();
  }, []);

  const handleCrackClick = (id: number) => {
    setSelectedId(id === selectedId ? null : id);
    onSelectFisura?.(id);
  };

  if (loading) return <LoadingFallback />;

  return (
    <div className="relative h-[500px] w-full overflow-hidden rounded-xl border border-dark-border bg-dark-primary">
      <Canvas
        shadows
        camera={{
          position: [10, 8, 10],
          fov: 40,
        }}
      >
        <Suspense fallback={null}>
          <EscenaTalud
            fisuras={fisuras}
            onCrackClick={handleCrackClick}
            selectedId={selectedId}
          />
        </Suspense>
      </Canvas>

      {/* Leyenda */}
      <div className="absolute bottom-4 left-4 rounded-lg border border-dark-border bg-dark-surface/90 px-4 py-3 text-xs backdrop-blur-sm">
        <p className="mb-2 font-semibold text-dark-text">Fisuras</p>
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="inline-block h-2 w-2 rounded-full bg-[#00d4aa]" />
            <span className="text-dark-textSecondary">Fina</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-block h-2 w-2 rounded-full bg-[#f59e0b]" />
            <span className="text-dark-textSecondary">Media</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-block h-2 w-2 rounded-full bg-[#ef4444]" />
            <span className="text-dark-textSecondary">Gruesa</span>
          </div>
        </div>
        <p className="mt-2 text-[10px] text-dark-textSecondary/60">
          Arrastra para orbitar · Rueda para zoom
        </p>
      </div>

      {/* Info de selección */}
      {selectedId && (
        <div className="absolute right-4 top-4 rounded-lg border border-dark-border bg-dark-surface/90 px-4 py-3 text-xs backdrop-blur-sm">
          <p className="font-semibold text-dark-accent">
            Fisura #{selectedId}
          </p>
          <button
            onClick={() => setSelectedId(null)}
            className="mt-1 text-dark-textSecondary hover:text-dark-text"
          >
            Limpiar selección
          </button>
        </div>
      )}
    </div>
  );
}

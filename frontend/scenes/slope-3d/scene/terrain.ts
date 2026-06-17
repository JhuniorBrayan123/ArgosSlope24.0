/**
 * ARGOS SLOPE 4.0 — Terrain Geometry Module.
 *
 * Extracted from Visualizacion3D.tsx's TerrenoTalud component.
 * Pure Three.js geometry generation for the procedurally-generated
 * mining slope terrain with vertex coloring for a rocky look.
 *
 * Reusable by SlopeScene and any other 3D viewer components.
 */

import * as THREE from 'three';

// ═══════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════

export const SLOPE = {
  /** Total width of the slope in 3D units */
  ancho: 14,
  /** Total height of the slope */
  alto: 10,
  /** Slope inclination in degrees (45-70°) */
  inclinacion: 55,
  /** Berm interval height */
  intervalBerma: 2.5,
  /** Berm cut depth */
  profBerma: 0.5,
} as const;

export const INCLINACION_RAD = (SLOPE.inclinacion * Math.PI) / 180;

/** Fissure severity color mapping — used by both terrain helper and effects */
export const COLOR_FISURA: Record<string, string> = {
  fina: '#00d4aa',
  media: '#f59e0b',
  gruesa: '#ef4444',
};

// ═══════════════════════════════════════════════════════════════════════
// TERRAIN HEIGHT UTILITIES
// ═══════════════════════════════════════════════════════════════════════

/**
 * Smooth noise function for rocky surface variation.
 * Produces a deterministic pseudo-random height offset
 * based on spatial coordinates.
 */
export function noise(x: number, z: number): number {
  return (
    Math.sin(x * 1.2 + z * 0.7) * 0.12 +
    Math.cos(x * 0.5 - z * 0.9) * 0.08 +
    Math.sin(x * 2.3 + z * 1.8) * 0.05 +
    Math.cos(x * 3.1 - z * 2.5) * 0.03
  );
}

/**
 * Returns the Y height of the slope at a given (x, z) coordinate.
 * Accounts for inclination, berm terraces, and surface noise.
 */
export function alturaTalud(x: number, z: number): number {
  const zMin = -(SLOPE.alto * Math.cos(INCLINACION_RAD) + 1);
  const zMax = -1;
  const v = THREE.MathUtils.clamp((z - zMin) / (zMax - zMin), 0, 1);

  const alturaBase = v * SLOPE.alto * Math.sin(INCLINACION_RAD);

  // Berma: flatten at intervals
  const alturaLocal = v * SLOPE.alto;
  const faseBerma = (alturaLocal % SLOPE.intervalBerma) / SLOPE.intervalBerma;
  let offsetBerma = 0;
  if (faseBerma > 0.7) {
    const t = (faseBerma - 0.7) / 0.3;
    offsetBerma = -t * SLOPE.profBerma;
  }

  return alturaBase + offsetBerma + noise(x, z);
}

/**
 * Map fissure coordinate JSON from .NET API to 3D positions on the
 * slope terrain surface. Reuses the same projection logic from
 * Visualizacion3D.tsx's generarPuntosFisura.
 */
export function fissureCoordsTo3D(
  coordenadasJson: string | null | undefined,
  orientacionDeg: string | null | undefined,
  largoMm: number
): THREE.Vector3[] {
  // ── Parse coordinates ─────────────────────────────────────────────
  let coords: { x: number; y: number; w: number; h: number };
  try {
    const parsed = JSON.parse(coordenadasJson ?? '{}');
    coords = {
      x: typeof parsed.x === 'number' ? parsed.x : 640,
      y: typeof parsed.y === 'number' ? parsed.y : 360,
      w: typeof parsed.w === 'number' ? parsed.w : 10,
      h: typeof parsed.h === 'number' ? parsed.h : 10,
    };
  } catch {
    coords = { x: 640, y: 360, w: 10, h: 10 };
  }

  // ── Guard: skip if dimensions are zero (no data) ──────────────
  if (coords.w <= 0 || coords.h <= 0) {
    coords = { x: 640, y: 360, w: 10, h: 10 };
  }

  // Map 2D center from image coordinates (default 1280x720) to 3D
  const nx = (coords.x + coords.w / 2) / 1280;
  const ny = 1 - (coords.y + coords.h / 2) / 720;

  const x3d = (nx - 0.5) * SLOPE.ancho;
  const zMin = -(SLOPE.alto * Math.cos(INCLINACION_RAD) + 1);
  const zMax = -1;
  const z3d = zMin + ny * (zMax - zMin);

  const orientRad = parseFloat(orientacionDeg ?? '0') * (Math.PI / 180);
  const longCrack = Math.max(Math.min(largoMm / 25, 1.8), 0.1); // minimum 0.1 to avoid degenerate curves

  const puntos: THREE.Vector3[] = [];
  const segmentos = 10;

  for (let i = 0; i <= segmentos; i++) {
    const t = (i / segmentos - 0.5) * longCrack;
    const px = x3d + t * Math.cos(orientRad);
    const pz = z3d + t * Math.sin(orientRad);
    const py = alturaTalud(px, pz) + 0.02;

    // Deterministic irregularity based on position for visual realism
    const irregularidad =
      (Math.sin(px * 17.3 + pz * 13.7) * 0.5) * 0.04;
    puntos.push(new THREE.Vector3(px, py + irregularidad, pz));
  }

  return puntos;
}

// ═══════════════════════════════════════════════════════════════════════
// TERRAIN GEOMETRY
// ═══════════════════════════════════════════════════════════════════════

/**
 * Generate the procedural slope terrain geometry with vertex colors.
 *
 * @returns A BufferGeometry with position, uv, color, and index attributes,
 *          plus computed vertex normals adjusted for a rocky appearance.
 */
export function createSlopeTerrain(): THREE.BufferGeometry {
  const segW = 50;
  const segH = 40;
  const vertices: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const colores: number[] = [];

  const colorRoca = new THREE.Color('#6b5a4a');
  const colorClaro = new THREE.Color('#8a7a6a');
  const colorOscuro = new THREE.Color('#3a2a1a');

  // Generate vertices with height and coloring
  for (let j = 0; j <= segH; j++) {
    const v = j / segH;
    for (let i = 0; i <= segW; i++) {
      const u = i / segW;

      const x = (u - 0.5) * SLOPE.ancho;
      const z = -1 - v * SLOPE.alto * Math.cos(INCLINACION_RAD);
      const y = alturaTalud(x, z);

      vertices.push(x, y, z);
      uvs.push(u, v);

      // Rocky color with variation
      const ruido = noise(x * 2, z * 2);
      const c = colorRoca
        .clone()
        .lerp(colorClaro, 0.3 + ruido)
        .lerp(colorOscuro, 0.2);
      colores.push(c.r, c.g, c.b);
    }
  }

  // Generate triangle indices
  for (let j = 0; j < segH; j++) {
    for (let i = 0; i < segW; i++) {
      const a = j * (segW + 1) + i;
      const b = a + 1;
      const c = (j + 1) * (segW + 1) + i;
      const d = c + 1;
      indices.push(a, b, c, b, d, c);
    }
  }

  // Build geometry
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colores, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();

  // Adjust normals for better rocky appearance
  const pos = geo.attributes.position;
  const nor = geo.attributes.normal;
  for (let i = 0; i < pos.count; i++) {
    const n = new THREE.Vector3(nor.getX(i), nor.getY(i), nor.getZ(i));
    n.add(new THREE.Vector3(0, 0.5, 0)).normalize();
    nor.setXYZ(i, n.x, n.y, n.z);
  }

  return geo;
}

/**
 * ARGOS SLOPE 4.0 — Fissure Highlight Effect.
 *
 * R3F component that renders fissures as 3D tube geometry on the
 * terrain surface. Reuses logic from Visualizacion3D.tsx's FisuraLinea
 * component but reads data from the Zustand store.
 *
 * Features:
 *  - Tube geometry along the fissure path on the terrain surface
 *  - Color coding by severity: fina → #00d4aa, media → #f59e0b, gruesa → #ef4444
 *  - Hover shows an HTML label with ROI ID, dimensions, and type
 *  - Click selects/deselects the fissure in slope.store
 *  - Selected fissures glow brighter
 */

'use client';

import { useMemo, useState, useCallback } from 'react';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { FisuraResponse } from '@/services/api-client';
import { useSlopeStore } from '@/stores/slope.store';
import {
  COLOR_FISURA,
  fissureCoordsTo3D,
} from '../scene/terrain';

// ── Internal crack line type ──────────────────────────────────────────

interface CrackLine3D {
  id: number;
  roiId: string;
  puntos: THREE.Vector3[];
  color: string;
  largoMm: number;
  anchoMm: number;
  tipo: string;
}

// ── Props ────────────────────────────────────────────────────────────

export interface FissureHighlightEffectProps {
  /** Fissures to render (from API) */
  fissures: FisuraResponse[];
}

// ── Helper: Transform API response to crack lines ─────────────────────

function transformFisuras(fisuras: FisuraResponse[]): CrackLine3D[] {
  return fisuras
    .filter((f) => f && f.id) // skip invalid entries
    .map((f) => {
      try {
        const puntos = fissureCoordsTo3D(
          f.coordenadas,
          f.orientacion,
          f.largoMm
        );
        return {
          id: f.id,
          roiId: f.roiId,
          puntos,
          color: COLOR_FISURA[f.tipo] ?? '#888888',
          largoMm: f.largoMm,
          anchoMm: f.anchoMm,
          tipo: f.tipo ?? 'desconocido',
        };
      } catch {
        return null; // skip fissures that fail to convert
      }
    })
    .filter((c): c is CrackLine3D => c !== null); // type-safe filter
}

// ── Individual Fissure Line ───────────────────────────────────────────

function FisuraLinea3D({
  crack,
  seleccionado,
  onClick,
}: {
  crack: CrackLine3D;
  seleccionado: boolean;
  onClick: (id: number, roiId: string) => void;
}) {
  const [hovered, setHovered] = useState(false);

  // Guard: skip if not enough valid points for TubeGeometry
  const puntosValidos = useMemo(
    () => crack.puntos.filter((p) => p && isFinite(p.x) && isFinite(p.y) && isFinite(p.z)),
    [crack.puntos]
  );
  if (puntosValidos.length < 2) return null;

  // Visual thickness based on real fissure width
  const lineWidth = Math.min(Math.max(crack.anchoMm / 5, 0.03), 0.15);
  const escala = hovered || seleccionado ? 1.4 : 1;

  const curve = useMemo(
    () => new THREE.CatmullRomCurve3(puntosValidos),
    [puntosValidos]
  );

  return (
    <group>
      {/* Main tube — clickable */}
      <mesh
        onClick={(e) => {
          e.stopPropagation();
          onClick(crack.id, crack.roiId);
        }}
        onPointerOver={(e) => {
          e.stopPropagation();
          setHovered(true);
          document.body.style.cursor = 'pointer';
        }}
        onPointerOut={() => {
          setHovered(false);
          document.body.style.cursor = 'default';
        }}
      >
        <tubeGeometry
          args={[
            curve,
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

      {/* Glow ring for critical / selected / hovered fissures */}
      {(hovered || seleccionado || crack.tipo === 'gruesa') && (
        <mesh>
          <tubeGeometry
            args={[
              curve,
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

      {/* HTML label on hover */}
      {hovered && (
        <Html
          position={puntosValidos[Math.floor(puntosValidos.length / 2)]
            .clone()
            .add(new THREE.Vector3(0, 0.3, 0))}
          center
          distanceFactor={6}
        >
          <div className="rounded-lg border border-dark-border bg-dark-surface/95 px-3 py-2 text-xs shadow-2xl backdrop-blur-sm">
            <p className="font-bold text-dark-accent">{crack.roiId}</p>
            <p className="text-dark-secondary">
              {crack.largoMm.toFixed(1)} × {crack.anchoMm.toFixed(2)} mm
            </p>
            <p className="text-dark-secondary capitalize">{crack.tipo}</p>
          </div>
        </Html>
      )}
    </group>
  );
}

// ── Main Effect Component ─────────────────────────────────────────────

export default function FissureHighlightEffect({
  fissures,
}: FissureHighlightEffectProps) {
  const selectedCrackId = useSlopeStore((s) => s.selectedCrackId);
  const selectCrack = useSlopeStore((s) => s.selectCrack);

  const crackLines = useMemo(
    () => transformFisuras(fissures ?? []),
    [fissures]
  );

  const handleClick = useCallback(
    (_id: number, roiId: string) => {
      // Toggle selection: if already selected, deselect
      selectCrack(roiId === selectedCrackId ? null : roiId);
    },
    [selectedCrackId, selectCrack]
  );

  if (crackLines.length === 0) return null;

  return (
    <group>
      {crackLines.map((crack) => (
        <FisuraLinea3D
          key={crack.id}
          crack={crack}
          seleccionado={crack.roiId === selectedCrackId}
          onClick={handleClick}
        />
      ))}
    </group>
  );
}

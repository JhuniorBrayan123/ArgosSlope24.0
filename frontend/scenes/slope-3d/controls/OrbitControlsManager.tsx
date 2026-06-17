/**
 * ARGOS SLOPE 4.0 — OrbitControls Manager.
 *
 * Reusable R3F component wrapping OrbitControls with sensible
 * constraints for mining slope viewing. Auto-rotate is toggleable
 * via the `autoRotate` prop, controlled externally (e.g. by SceneToolbar).
 *
 * Camera is constrained to prevent going below the terrain and
 * to keep the slope in focus at a comfortable distance.
 */

'use client';

import { OrbitControls } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import { INCLINACION_RAD, SLOPE } from '../scene/terrain';

// ── Props ────────────────────────────────────────────────────────────

export interface OrbitControlsManagerProps {
  /** Enable auto-rotation (default: false) */
  autoRotate?: boolean;
  /** Auto-rotation speed multiplier (default: 1) */
  autoRotateSpeed?: number;
}

// ── Component ─────────────────────────────────────────────────────────

export default function OrbitControlsManager({
  autoRotate = false,
  autoRotateSpeed = 1,
}: OrbitControlsManagerProps) {
  const { camera, gl } = useThree();

  // Target centered on the slope mass
  const target = [
    0,
    SLOPE.alto * 0.4 * Math.sin(INCLINACION_RAD),
    -2,
  ] as const;

  return (
    <OrbitControls
      camera={camera}
      domElement={gl.domElement}
      // Damping for smooth interaction
      enableDamping
      dampingFactor={0.1}
      // Distance limits — prevent going inside the terrain or too far
      minDistance={4}
      maxDistance={25}
      // Polar angle — prevent going below the terrain
      maxPolarAngle={Math.PI / 2.1}
      // Azimuth angle — full rotation around the slope
      minAzimuthAngle={-Infinity}
      maxAzimuthAngle={Infinity}
      // Target at slope center
      target={target}
      // Auto-rotate (controlled externally)
      autoRotate={autoRotate}
      autoRotateSpeed={autoRotateSpeed}
      // Enable/disable pan (disabled for slope viewing focus)
      enablePan={false}
    />
  );
}

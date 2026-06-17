'use client';

/**
 * ARGOS SLOPE 4.0 — Vista 2D del Talud (fallback cuando no hay malla 3D).
 *
 * Se muestra cuando reconstruction.mode !== '3d_valid'.
 * Renderiza la imagen real de la cámara (image_base64) con:
 *   - Bounding boxes de fisuras proyectados como overlay SVG
 *   - Banner "3D no disponible" con razón y score de calidad
 *   - Estado vacío "Esperando datos del Edge" cuando no hay imagen
 */

import React, { useMemo } from 'react';
import type { Datos3D } from '@/hooks/useDatos3D';

interface Vista2DTaludProps {
  datos: Datos3D;
}

const CRACK_COLORS: Record<string, string> = {
  transversal: '#ff4444',
  longitudinal: '#ff8800',
  diagonal: '#ffcc00',
  ramificada: '#ff44cc',
  mapa: '#44ccff',
  none: '#00d4a8',
  unknown: '#888888',
};

function getCrackColor(cls?: string): string {
  if (!cls) return CRACK_COLORS.none;
  return CRACK_COLORS[cls.toLowerCase()] ?? CRACK_COLORS.none;
}

export default function Vista2DTalud({ datos }: Vista2DTaludProps) {
  const { imageBase64, cracks, reconstruction } = datos;

  const rejectReason = reconstruction?.reject_reason || '';
  const qualityScore = reconstruction?.quality_score;
  const message = reconstruction?.message || '';
  const mode = reconstruction?.mode;

  // Human-readable reject reason labels
  const rejectLabels: Record<string, string> = {
    no_roi: 'ROI no configurado',
    insufficient_valid_depth: 'Profundidad insuficiente',
    invalid_depth_variance: 'Escena plana / sin textura',
    cluttered_scene: 'Escena con múltiples objetos',
    no_dominant_plane: 'Sin superficie dominante',
    low_quality: 'Calidad insuficiente',
    no_faces: 'Sin triángulos generados',
    low_face_ratio: 'Malla inestable',
    insufficient_faces: 'Muy pocas caras',
    simulator: 'Modo simulador',
    '': '3D no disponible',
  };

  const rejectLabel = rejectLabels[rejectReason] ?? rejectReason;

  // Extract image dimensions from base64 for SVG viewport (estimate or default)
  const imgSrc = imageBase64 ? `data:image/jpeg;base64,${imageBase64}` : null;

  // Compute bounding boxes for SVG overlay
  // We don't know exact image dims, so use percentages via viewBox on image
  const crackBoxes = useMemo(() => {
    return cracks.filter((c) => c.x !== undefined && c.w !== undefined && c.w > 0);
  }, [cracks]);

  return (
    <div style={{
      width: '100%',
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      background: '#0a0a12',
      borderRadius: '12px',
      overflow: 'hidden',
      position: 'relative',
      minHeight: '400px',
    }}>
      {/* ── "3D no disponible" banner ── */}
      <div style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 20,
        background: 'linear-gradient(90deg, rgba(255,120,0,0.9) 0%, rgba(200,60,0,0.85) 100%)',
        padding: '8px 16px',
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        backdropFilter: 'blur(4px)',
      }}>
        <span style={{ fontSize: '18px' }}>⚠️</span>
        <div>
          <div style={{
            color: '#fff',
            fontWeight: 700,
            fontSize: '13px',
            fontFamily: 'Inter, system-ui, sans-serif',
          }}>
            3D no disponible — {rejectLabel}
          </div>
          {qualityScore !== undefined && qualityScore > 0 && (
            <div style={{ color: 'rgba(255,255,255,0.8)', fontSize: '11px' }}>
              Score de calidad: {qualityScore.toFixed(2)} / 1.00
            </div>
          )}
          {message && (
            <div style={{
              color: 'rgba(255,255,255,0.75)',
              fontSize: '11px',
              maxWidth: '700px',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}>
              {message}
            </div>
          )}
        </div>
        <div style={{ marginLeft: 'auto', color: 'rgba(255,255,255,0.6)', fontSize: '11px' }}>
          Vista 2D
        </div>
      </div>

      {/* ── Main content area ── */}
      {imgSrc ? (
        <div style={{
          flex: 1,
          position: 'relative',
          marginTop: '44px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
          background: '#050510',
        }}>
          {/* Real camera frame */}
          <img
            src={imgSrc}
            alt="Frame del talud"
            style={{
              maxWidth: '100%',
              maxHeight: '100%',
              objectFit: 'contain',
              display: 'block',
            }}
          />
          {/* SVG overlay for crack bounding boxes */}
          {crackBoxes.length > 0 && (
            <svg
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                pointerEvents: 'none',
              }}
              viewBox="0 0 640 360"
              preserveAspectRatio="xMidYMid meet"
            >
              {crackBoxes.map((crack, i) => {
                const x = crack.x ?? 0;
                const y = crack.y ?? 0;
                const w = crack.w ?? 10;
                const h = crack.h ?? 10;
                const color = getCrackColor(crack.classification);
                const label = crack.roi_id || `F${i + 1}`;
                return (
                  <g key={crack.roi_id || i}>
                    <rect
                      x={x}
                      y={y}
                      width={w}
                      height={h}
                      fill="none"
                      stroke={color}
                      strokeWidth={2}
                      opacity={0.9}
                    />
                    <rect
                      x={x}
                      y={y - 16}
                      width={label.length * 7 + 8}
                      height={16}
                      fill={color}
                      opacity={0.85}
                      rx={3}
                    />
                    <text
                      x={x + 4}
                      y={y - 4}
                      fill="#fff"
                      fontSize={10}
                      fontFamily="Inter, monospace"
                      fontWeight="600"
                    >
                      {label}
                    </text>
                    {/* Width annotation */}
                    {crack.width_mm !== undefined && crack.width_mm > 0 && (
                      <text
                        x={x + w + 4}
                        y={y + h / 2}
                        fill={color}
                        fontSize={9}
                        fontFamily="monospace"
                      >
                        {crack.width_mm.toFixed(1)}mm
                      </text>
                    )}
                  </g>
                );
              })}
            </svg>
          )}
        </div>
      ) : (
        /* ── Empty state ── */
        <div style={{
          flex: 1,
          marginTop: '44px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '16px',
          color: 'rgba(255,255,255,0.3)',
        }}>
          <div style={{ fontSize: '48px' }}>📷</div>
          <div style={{
            textAlign: 'center',
            fontFamily: 'Inter, system-ui, sans-serif',
          }}>
            <div style={{ fontSize: '16px', fontWeight: 600, color: 'rgba(255,255,255,0.5)' }}>
              Esperando frame del Edge
            </div>
            <div style={{ fontSize: '13px', marginTop: '6px' }}>
              El Edge debe enviar image_base64 en el payload MQTT
            </div>
            {cracks.length > 0 && (
              <div style={{
                marginTop: '12px',
                padding: '8px 16px',
                background: 'rgba(0,212,168,0.15)',
                borderRadius: '8px',
                color: '#00d4a8',
                fontSize: '13px',
              }}>
                {cracks.length} fisura{cracks.length !== 1 ? 's' : ''} detectada{cracks.length !== 1 ? 's' : ''} (sin imagen)
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Bottom status bar ── */}
      <div style={{
        padding: '6px 16px',
        background: 'rgba(0,0,0,0.6)',
        display: 'flex',
        alignItems: 'center',
        gap: '16px',
        borderTop: '1px solid rgba(255,255,255,0.06)',
      }}>
        <span style={{
          fontSize: '11px',
          color: 'rgba(255,255,255,0.4)',
          fontFamily: 'Inter, monospace',
        }}>
          {cracks.length} fisura{cracks.length !== 1 ? 's' : ''} detectada{cracks.length !== 1 ? 's' : ''}
        </span>
        {datos.timestamp && (
          <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.3)', marginLeft: 'auto' }}>
            {new Date(datos.timestamp).toLocaleTimeString('es-PE')}
          </span>
        )}
      </div>
    </div>
  );
}

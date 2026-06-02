'use client';

import { useRef, useEffect, useCallback, useState } from 'react';
import mqtt, { MqttClient } from 'mqtt';

/**
 * Representa una fisura detectada, enviada por MQTT desde el edge.
 */
interface FisuraDetectada {
  roi_id: string;
  event: string;
  device_id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  length_mm: number;
  width_mm: number;
  area_mm2: number;
  classification: 'fina' | 'media' | 'gruesa' | 'none';
  orientation_deg: number;
  confidence: number;
  timestamp: number;
}

/**
 * Mapa de colores por clasificación (CSS rgba strings).
 */
const COLOR_MAP: Record<string, string> = {
  fina: 'rgba(0, 212, 170, 0.9)',
  media: 'rgba(245, 158, 11, 0.9)',
  gruesa: 'rgba(239, 68, 68, 0.9)',
  none: 'rgba(170, 170, 170, 0.6)',
};

const BG_MAP: Record<string, string> = {
  fina: 'rgba(0, 212, 170, 0.15)',
  media: 'rgba(245, 158, 11, 0.15)',
  gruesa: 'rgba(239, 68, 68, 0.15)',
  none: 'rgba(170, 170, 170, 0.08)',
};

interface FisuraOverlayProps {
  /**
   * URL del broker MQTT (WebSocket).
   * Ejemplo local: "ws://192.168.1.100:9001"
   * Ejemplo HiveMQ Cloud: "wss://tu-cluster.s2.eu.hivemq.cloud:8884/mqtt"
   */
  mqttUrl: string;
  /** Topic MQTT al que suscribirse (default: "argos/+/fisura") */
  mqttTopic?: string;
  /** Usuario MQTT (requerido para HiveMQ Cloud) */
  mqttUsername?: string;
  /** Contraseña MQTT (requerido para HiveMQ Cloud) */
  mqttPassword?: string;
  /** Ancho del canvas (debe coincidir con el ancho del video) */
  width: number;
  /** Alto del canvas (debe coincidir con el alto del video) */
  height: number;
}

/**
 * FisuraOverlay — Canvas overlay que se conecta via MQTT WebSocket
 * y dibuja bounding boxes de fisuras detectadas en tiempo real.
 */
export default function FisuraOverlay({
  mqttUrl,
  mqttTopic = 'argos/+/fisura',
  mqttUsername,
  mqttPassword,
  width,
  height,
}: FisuraOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const clientRef = useRef<MqttClient | null>(null);
  const fisurasRef = useRef<FisuraDetectada[]>([]);
  const animFrameRef = useRef<number>(0);
  const [connected, setConnected] = useState(false);

  // ── Dibujar en canvas ───────────────────────────────────────────
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const fisuras = fisurasRef.current;

    // Limpiar canvas
    ctx.clearRect(0, 0, width, height);

    // Dibujar cada fisura
    for (const f of fisuras) {
      const color = COLOR_MAP[f.classification] || COLOR_MAP.none;
      const bgColor = BG_MAP[f.classification] || BG_MAP.none;

      // ── Bounding box ─────────────────────────────────
      ctx.fillStyle = bgColor;
      ctx.fillRect(f.x, f.y, f.width, f.height);

      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.strokeRect(f.x, f.y, f.width, f.height);

      // ── Label ─────────────────────────────────────────
      const label = `${f.roi_id} (${f.classification})`;
      const medida = `${f.length_mm.toFixed(1)}mm`;

      ctx.font = '11px "Inter", sans-serif';
      const textW = ctx.measureText(label).width;

      // Fondo del texto
      ctx.fillStyle = color;
      const labelH = 18;
      ctx.fillRect(f.x, f.y - labelH, textW + 10, labelH);

      // Texto
      ctx.fillStyle = '#0f172a';
      ctx.fillText(label, f.x + 5, f.y - 5);

      // ── Medida (abajo) ────────────────────────────────
      const medW = ctx.measureText(medida).width;
      ctx.fillStyle = color;
      ctx.fillRect(f.x, f.y + f.height, medW + 10, 16);
      ctx.fillStyle = '#0f172a';
      ctx.font = '10px "Inter", sans-serif';
      ctx.fillText(medida, f.x + 5, f.y + f.height + 12);

      // ── Indicador de confianza (opcional) ─────────────
      if (f.confidence > 0) {
        const barW = f.width;
        const barH = 3;
        ctx.fillStyle = 'rgba(255,255,255,0.2)';
        ctx.fillRect(f.x, f.y + f.height + 20, barW, barH);
        ctx.fillStyle = color;
        ctx.fillRect(f.x, f.y + f.height + 20, barW * f.confidence, barH);
      }
    }
  }, [width, height]);

  // ── Conectar MQTT ───────────────────────────────────────────────
  useEffect(() => {
    if (!mqttUrl) return;

    // Limpiar conexión anterior
    if (clientRef.current) {
      clientRef.current.end(true);
    }

    const client = mqtt.connect(mqttUrl, {
      protocolId: 'MQTT',
      protocolVersion: 4,
      clean: true,
      reconnectPeriod: 5000,
      connectTimeout: 10000,
      username: mqttUsername,
      password: mqttPassword,
    });

    clientRef.current = client;

    client.on('connect', () => {
      console.log('[FisuraOverlay] MQTT connected:', mqttUrl);
      client.subscribe(mqttTopic, { qos: 1 });
      setConnected(true);
    });

    client.on('message', (topic, payload) => {
      try {
        const data = JSON.parse(payload.toString()) as FisuraDetectada;

        // Actualizar/agregar fisura
        const existing = fisurasRef.current.findIndex(
          (f) => f.roi_id === data.roi_id
        );

        if (existing >= 0) {
          fisurasRef.current[existing] = data;
        } else {
          fisurasRef.current = [...fisurasRef.current, data];
          // Limitar a 50 fisuras visibles
          if (fisurasRef.current.length > 50) {
            fisurasRef.current = fisurasRef.current.slice(-50);
          }
        }

        // Forzar redibujado
        draw();
      } catch (err) {
        console.warn('[FisuraOverlay] Invalid MQTT message:', err);
      }
    });

    client.on('close', () => {
      console.log('[FisuraOverlay] MQTT disconnected');
      setConnected(false);
    });

    client.on('error', (err) => {
      console.warn('[FisuraOverlay] MQTT error:', err.message);
    });

    return () => {
      client.end(true);
      clientRef.current = null;
      setConnected(false);
    };
  }, [mqttUrl, mqttTopic, draw]);

  // ── Loop de animación (redibuja periódicamente para limpiar fisuras viejas) ─
  useEffect(() => {
    let mounted = true;

    const loop = () => {
      if (!mounted) return;

      // Limpiar fisuras con más de 5 segundos sin actualización
      const now = Date.now() / 1000;
      fisurasRef.current = fisurasRef.current.filter(
        (f) => now - f.timestamp < 5.0
      );

      draw();
      animFrameRef.current = requestAnimationFrame(loop);
    };

    animFrameRef.current = requestAnimationFrame(loop);

    return () => {
      mounted = false;
      cancelAnimationFrame(animFrameRef.current);
    };
  }, [draw]);

  // ── Render ──────────────────────────────────────────────────────
  return (
    <div className="relative">
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        className="absolute inset-0 h-full w-full"
        style={{ pointerEvents: 'none' }}
      />
      {!connected && (
        <div className="absolute bottom-2 left-2 rounded bg-dark-surface/80 px-2 py-0.5 text-xs text-dark-secondary">
          MQTT: reconectando...
        </div>
      )}
    </div>
  );
}

/**
 * ARGOS SLOPE 4.0 — useMqttPuntos Hook.
 *
 * React hook that connects to the MQTT broker over WebSocket and subscribes
 * to the 3D point cloud alert topic (``mineria/talud/alertas``).
 *
 * Returns parsed payload fields so that dashboard components can render
 * the point cloud viewer, crack data, and connection status.
 *
 * Usage:
 *   ```tsx
 *   const { pointCloud, cracks, imagePath, timestamp, connected } = useMqttPuntos();
 *   ```
 *
 * Dependencies: mqtt.js (already in package.json)
 */

'use client';

import { useEffect, useState, useRef, useCallback } from 'react';

// ── Types ────────────────────────────────────────────────────────────────

export interface Point3D {
  x: number;
  y: number;
  z: number;
  r: number;
  g: number;
  b: number;
}

export interface CrackData {
  x: number;
  y: number;
  w: number;
  h: number;
  classification: string;
  roi_id: string;
}

export interface AlertPayload {
  device_id: string;
  /** ISO-8601 timestamp string, e.g. "2026-06-02T01:30:00" */
  timestamp: string;
  /** Array of [x, y, z, r, g, b] tuples */
  point_cloud: number[][];
  cracks: CrackData[];
  image_path: string;
  point_count: number;
}

export interface MqttPuntosState {
  /** Point cloud as an array of [x, y, z, r, g, b] tuples */
  pointCloud: number[][];
  /** List of crack detections from the alert */
  cracks: CrackData[];
  /** Filesystem path to the saved annotated frame */
  imagePath: string;
  /** ISO-8601 timestamp of the latest alert */
  timestamp: string | null;
  /** Whether the MQTT WebSocket connection is established */
  connected: boolean;
}

// ── Constants ────────────────────────────────────────────────────────────

const MQTT_WS_URL =
  process.env.NEXT_PUBLIC_MQTT_WS_URL ||
  'wss://f7d15ef59be6462fa26af237cfa21b0f.s1.eu.hivemq.cloud:8884/mqtt';

const MQTT_USERNAME = process.env.NEXT_PUBLIC_MQTT_USERNAME || 'argos-edge';
const MQTT_PASSWORD = process.env.NEXT_PUBLIC_MQTT_PASSWORD || 'Argosmineria123.@';

const ALERT_TOPIC = process.env.NEXT_PUBLIC_ALERT_TOPIC || 'mineria/talud/alertas';

// ── Hook ─────────────────────────────────────────────────────────────────

export function useMqttPuntos(): MqttPuntosState {
  const [state, setState] = useState<MqttPuntosState>({
    pointCloud: [],
    cracks: [],
    imagePath: '',
    timestamp: null,
    connected: false,
  });

  const clientRef = useRef<any>(null);
  const mountedRef = useRef(true);

  // ── Stable updater (avoids stale closure issues) ─────────────────
  const updateFromPayload = useCallback((payload: AlertPayload) => {
    setState({
      pointCloud: payload.point_cloud ?? [],
      cracks: payload.cracks ?? [],
      imagePath: payload.image_path ?? '',
      timestamp: payload.timestamp ?? null,
      connected: true,
    });
  }, []);

  // ── Connect / disconnect lifecycle ───────────────────────────────
  useEffect(() => {
    mountedRef.current = true;

    async function connect() {
      try {
        // Dynamically import mqtt.js (ESM-compatible)
        const mqtt = await import('mqtt');

        const client = mqtt.default.connect(MQTT_WS_URL, {
          protocolVersion: 4, // MQTT 3.1.1
          clean: true,
          reconnectPeriod: 5000,
          connectTimeout: 10_000,
          keepalive: 60,
          username: MQTT_USERNAME,
          password: MQTT_PASSWORD,
        });

        clientRef.current = client;

        client.on('connect', () => {
          if (!mountedRef.current) return;
          console.info('[useMqttPuntos] Connected to MQTT broker');

          client.subscribe(ALERT_TOPIC, { qos: 1 }, (err: Error | null) => {
            if (err) {
              console.warn('[useMqttPuntos] Subscribe error:', err.message);
            } else {
              console.info('[useMqttPuntos] Subscribed to', ALERT_TOPIC);
            }
          });
        });

        client.on('message', (_topic: string, raw: Buffer) => {
          if (!mountedRef.current) return;
          try {
            const payload: AlertPayload = JSON.parse(raw.toString());
            updateFromPayload(payload);
          } catch (err) {
            console.warn('[useMqttPuntos] Failed to parse payload:', err);
          }
        });

        client.on('reconnect', () => {
          if (!mountedRef.current) return;
          console.info('[useMqttPuntos] Reconnecting...');
        });

        client.on('close', () => {
          if (!mountedRef.current) return;
          setState((prev) => ({ ...prev, connected: false }));
        });

        client.on('offline', () => {
          if (!mountedRef.current) return;
          setState((prev) => ({ ...prev, connected: false }));
        });

        client.on('error', (err: Error) => {
          console.warn('[useMqttPuntos] Connection error:', err.message);
        });
      } catch (err) {
        console.error('[useMqttPuntos] Failed to create MQTT client:', err);
      }
    }

    connect();

    // ── Cleanup on unmount ─────────────────────────────────────────
    return () => {
      mountedRef.current = false;
      if (clientRef.current) {
        clientRef.current.end(true);
        clientRef.current = null;
      }
    };
  }, [updateFromPayload]);

  return state;
}

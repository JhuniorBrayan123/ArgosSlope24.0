/**
 * ARGOS SLOPE 4.0 — Hook: useAlertas3D.
 *
 * Subscribes to the MQTT topic "mineria/talud/alertas" where the Edge
 * publishes real 3D point clouds and crack data via publish_alert_3d().
 *
 * Returns the latest Alert3DPayload or null if no data has arrived.
 * Automatically reconnects and handles connection state.
 */

'use client';

import { useEffect, useRef, useState } from 'react';
import mqtt, { MqttClient } from 'mqtt';
import type { Alert3DPayload } from '@/services/pointcloud.types';

export type MqttStatus = 'connecting' | 'connected' | 'disconnected' | 'error';

export interface UseAlertas3DResult {
  /** Latest 3D alert payload (null while waiting) */
  data: Alert3DPayload | null;
  /** Connection status */
  status: MqttStatus;
  /** Human-readable status message */
  statusMessage: string;
  /** Error message if status === 'error' */
  error: string | null;
  /** Manually reconnect */
  reconnect: () => void;
}

/**
 * Subscribe to the Edge's 3D alert topic.
 *
 * @param mqttWsUrl  WebSocket URL of the MQTT broker
 *                    (defaults to NEXT_PUBLIC_MQTT_WS_URL)
 * @param topic      MQTT topic (defaults to "mineria/talud/alertas")
 * @param username   Optional MQTT username
 * @param password   Optional MQTT password
 */
export default function useAlertas3D(
  mqttWsUrl?: string,
  topic: string = 'mineria/talud/alertas',
  username?: string,
  password?: string
): UseAlertas3DResult {
  const url =
    mqttWsUrl ||
    process.env.NEXT_PUBLIC_MQTT_WS_URL ||
    'wss://f7d15ef59be6462fa26af237cfa21b0f.s1.eu.hivemq.cloud:8884/mqtt';

  const mqttUser =
    username || process.env.NEXT_PUBLIC_MQTT_USERNAME || '';
  const mqttPass =
    password || process.env.NEXT_PUBLIC_MQTT_PASSWORD || '';

  const clientRef = useRef<MqttClient | null>(null);
  const [data, setData] = useState<Alert3DPayload | null>(null);
  const [status, setStatus] = useState<MqttStatus>('disconnected');
  const [statusMessage, setStatusMessage] = useState(
    'Desconectado — esperando conexión MQTT...'
  );
  const [error, setError] = useState<string | null>(null);

  const connect = () => {
    if (clientRef.current) {
      clientRef.current.end(true);
    }

    setStatus('connecting');
    setStatusMessage('Conectando al broker MQTT...');
    setError(null);

    try {
      const opts: Record<string, unknown> = {};
      if (mqttUser) opts.username = mqttUser;
      if (mqttPass) opts.password = mqttPass;

      const client = mqtt.connect(url, opts);
      clientRef.current = client;

      client.on('connect', () => {
        setStatus('connected');
        setStatusMessage('Conectado — esperando datos 3D del Edge...');
        setError(null);
        client.subscribe(topic, { qos: 1 });
      });

      client.on('message', (receivedTopic: string, raw: Buffer) => {
        if (receivedTopic !== topic) return;
        try {
          const parsed: Alert3DPayload = JSON.parse(raw.toString());
          if (parsed && parsed.point_cloud) {
            setData(parsed);
            setStatusMessage(
              `Datos en vivo desde MQTT · ${parsed.point_cloud.length} pts · ${parsed.cracks?.length ?? 0} fisuras`
            );
          }
        } catch {
          // Ignore malformed messages
        }
      });

      client.on('error', (err: Error) => {
        setStatus('error');
        setStatusMessage('Error de conexión MQTT');
        setError(err.message);
      });

      client.on('close', () => {
        if (status !== 'error') {
          setStatus('disconnected');
          setStatusMessage('Desconectado — esperando reconexión...');
        }
      });

      client.on('offline', () => {
        setStatus('disconnected');
        setStatusMessage('Broker MQTT no disponible');
      });
    } catch (err) {
      setStatus('error');
      setStatusMessage('Error al iniciar conexión MQTT');
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  useEffect(() => {
    connect();
    return () => {
      if (clientRef.current) {
        clientRef.current.end(true);
        clientRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, topic, mqttUser, mqttPass]);

  const reconnect = () => connect();

  return { data, status, statusMessage, error, reconnect };
}

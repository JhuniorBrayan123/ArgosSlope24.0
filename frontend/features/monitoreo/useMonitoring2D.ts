import { useState, useEffect, useCallback } from 'react';
import mqtt from 'mqtt';

// Con el proxy de Next.js en next.config.js, /api/* se redirige a localhost:5000/api/*
// Así evitamos CORS y no necesitamos la URL absoluta del backend
const MQTT_USER = process.env.NEXT_PUBLIC_MQTT_USERNAME || '';
const MQTT_PASS = process.env.NEXT_PUBLIC_MQTT_PASSWORD || '';
const DEVICE_ID = 'argos-edge-01'; // debe coincidir con config.device_id del Edge

// Mapeo de comando → endpoint del backend
const COMMAND_ENDPOINTS: Record<string, string> = {
  capture:            '/api/monitoring-2d/capture',
  save_base_image:    '/api/monitoring-2d/base-image',
  compare_detachment: '/api/monitoring-2d/compare-detachment',
};

export function useMonitoring2D(mqttUrl: string, zoneId: string) {
  const [analysisResult, setAnalysisResult] = useState<any>(null);
  const [baseImageSaved, setBaseImageSaved] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string>('');

  useEffect(() => {
    if (!mqttUrl) return;

    const mqttClient = mqtt.connect(mqttUrl, {
      clientId: `web_2d_${Math.random().toString(16).slice(2, 8)}`,
      keepalive: 60,
      username: MQTT_USER || undefined,
      password: MQTT_PASS || undefined,
    });

    mqttClient.on('connect', () => {
      console.log('[2D Monitor] MQTT conectado');
      mqttClient.subscribe('argos/+/analysis2d');
    });

    mqttClient.on('error', (err) => {
      console.error('[2D Monitor] MQTT error:', err);
    });

    mqttClient.on('message', (_topic, message) => {
      try {
        const payload = JSON.parse(message.toString());
        if (payload.zoneId !== zoneId) return;

        if (payload.isBaseImage) {
          setBaseImageSaved(true);
          setIsCapturing(false);
          setStatusMessage('✅ Imagen base guardada en el Edge');
          setTimeout(() => setStatusMessage(''), 3000);
        } else {
          setAnalysisResult(payload);
          setIsCapturing(false);
          setStatusMessage(`✅ Análisis completo — ${payload.cracks?.length ?? 0} fisuras detectadas`);
          setTimeout(() => setStatusMessage(''), 4000);
        }
      } catch (e) {
        console.error('[2D Monitor] Error parseando mensaje MQTT:', e);
      }
    });

    return () => {
      mqttClient.end();
    };
  }, [mqttUrl, zoneId]);

  const sendCommand = useCallback(async (command: string, roi: any) => {
    const endpoint = COMMAND_ENDPOINTS[command];
    if (!endpoint) {
      console.error(`[2D Monitor] Comando desconocido: ${command}`);
      return;
    }

    setIsCapturing(true);
    setStatusMessage('⏳ Enviando comando al Edge...');

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          zoneId,
          deviceId: DEVICE_ID,
          roi,
        }),
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Error ${response.status}: ${text}`);
      }

      const data = await response.json();
      if (!data.success) {
        throw new Error(data.message || 'El backend rechazó el comando');
      }

      setStatusMessage('⏳ Comando enviado, esperando respuesta del Edge...');
    } catch (error: any) {
      console.error('[2D Monitor] Error enviando comando:', error);
      setStatusMessage(`❌ ${error.message}`);
      setIsCapturing(false);
    }
  }, [zoneId]);

  return {
    analysisResult,
    baseImageSaved,
    isCapturing,
    statusMessage,
    sendCommand,
  };
}

'use client';

import { useState, useEffect, useCallback } from 'react';
// mqtt will be imported dynamically in useEffect to prevent SSR issues

// Con el proxy de Next.js en next.config.js, /api/* se redirige a localhost:5000/api/*
// Así evitamos CORS y no necesitamos la URL absoluta del backend
const MQTT_USER = process.env.NEXT_PUBLIC_MQTT_USERNAME || '';
const MQTT_PASS = process.env.NEXT_PUBLIC_MQTT_PASSWORD || '';
const DEVICE_ID = 'argos-edge-01';

// Mapeo de comando → endpoint del backend
const COMMAND_ENDPOINTS: Record<string, string> = {
  capture:            '/api/monitoring-2d/capture',
  save_base_image:    '/api/monitoring-2d/base-image',
  compare_detachment: '/api/monitoring-2d/compare-detachment',
};

export interface AnalysisData {
  success: boolean;
  analysis_id: string;
  timestamp: string;
  type: 'base' | 'current';
  zoneId: string;
  summary: {
    total_fisuras: number;
    longitud_total_cm: number;
    familias: Record<string, { count: number; total_cm: number }>;
  };
  images: {
    calibrada?: string;
    mask?: string;
    skeleton?: string;
    familias_overlay?: string;
  };
  cracks: any[];
  spacing: any;
  total_fisuras: number;
  total_length_cm: number;
  familias: any;
  csv?: string;
  json?: string;
  imageBase64?: string;
}

export interface ComparisonData {
  success: boolean;
  comparison_id: string;
  base_analysis_id: string;
  current_analysis_id: string;
  timestamp: string;
  zoneId: string;
  severity?: string;
  event_type?: string;
  recommendation?: string;
  summary: {
    fisuras_base: number;
    fisuras_actual: number;
    longitud_base_cm: number;
    longitud_actual_cm: number;
    diferencia_fisuras: number;
    diferencia_longitud_cm: number;
  };
  images: {
    comparacion_original?: string;
    comparacion_final?: string;
    comparacion_skeletons?: string;
    comparacion_topleft?: string;
  };
  comparison: any;
  cracks: any[];
  spacing: any;
  total_fisuras: number;
  current_analysis: {
    images: any;
    summary: any;
  };
}

export function useMonitoring2D(mqttUrl: string, zoneId: string) {
  // ── Estados separados ──────────────────────────────────────────
  const [baseAnalysis, setBaseAnalysis] = useState<AnalysisData | null>(null);
  const [baseLoading, setBaseLoading] = useState(false);
  const [baseError, setBaseError] = useState<string | null>(null);

  const [currentAnalysis, setCurrentAnalysis] = useState<AnalysisData | null>(null);
  const [currentLoading, setCurrentLoading] = useState(false);
  const [currentError, setCurrentError] = useState<string | null>(null);

  const [comparisonResult, setComparisonResult] = useState<ComparisonData | null>(null);
  const [comparisonLoading, setComparisonLoading] = useState(false);
  const [comparisonError, setComparisonError] = useState<string | null>(null);

  const [statusMessage, setStatusMessage] = useState<string>('');
  const hasResults = !!(baseAnalysis || currentAnalysis || comparisonResult);

  // ── MQTT ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!mqttUrl) return;

    let mqttClient: any = null;

    import('mqtt').then((mqttModule) => {
      const mqtt = mqttModule.default || mqttModule;
      mqttClient = mqtt.connect(mqttUrl, {
        clientId: `web_2d_${Math.random().toString(16).slice(2, 8)}`,
        keepalive: 60,
        username: MQTT_USER || undefined,
        password: MQTT_PASS || undefined,
      });

      mqttClient.on('connect', () => {
        console.log('[2D Monitor] MQTT conectado');
        mqttClient.subscribe('argos/+/analysis2d');
      });

      mqttClient.on('error', (err: any) => {
        console.error('[2D Monitor] MQTT error:', err);
      });

      mqttClient.on('message', (_topic: string, message: any) => {
        try {
          const payload = JSON.parse(message.toString());
          if (payload.zoneId !== zoneId) return;

          if (payload.isBaseImage || payload.type === 'base') {
            setBaseAnalysis(payload);
            setBaseLoading(false);
            setStatusMessage('✅ Imagen base guardada y analizada');
            setTimeout(() => setStatusMessage(''), 3000);
          } else if (payload.comparison_id) {
            setComparisonResult(payload);
            setComparisonLoading(false);
            setStatusMessage('✅ Comparación completada');
            setTimeout(() => setStatusMessage(''), 3000);
          } else if (payload.type === 'current' || payload.analysis_id) {
            setCurrentAnalysis(payload);
            setCurrentLoading(false);
            setStatusMessage(`✅ Captura analizada — ${payload.cracks?.length ?? 0} fisuras`);
            setTimeout(() => setStatusMessage(''), 4000);
          }
        } catch (e) {
          console.error('[2D Monitor] Error parseando MQTT:', e);
        }
      });
    });

    return () => {
      if (mqttClient) {
        mqttClient.end();
      }
    };
  }, [mqttUrl, zoneId]);

  // ── sendCommand: maneja loading/error según el tipo ──────────────
  const sendCommand = useCallback(async (command: string, roi: any, imageBase64?: string) => {
    const endpoint = COMMAND_ENDPOINTS[command];
    if (!endpoint) {
      console.error(`[2D Monitor] Comando desconocido: ${command}`);
      return;
    }

    // Activar loading según comando
    if (command === 'save_base_image') {
      setBaseLoading(true);
      setBaseError(null);
    } else if (command === 'capture') {
      setCurrentLoading(true);
      setCurrentError(null);
    } else if (command === 'compare_detachment') {
      setComparisonLoading(true);
      setComparisonError(null);
    }

    setStatusMessage('⏳ Procesando...');

    try {
      const body: any = { zoneId, deviceId: DEVICE_ID, roi };
      if (imageBase64) {
        body.imageBase64 = imageBase64.includes('base64,')
          ? imageBase64.split('base64,')[1]
          : imageBase64;
      }

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || data.title || `Error ${response.status}`);
      }

      // Procesar respuesta según comando
      if (command === 'save_base_image') {
        setBaseAnalysis(data);
        setBaseLoading(false);
        setStatusMessage('✅ Imagen base guardada y analizada');
      } else if (command === 'capture') {
        setCurrentAnalysis(data);
        setCurrentLoading(false);
        setStatusMessage(`✅ Captura analizada — ${data.cracks?.length ?? 0} fisuras`);
      } else if (command === 'compare_detachment') {
        setComparisonResult(data);
        setComparisonLoading(false);
        setStatusMessage('✅ Comparación completada');
      }

      setTimeout(() => setStatusMessage(''), 4000);
    } catch (error: any) {
      console.error('[2D Monitor] Error:', error);
      setStatusMessage(`❌ ${error.message}`);

      if (command === 'save_base_image') {
        setBaseError(error.message);
        setBaseLoading(false);
      } else if (command === 'capture') {
        setCurrentError(error.message);
        setCurrentLoading(false);
      } else if (command === 'compare_detachment') {
        setComparisonError(error.message);
        setComparisonLoading(false);
      }
    }
  }, [zoneId]);

  // ── Limpiar resultados ─────────────────────────────────────────
  const clearResults = useCallback(() => {
    setBaseAnalysis(null);
    setCurrentAnalysis(null);
    setComparisonResult(null);
    setBaseError(null);
    setCurrentError(null);
    setComparisonError(null);
    setStatusMessage('');
  }, []);

  return {
    // Estados
    baseAnalysis,
    baseLoading,
    baseError,
    currentAnalysis,
    currentLoading,
    currentError,
    comparisonResult,
    comparisonLoading,
    comparisonError,
    statusMessage,
    hasResults,
    sendCommand,
    clearResults,
  };
}

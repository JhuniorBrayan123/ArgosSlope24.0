'use client';

import { useState, useCallback } from 'react';
import dynamic from 'next/dynamic';
import CamaraMJPEG from '@/components/CamaraMJPEG';
import Monitoring2DPanel from '@/features/monitoreo/Monitoring2DPanel';
import { useMonitoring2D } from '@/features/monitoreo/useMonitoring2D';

const TaludRoiCanvas = dynamic(() => import('@/features/monitoreo/TaludRoiCanvas'), { ssr: false });

// ── Configuración por defecto ─────────────────────────────────────
const DEFAULT_MQTT_URL = process.env.NEXT_PUBLIC_MQTT_WS_URL || 'ws://192.168.1.100:9001';
// Misma lógica que app/page.tsx: agregar /stream solo si no está ya incluido
const baseMjpegUrl = process.env.NEXT_PUBLIC_MJPEG_URL || 'http://localhost:8082';
const MJPEG_URL = baseMjpegUrl.endsWith('/stream') ? baseMjpegUrl : `${baseMjpegUrl}/stream`;
const ZONE_ID = 'talud-maqueta-01';

export default function MonitoreoPage() {
  const [mqttUrl, setMqttUrl] = useState(DEFAULT_MQTT_URL);
  
  // Tamaño aproximado 16:9 de la transmisión
  const [videoWidth] = useState(854);
  const [videoHeight] = useState(480);
  
  const [showConfig, setShowConfig] = useState(false);
  const [tempMqtt, setTempMqtt] = useState(mqttUrl);

  const [roi, setRoi] = useState({ x: 100, y: 100, w: 400, h: 300 });

  const { analysisResult, baseImageSaved, isCapturing, statusMessage, sendCommand } = useMonitoring2D(mqttUrl, ZONE_ID);

  const handleApplyConfig = useCallback(() => {
    setMqttUrl(tempMqtt);
    setShowConfig(false);
  }, [tempMqtt]);

  const handleCapture = () => sendCommand('capture', roi);
  const handleSaveBase = () => sendCommand('save_base_image', roi);
  const handleCompare = () => sendCommand('compare_detachment', roi);

  return (
    <div className="h-[calc(100vh-56px)] flex flex-col p-6 space-y-4 overflow-hidden bg-dark-primary">
      {/* ── Cabecera ─────────────────────────────────────────── */}
      <div className="flex shrink-0 items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-dark-text">
            Monitoreo 2D del Talud
          </h1>
          <p className="mt-0.5 text-sm text-dark-muted">
            Inspección visual y análisis fotogramétrico 2D con OpenCV
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowConfig(!showConfig)}
            className="btn-secondary"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
            Ajustes
          </button>
        </div>
      </div>

      {/* ── Configuración de conexión ────────────────────────── */}
      {showConfig && (
        <div className="shrink-0 argos-card p-5">
          <h2 className="mb-4 text-sm font-semibold text-dark-text">
            Configuración de Conexión MQTT
          </h2>
          <div className="grid gap-4 sm:grid-cols-1 md:grid-cols-3">
            <div className="md:col-span-2">
              <label className="mb-1.5 block text-xs font-medium text-dark-secondary">
                URL WebSocket MQTT
              </label>
              <input
                type="text"
                value={tempMqtt}
                onChange={(e) => setTempMqtt(e.target.value)}
                placeholder="ws://ip:9001"
                className="argos-input"
              />
            </div>
          </div>
          <div className="mt-4 flex justify-end gap-3 border-t border-dark-border pt-4">
            <button onClick={() => setShowConfig(false)} className="btn-secondary">
              Cancelar
            </button>
            <button onClick={handleApplyConfig} className="btn-primary">
              Aplicar Cambios
            </button>
          </div>
        </div>
      )}

      {/* ── Contenido Principal (Video + Lateral) ──────────────── */}
      <div className="flex-1 min-h-0 flex gap-6 overflow-hidden">
        {/* Panel Central: Video con ROI Canvas overlay */}
        <div className="flex-1 min-h-0 flex items-center justify-center rounded-2xl border border-dark-border bg-[#0f1115] shadow-inner relative overflow-hidden">
          <div className="relative w-full h-full max-h-full flex items-center justify-center overflow-hidden p-2">
            <div className="relative w-full max-w-full flex justify-center items-center" style={{ aspectRatio: '16/9', maxHeight: '100%' }}>
              {/* Componente base de video (MJPEG) */}
              <CamaraMJPEG
                streamUrl={MJPEG_URL}
                className="w-full h-full object-contain rounded shadow-xl"
              />
              
              {/* Overlay interactivo para dibujar ROI y fisuras */}
              <div className="absolute inset-0">
                <TaludRoiCanvas 
                  width={videoWidth}
                  height={videoHeight}
                  cracks={analysisResult?.cracks || []}
                  roiConfig={roi}
                  onRoiChange={setRoi}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Panel Lateral: Botones y Métricas */}
        <div className="w-[420px] shrink-0 h-full min-h-0 overflow-hidden flex flex-col">
          <Monitoring2DPanel
            onCapture={handleCapture}
            onSaveBase={handleSaveBase}
            onCompare={handleCompare}
            analysisResult={analysisResult}
            baseImageSaved={baseImageSaved}
            isCapturing={isCapturing}
            statusMessage={statusMessage}
          />
        </div>
      </div>
    </div>
  );
}

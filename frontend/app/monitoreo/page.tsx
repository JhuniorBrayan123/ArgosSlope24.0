'use client';

import { useState, useCallback, useRef } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { motion } from 'framer-motion';
import CamaraUSB, { CamaraUSBHandle } from '@/components/CamaraUSB';
import { useMonitoring2D } from '@/features/monitoreo/useMonitoring2D';
import GeomechanicsModal from '@/features/monitoreo/GeomechanicsModal';

const TaludRoiCanvas = dynamic(() => import('@/features/monitoreo/TaludRoiCanvas'), { ssr: false });

// ── Configuración ────────────────────────────────────────────────
const DEFAULT_MQTT_URL = process.env.NEXT_PUBLIC_MQTT_WS_URL || 'ws://192.168.1.100:9001';
const ZONE_ID = 'talud-maqueta-01';

export default function MonitoreoPage() {
  const [mqttUrl, setMqttUrl] = useState(DEFAULT_MQTT_URL);
  const camRef = useRef<CamaraUSBHandle>(null);
  const [showConfig, setShowConfig] = useState(false);
  const [showGeotechModal, setShowGeotechModal] = useState(false);
  const [tempMqtt, setTempMqtt] = useState(mqttUrl);
  const [roi, setRoi] = useState({ x: 100, y: 100, w: 400, h: 300 });

  const {
    baseAnalysis,
    baseLoading,
    currentAnalysis,
    currentLoading,
    comparisonResult,
    comparisonLoading,
    statusMessage,
    sendCommand,
    clearResults,
    hasResults,
  } = useMonitoring2D(mqttUrl, ZONE_ID);

  const isCapturing = baseLoading || currentLoading || comparisonLoading;
  const hasBase = !!baseAnalysis;

  const handleApplyConfig = useCallback(() => {
    setMqttUrl(tempMqtt);
    setShowConfig(false);
  }, [tempMqtt]);

  const handleCapture = useCallback(async () => {
    let imageBase64: string | undefined;
    try {
      if (camRef.current) imageBase64 = await camRef.current.captureFrame();
    } catch (e) {
      console.warn('[Monitoreo] No se pudo capturar frame:', e);
    }
    sendCommand('capture', roi, imageBase64);
  }, [roi, sendCommand]);

  const handleSaveBase = useCallback(async () => {
    let imageBase64: string | undefined;
    try {
      if (camRef.current) imageBase64 = await camRef.current.captureFrame();
    } catch (e) {
      console.warn('[Monitoreo] No se pudo capturar frame:', e);
    }
    sendCommand('save_base_image', roi, imageBase64);
  }, [roi, sendCommand]);

  const handleCompare = useCallback(async () => {
    let imageBase64: string | undefined;
    try {
      if (camRef.current) imageBase64 = await camRef.current.captureFrame();
    } catch (e) {
      console.warn('[Monitoreo] No se pudo capturar frame:', e);
    }
    sendCommand('compare_detachment', roi, imageBase64);
  }, [roi, sendCommand]);

  // ── Render ─────────────────────────────────────────────────────────
  return (
    <div className="h-[calc(100vh-56px)] flex flex-col bg-dark-primary">
      {/* ── Cabecera ─────────────────────────────────────────────── */}
      <div className="flex shrink-0 items-center justify-between px-4 py-2 border-b border-dark-border">
        <div>
          <h1 className="text-base font-bold text-dark-text">Cámara del Talud</h1>
          <p className="text-[10px] text-dark-muted">Capturar, analizar y comparar fisuras</p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/monitoreo/resultados"
            className="btn-secondary text-[11px] px-2.5 py-1.5"
          >
            <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            Resultados
          </Link>
          <button
            onClick={() => setShowConfig(!showConfig)}
            className="btn-secondary text-[11px] px-2.5 py-1.5"
          >
            <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            </svg>
            Ajustes
          </button>
        </div>
      </div>

      {/* ── Configuración MQTT ──────────────────────────────────── */}
      {showConfig && (
        <div className="shrink-0 argos-card p-4 border-b border-dark-border rounded-none">
          <h2 className="mb-3 text-sm font-semibold text-dark-text">Configuración MQTT</h2>
          <div className="flex gap-3">
            <input
              type="text"
              value={tempMqtt}
              onChange={(e) => setTempMqtt(e.target.value)}
              placeholder="ws://ip:9001"
              className="argos-input flex-1 text-xs"
            />
            <button onClick={handleApplyConfig} className="btn-primary text-xs px-3">Aplicar</button>
            <button onClick={() => setShowConfig(false)} className="btn-secondary text-xs px-3">Cancelar</button>
          </div>
        </div>
      )}

      {/* ── Cuerpo: Cámara grande + Controles a la derecha ─────────── */}
      <div className="flex-1 min-h-0 flex p-3 gap-3">
        {/* Cámara — ocupa todo el espacio disponible */}
        <div className="relative flex-1 rounded-xl border border-dark-border bg-[#0f1115] overflow-hidden">
          <div className="absolute inset-0">
            <CamaraUSB
              ref={camRef}
              className="w-full h-full object-contain"
            />
            <TaludRoiCanvas
              width={854}
              height={480}
              roiConfig={roi}
              onRoiChange={setRoi}
            />
            {isCapturing && (
              <motion.div
                initial={{ top: 0, opacity: 0.5 }}
                animate={{ top: '100%', opacity: [0.5, 1, 0.5] }}
                transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}
                className="absolute left-0 right-0 h-[2px] bg-dark-accent z-20 shadow-[0_0_10px_2px_rgba(14,165,197,0.8)]"
              />
            )}
          </div>

          {/* Status message superpuesto abajo-izquierda */}
          {statusMessage && (
            <div className="absolute bottom-3 left-3 z-10">
              <div className={`rounded-lg px-3 py-1.5 text-xs font-medium shadow-lg backdrop-blur-sm ${
                statusMessage.startsWith('❌')
                  ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                  : statusMessage.startsWith('✅')
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                  : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
              }`}>
                {statusMessage.replace(/^[✅❌⏳]\s*/, '')}
              </div>
            </div>
          )}
        </div>

        {/* ── Controles a la derecha ─────────────────────────────── */}
        <div className="w-[160px] shrink-0 flex flex-col gap-2">
          <button
            onClick={handleCapture}
            disabled={isCapturing}
            className="btn-primary w-full justify-center py-3 text-xs font-bold tracking-wide"
          >
            {isCapturing ? (
              <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            ) : (
              <>
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                  <circle cx="12" cy="13" r="3" />
                </svg>
                Capturar
              </>
            )}
          </button>

          <button
            onClick={handleSaveBase}
            disabled={isCapturing}
            className="btn-secondary w-full justify-center py-2.5 text-xs"
          >
            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
            </svg>
            Base
          </button>

          <button
            onClick={handleCompare}
            disabled={isCapturing || !hasBase}
            className="btn-secondary w-full justify-center py-2.5 text-xs disabled:opacity-40"
            title={!hasBase ? 'Guardá una base primero' : ''}
          >
            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            Comparar
          </button>
          <button
            onClick={() => setShowGeotechModal(true)}
            disabled={!hasBase && !currentAnalysis}
            className="btn-secondary w-full justify-center py-2.5 text-xs text-dark-accent border-dark-accent/30 hover:border-dark-accent/70 mt-2 disabled:opacity-40"
            title={!hasBase && !currentAnalysis ? 'Captura primero para evaluar' : ''}
          >
            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
            </svg>
            Evaluar Geotecnia (RQD/RMR)
          </button>

          <div className="flex-1" />

          {hasResults && (
            <button
              onClick={clearResults}
              className="text-[11px] text-dark-muted hover:text-dark-danger transition-colors underline underline-offset-2 py-1"
            >
              Limpiar
            </button>
          )}

          <Link
            href="/monitoreo/resultados"
            className="btn-secondary w-full justify-center py-2 text-[11px]"
          >
            <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            Resultados
          </Link>
        </div>
      </div>
      {showGeotechModal && (
        <GeomechanicsModal 
          onClose={() => setShowGeotechModal(false)} 
          currentAnalysis={currentAnalysis || baseAnalysis}
          zoneId={ZONE_ID}
        />
      )}
    </div>
  );
}

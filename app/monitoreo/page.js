'use client';

import { useState, useCallback } from 'react';
import VideoEnVivo from '@/components/VideoEnVivo';
import CamaraMJPEG from '@/components/CamaraMJPEG';
import FisuraOverlay from '@/components/FisuraOverlay';

// ── Configuración por defecto ─────────────────────────────────────
const DEFAULT_SIGNALING_URL = process.env.NEXT_PUBLIC_WEBRTC_URL || '';
const DEFAULT_MQTT_URL = process.env.NEXT_PUBLIC_MQTT_WS_URL || '';
const MJPEG_URL = process.env.NEXT_PUBLIC_MJPEG_URL || 'http://localhost:8082';

export default function MonitoreoPage() {
  const [signalingUrl, setSignalingUrl] = useState(DEFAULT_SIGNALING_URL);
  const [mqttUrl, setMqttUrl] = useState(DEFAULT_MQTT_URL);
  const [mqttUser, setMqttUser] = useState('');
  const [mqttPass, setMqttPass] = useState('');
  const [videoWidth] = useState(854);   // 16:9 ~
  const [videoHeight] = useState(480);
  const [showOverlay, setShowOverlay] = useState(true);
  const [showConfig, setShowConfig] = useState(false);
  const [useWebRTC, setUseWebRTC] = useState(false);  // MJPEG por defecto
  const [tempUrl, setTempUrl] = useState(signalingUrl);
  const [tempMqtt, setTempMqtt] = useState(mqttUrl);
  const [tempMqttUser, setTempMqttUser] = useState('');
  const [tempMqttPass, setTempMqttPass] = useState('');

  const handleApplyConfig = useCallback(() => {
    setSignalingUrl(tempUrl);
    setMqttUrl(tempMqtt);
    setMqttUser(tempMqttUser);
    setMqttPass(tempMqttPass);
    setShowConfig(false);
  }, [tempUrl, tempMqtt, tempMqttUser, tempMqttPass]);

  return (
    <div className="space-y-6">
      {/* ── Cabecera ─────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-dark-text">
            Monitoreo en Vivo
          </h1>
          <p className="text-sm text-dark-secondary">
            Transmisión desde la cámara del talud con detecciones en tiempo real
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Toggle MJPEG / WebRTC */}
          <button
            onClick={() => setUseWebRTC(!useWebRTC)}
            className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
              useWebRTC
                ? 'bg-dark-accent/20 text-dark-accent'
                : 'bg-dark-surface text-dark-secondary hover:text-dark-text'
            }`}
          >
            {useWebRTC ? 'WebRTC' : 'MJPEG'}
          </button>

          <button
            onClick={() => setShowOverlay(!showOverlay)}
            className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
              showOverlay
                ? 'bg-dark-accent/20 text-dark-accent'
                : 'bg-dark-surface text-dark-secondary hover:text-dark-text'
            }`}
          >
            {showOverlay ? 'Overlay: ON' : 'Overlay: OFF'}
          </button>

          <button
            onClick={() => setShowConfig(!showConfig)}
            className="rounded-lg bg-dark-surface px-3 py-2 text-sm text-dark-secondary transition-colors hover:text-dark-text"
          >
            Configurar conexión
          </button>
        </div>
      </div>

      {/* ── Configuración de conexión ────────────────────────── */}
      {showConfig && (
        <div className="rounded-lg border border-dark-border bg-dark-surface p-4">
          <h2 className="mb-3 text-sm font-semibold text-dark-text">
            Configuración de Conexión
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs text-dark-secondary">
                Señalización WebRTC (RPi IP:8081)
              </label>
              <input
                type="text"
                value={tempUrl}
                onChange={(e) => setTempUrl(e.target.value)}
                placeholder="http://192.168.1.100:8081"
                className="w-full rounded border border-dark-border bg-dark-primary px-3 py-2 text-sm text-dark-text focus:border-dark-accent focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-dark-secondary">
                Broker MQTT (WebSocket)
              </label>
              <input
                type="text"
                value={tempMqtt}
                onChange={(e) => setTempMqtt(e.target.value)}
                placeholder="ws://localhost:9001  o  wss://cluster.s2.eu.hivemq.cloud:8884/mqtt"
                className="w-full rounded border border-dark-border bg-dark-primary px-3 py-2 text-sm text-dark-text focus:border-dark-accent focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-dark-secondary">
                Usuario MQTT (opcional local, requerido HiveMQ)
              </label>
              <input
                type="text"
                value={tempMqttUser}
                onChange={(e) => setTempMqttUser(e.target.value)}
                placeholder="hivemq-username"
                className="w-full rounded border border-dark-border bg-dark-primary px-3 py-2 text-sm text-dark-text focus:border-dark-accent focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-dark-secondary">
                Contraseña MQTT
              </label>
              <input
                type="password"
                value={tempMqttPass}
                onChange={(e) => setTempMqttPass(e.target.value)}
                placeholder="••••••••"
                className="w-full rounded border border-dark-border bg-dark-primary px-3 py-2 text-sm text-dark-text focus:border-dark-accent focus:outline-none"
              />
            </div>
          </div>
          <button
            onClick={handleApplyConfig}
            disabled={!tempUrl || !tempMqtt}
            className="mt-3 rounded-lg bg-dark-accent px-4 py-2 text-sm font-medium text-black transition-colors hover:bg-dark-accent/80 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Aplicar y Conectar
          </button>
        </div>
      )}

      {/* ── Video + Overlay ──────────────────────────────────── */}
      <div className="relative rounded-lg border border-dark-border bg-black">
        {useWebRTC ? (
          <VideoEnVivo
            signalingUrl={signalingUrl}
            width={videoWidth}
            height={videoHeight}
            className="aspect-video"
          />
        ) : (
          <CamaraMJPEG
            streamUrl={`${MJPEG_URL}/stream`}
            width={videoWidth}
            height={videoHeight}
            className="aspect-video"
          />
        )}

        {/* Overlay de bounding boxes */}
        {showOverlay && mqttUrl && (
          <div className="absolute inset-0">
            <FisuraOverlay
              mqttUrl={mqttUrl}
              mqttTopic="argos/+/fisura"
              mqttUsername={mqttUser || undefined}
              mqttPassword={mqttPass || undefined}
              width={videoWidth}
              height={videoHeight}
            />
          </div>
        )}
      </div>

      {/* ── Información técnica ──────────────────────────────── */}
      <details className="rounded-lg border border-dark-border bg-dark-surface">
        <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-dark-text">
          Información técnica de la conexión
        </summary>
        <div className="border-t border-dark-border px-4 py-3 text-xs text-dark-secondary">
          <ul className="space-y-1">
            <li>
              <strong className="text-dark-text">Stream:</strong>{' '}
              MJPEG (recomendado, funciona siempre) o{' '}
              WebRTC (más rápida, experimental)
            </li>
            <li>
              <strong className="text-dark-text">Arquitectura:</strong> RPi4 →{' '}
              OpenCV → MJPEG/WebRTC → Frontend · MQTT (detecciones) → Frontend
            </li>
            <li>
              <strong className="text-dark-text">Bounding boxes:</strong> Vía MQTT{' '}
              <code className="text-dark-accent">argos/+/fisura</code>. Se
              limpian automáticamente tras 5s sin actualización.
            </li>
          </ul>
        </div>
      </details>
    </div>
  );
}

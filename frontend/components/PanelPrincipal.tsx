/**
 * @deprecated This component has been replaced by SlopeScene in page.tsx
 * (Talud 3D viewer). It is preserved only for backward compatibility in case
 * any remaining pages or legacy routes reference it. No active page imports
 * this component as of Phase 5 (PR 5/5). To remove: search for PanelPrincipal
 * imports across the project, migrate consumers to SlopeScene, then delete.
 *
 * ARGOS SLOPE 4.0 — PanelPrincipal (Dashboard Industrial Unificado).
 *
 * Muestra en UNA SOLA PANTALLA:
 *   - Tarjetas de resumen (fisuras, alertas críticas, conexiones)
 *   - Video en vivo (WebRTC o MJPEG)
 *   - Nube de puntos 3D en tiempo real (o modelo HD capturado)
 *   - Botón de captura HD
 *   - Historial de alertas en vivo
 *
 * Consume estado global de MonitorContext — sin lógica de conexión acoplada.
 */

'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useMonitor } from '@/context/MonitorContext';
import VisorModelo3D from '@/components/VisorModelo3D';
import NubePuntos3D from '@/components/NubePuntos3D';

// ── Modo de visualización 3D ───────────────────────────────────────

type ModoVisualizacion = 'nube_puntos' | 'modelo_hd' | 'oculto';

// ── Tarjeta de resumen ─────────────────────────────────────────────

function Tarjeta({
  label,
  valor,
  color = 'text-dark-text',
  icono,
}: {
  label: string;
  valor: string | number;
  color?: string;
  icono?: string;
}) {
  return (
    <div className="rounded-lg border border-dark-border bg-dark-surface p-4">
      <div className="flex items-center gap-2">
        {icono && <span className="text-lg">{icono}</span>}
        <p className="text-xs font-medium uppercase tracking-wider text-dark-textSecondary">
          {label}
        </p>
      </div>
      <p className={`mt-1 text-2xl font-bold ${color}`}>{valor}</p>
    </div>
  );
}

// ── Indicador de conexión ──────────────────────────────────────────

function IndicadorConexion({
  label,
  conectado,
}: {
  label: string;
  conectado: boolean;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
        conectado
          ? 'bg-green-500/15 text-green-400'
          : 'bg-red-500/15 text-red-400'
      }`}
    >
      <span
        className={`inline-block h-2 w-2 rounded-full ${
          conectado
            ? 'bg-green-400 shadow-[0_0_6px_#22c55e]'
            : 'bg-red-400 shadow-[0_0_6px_#ef4444]'
        }`}
      />
      {label}: {conectado ? 'Conectado' : 'Desconectado'}
    </span>
  );
}

// ── Panel de video en vivo ─────────────────────────────────────────

function PanelVideo() {
  const { camaraStatus, conectarCamara, desconectarCamara, signalingUrl } =
    useMonitor();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [useMjpeg, setUseMjpeg] = useState(true);
  const [retryCount, setRetryCount] = useState(0);

  const MJPEG_URL =
    process.env.NEXT_PUBLIC_MJPEG_URL || 'http://localhost:8082';

  // Conectar WebRTC si se selecciona ese modo
  useEffect(() => {
    if (!useMjpeg && signalingUrl) {
      conectarCamara(signalingUrl);
    }
    return () => {
      if (!useMjpeg) desconectarCamara();
    };
  }, [useMjpeg, signalingUrl, conectarCamara, desconectarCamara]);

  // Reconectar si retryCount cambia
  useEffect(() => {
    if (retryCount > 0 && !useMjpeg && signalingUrl) {
      const timer = setTimeout(() => conectarCamara(signalingUrl), 2000);
      return () => clearTimeout(timer);
    }
  }, [retryCount, useMjpeg, signalingUrl, conectarCamara]);

  return (
    <div className="relative overflow-hidden rounded-xl border border-dark-border bg-black">
      {/* Selector de modo */}
      <div className="absolute left-2 top-2 z-10 flex gap-1">
        <button
          onClick={() => setUseMjpeg(true)}
          className={`rounded px-2 py-1 text-[11px] font-medium transition-colors ${
            useMjpeg
              ? 'bg-dark-accent text-black'
              : 'bg-black/60 text-dark-textSecondary hover:text-white'
          }`}
        >
          MJPEG
        </button>
        <button
          onClick={() => setUseMjpeg(false)}
          className={`rounded px-2 py-1 text-[11px] font-medium transition-colors ${
            !useMjpeg
              ? 'bg-dark-accent text-black'
              : 'bg-black/60 text-dark-textSecondary hover:text-white'
          }`}
        >
          WebRTC
        </button>
      </div>

      {/* Video */}
      {useMjpeg ? (
        <img
          src={`${MJPEG_URL}/stream`}
          alt="Video en vivo MJPEG"
          className="h-full w-full object-contain"
          style={{ aspectRatio: '16/9' }}
        />
      ) : (
        <>
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="h-full w-full object-contain"
            style={{ aspectRatio: '16/9' }}
          />
          {/* Overlay de estado WebRTC */}
          {camaraStatus !== 'connected' && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/60">
              {camaraStatus === 'connecting' && (
                <div className="flex flex-col items-center gap-2">
                  <div className="h-8 w-8 animate-spin rounded-full border-2 border-dark-accent border-t-transparent" />
                  <span className="text-sm text-dark-textSecondary">Conectando...</span>
                </div>
              )}
              {camaraStatus === 'error' && (
                <div className="flex flex-col items-center gap-2">
                  <span className="text-sm text-red-400">Error</span>
                  <button
                    onClick={() => setRetryCount((c) => c + 1)}
                    className="rounded bg-dark-accent px-3 py-1 text-xs text-black"
                  >
                    Reintentar
                  </button>
                </div>
              )}
              {camaraStatus === 'disconnected' && !signalingUrl && (
                <div className="flex flex-col items-center gap-2">
                  <span className="text-sm text-dark-textSecondary">Sin conexión</span>
                </div>
              )}
            </div>
          )}
          {/* Badge */}
          {camaraStatus === 'connected' && (
            <div className="absolute right-2 top-2 z-10 rounded-full bg-green-500/20 px-2 py-0.5 text-xs font-medium text-green-400">
              🟢 En vivo
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Panel 3D ───────────────────────────────────────────────────────

function Panel3D() {
  const {
    pointCloud,
    pointCloudTimestamp,
    cracks,
    ultimaCapturaHd,
    capturaHdSeleccionada,
    staticFilesUrl,
  } = useMonitor();
  const [modo, setModo] = useState<ModoVisualizacion>('nube_puntos');

  const modoNube = modo === 'nube_puntos';
  const modoHd = modo === 'modelo_hd' && !!capturaHdSeleccionada;
  const totalFisuras = cracks.length;

  // URL del modelo HD
  const modelUrl =
    modoHd && capturaHdSeleccionada
      ? `${staticFilesUrl}/capturas_hd/${capturaHdSeleccionada.filename}`
      : null;

  return (
    <div className="space-y-2">
      {/* Selector de modo 3D */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setModo('nube_puntos')}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              modoNube
                ? 'bg-dark-accent/20 text-dark-accent'
                : 'bg-dark-surface text-dark-textSecondary hover:text-dark-text'
            }`}
          >
            ☁️ Nube de Puntos
          </button>
          <button
            onClick={() => setModo('modelo_hd')}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              modoHd
                ? 'bg-dark-accent/20 text-dark-accent'
                : 'bg-dark-surface text-dark-textSecondary hover:text-dark-text'
            }`}
            disabled={!capturaHdSeleccionada}
          >
            🏔️ Modelo HD
          </button>
          {totalFisuras > 0 && modoNube && (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2.5 py-0.5 text-[11px] font-medium text-amber-400">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
              {totalFisuras} fisura{totalFisuras !== 1 ? 's' : ''}
            </span>
          )}
        </div>
      </div>

      {/* Visor */}
      <div className="h-[400px] overflow-hidden rounded-xl border border-dark-border bg-[#0f0f1a]">
        {modoNube && (
          <NubePuntos3D
            points={pointCloud.length > 0 ? pointCloud : null}
            cracks={cracks}
            height={400}
            timestamp={pointCloudTimestamp}
          />
        )}
        {modoHd && modelUrl && (
          <VisorModelo3D url={modelUrl} height={400} />
        )}
        {modo === 'modelo_hd' && !capturaHdSeleccionada && (
          <div className="flex h-full items-center justify-center">
            <p className="text-sm text-dark-textSecondary/60">
              Sin captura HD disponible. Presiona "Capturar Talud HD" para generar una.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Panel de alertas en vivo ───────────────────────────────────────

function PanelAlertas() {
  const { alertas, limpiarAlertas } = useMonitor();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  // Auto-scroll al último
  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
  }, [alertas, autoScroll]);

  const getColor = (tipo: string) => {
    switch (tipo) {
      case 'fisura':
        return 'border-l-amber-500 bg-amber-500/5';
      case 'captura_hd':
        return 'border-l-emerald-500 bg-emerald-500/5';
      case 'alerta_crecimiento':
        return 'border-l-red-500 bg-red-500/5';
      default:
        return 'border-l-dark-border bg-dark-surface/50';
    }
  };

  const getIcono = (tipo: string) => {
    switch (tipo) {
      case 'fisura':
        return '⚠️';
      case 'captura_hd':
        return '📸';
      case 'alerta_crecimiento':
        return '🚨';
      default:
        return 'ℹ️';
    }
  };

  return (
    <div className="rounded-xl border border-dark-border bg-dark-surface">
      <div className="flex items-center justify-between border-b border-dark-border px-4 py-3">
        <h3 className="text-sm font-semibold text-dark-text">
          Alertas en Vivo
          {alertas.length > 0 && (
            <span className="ml-2 text-xs font-normal text-dark-textSecondary">
              ({alertas.length})
            </span>
          )}
        </h3>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setAutoScroll(!autoScroll)}
            className={`text-[11px] ${autoScroll ? 'text-dark-accent' : 'text-dark-textSecondary'}`}
          >
            Auto-scroll
          </button>
          <button
            onClick={limpiarAlertas}
            className="text-[11px] text-dark-textSecondary hover:text-dark-text"
          >
            Limpiar
          </button>
        </div>
      </div>

      <div
        ref={scrollRef}
        className="h-[200px] overflow-y-auto"
        style={{ scrollBehavior: 'smooth' }}
      >
        {alertas.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <p className="text-xs text-dark-textSecondary/40">
              Sin alertas aún. Los eventos aparecerán aquí automáticamente.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-dark-border/50">
            {alertas.map((a) => (
              <div
                key={a.id}
                className={`border-l-2 px-4 py-2 ${getColor(a.tipo)}`}
              >
                <div className="flex items-center gap-2">
                  <span className="text-xs">{getIcono(a.tipo)}</span>
                  <p className="flex-1 text-xs text-dark-text">{a.mensaje}</p>
                  <span className="text-[10px] text-dark-textSecondary/50">
                    {new Date(a.timestamp).toLocaleTimeString('es-ES')}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Componente principal ───────────────────────────────────────────

export default function PanelPrincipal() {
  const {
    mqttConnected,
    camaraStatus,
    alertas,
    ultimaCapturaHd,
    triggerCapturaHd,
  } = useMonitor();
  const [capturando, setCapturando] = useState(false);

  // Contar fisuras de las alertas
  const totalFisuras = alertas.filter((a) => a.tipo === 'fisura').length;
  const alertasCriticas = alertas.filter(
    (a) => a.tipo === 'alerta_crecimiento',
  ).length;

  const handleCapturar = useCallback(() => {
    setCapturando(true);
    triggerCapturaHd();
    setTimeout(() => setCapturando(false), 3000);
  }, [triggerCapturaHd]);

  return (
    <div className="space-y-6">
      {/* ── Cabecera ─────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-dark-text">
            Panel Principal
          </h1>
          <p className="mt-1 text-sm text-dark-textSecondary">
            Monitoreo de deformación de talud en tiempo real
          </p>
        </div>

        <div className="flex items-center gap-3">
          <IndicadorConexion label="MQTT" conectado={mqttConnected} />
          <IndicadorConexion
            label="Cámara"
            conectado={camaraStatus === 'connected'}
          />
        </div>
      </div>

      {/* ── Tarjetas de resumen ──────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Tarjeta
          label="Total Fisuras"
          valor={totalFisuras}
          color="text-amber-400"
          icono="⚠️"
        />
        <Tarjeta
          label="Alertas Críticas"
          valor={alertasCriticas}
          color={alertasCriticas > 0 ? 'text-red-400' : 'text-dark-text'}
          icono="🚨"
        />
        <Tarjeta
          label="Capturas HD"
          valor={ultimaCapturaHd ? '1 disponible' : '0'}
          color={ultimaCapturaHd ? 'text-emerald-400' : 'text-dark-textSecondary'}
          icono="📸"
        />
        <Tarjeta
          label="MQTT"
          valor={mqttConnected ? 'Conectado' : 'Desconectado'}
          color={mqttConnected ? 'text-green-400' : 'text-red-400'}
          icono="📡"
        />
      </div>

      {/* ── Grid principal: Video + 3D ──────────────────────────── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Video en vivo */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-dark-text">
              📹 Video en Vivo
            </h2>
            <button
              onClick={handleCapturar}
              disabled={capturando}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition-all ${
                capturando
                  ? 'bg-dark-accent/50 text-black/50 cursor-not-allowed'
                  : 'bg-dark-accent text-black hover:bg-dark-accent/80 active:scale-95'
              }`}
            >
              {capturando ? (
                <span className="flex items-center gap-2">
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-black border-t-transparent" />
                  Capturando...
                </span>
              ) : (
                '📸 Capturar Talud HD'
              )}
            </button>
          </div>
          <PanelVideo />
        </div>

        {/* Visualización 3D */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-dark-text">
              🏔️ Visualización 3D
            </h2>
            {ultimaCapturaHd && (
              <span className="text-[11px] text-emerald-400">
                Última captura: {ultimaCapturaHd.filename}
              </span>
            )}
          </div>
          <Panel3D />
        </div>
      </div>

      {/* ── Panel de alertas ─────────────────────────────────────── */}
      <PanelAlertas />
    </div>
  );
}

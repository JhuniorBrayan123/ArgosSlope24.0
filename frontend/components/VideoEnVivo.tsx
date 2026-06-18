'use client';

import { useRef, useEffect, useState, useCallback } from 'react';

/**
 * Propiedades para VideoEnVivo.
 *
 * @property signalingUrl  URL base del servidor de señalización WebRTC en el RPi.
 *                         Ejemplo: "http://192.168.1.100:8081"
 * @property width         Ancho del video (default: 640)
 * @property height        Alto del video (default: 480)
 * @property className     Clases CSS adicionales
 */
interface VideoEnVivoProps {
  signalingUrl: string;
  width?: number;
  height?: number;
  className?: string;
}

type ConnectionStatus =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'error';

/**
 * VideoEnVivo — Reproductor WebRTC nativo.
 *
 * Establece conexión WebRTC con el Raspberry Pi a través del servidor
 * de señalización. El video fluye directamente P2P una vez establecida
 * la conexión.
 */
export default function VideoEnVivo({
  signalingUrl,
  width = 640,
  height = 480,
  className = '',
}: VideoEnVivoProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>('disconnected');
  const [errorMsg, setErrorMsg] = useState('');
  const [retryCount, setRetryCount] = useState(0);

  // ── Forzar play si autoplay fue bloqueado ─────────────────────────
  const handleVideoClick = useCallback(async () => {
    if (videoRef.current && videoRef.current.paused) {
      try {
        await videoRef.current.play();
        setStatus('connected');
        setErrorMsg('');
      } catch {
        // Ignorar
      }
    }
  }, []);

  const signalingOrigin = signalingUrl.replace(/\/+$/, '');

  // ── Conectar WebRTC ─────────────────────────────────────────────
  const connect = useCallback(async () => {
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }

    setStatus('connecting');
    setErrorMsg('');

    try {
      const pc = new RTCPeerConnection({
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
        ],
      });
      pcRef.current = pc;

      // ── Manejar tracks de video entrantes ──────────────────
      pc.ontrack = (event) => {
        if (videoRef.current && event.streams[0]) {
          videoRef.current.srcObject = event.streams[0];
          setStatus('connected');
          // Intentar play (puede fallar por autoplay policy)
          videoRef.current.play().catch(() => {
            // El usuario puede hacer clic para reproducir
          });
        }
      };

      // ── Manejar estado de la conexión ICE ──────────────────
      pc.oniceconnectionstatechange = () => {
        if (
          pc.iceConnectionState === 'disconnected' ||
          pc.iceConnectionState === 'failed'
        ) {
          setStatus('disconnected');
          setErrorMsg('WebRTC connection lost. Reconnecting...');
        }
      };

      // ── Crear y enviar la SDP Offer ───────────────────────
      const offer = await pc.createOffer({
        offerToReceiveVideo: true,
        offerToReceiveAudio: false,
      });
      await pc.setLocalDescription(offer);

      // Enviar offer al servidor de señalización
      const response = await fetch(`${signalingOrigin}/offer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sdp: pc.localDescription?.sdp,
          type: pc.localDescription?.type,
        }),
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(
          `Signaling server error (${response.status}): ${text}`
        );
      }

      const answer = await response.json();

      if (!answer.sdp) {
        throw new Error('Invalid signaling response: missing SDP');
      }

      await pc.setRemoteDescription(
        new RTCSessionDescription(answer)
      );

      // No seteamos status a 'connected' aquí — esperamos ontrack
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : 'Unknown WebRTC error';
      setErrorMsg(msg);
      setStatus('error');
      console.error('[VideoEnVivo] WebRTC error:', err);

      // Limpiar
      if (pcRef.current) {
        pcRef.current.close();
        pcRef.current = null;
      }
    }
  }, [signalingOrigin]);

  // ── Conectar al montar ──────────────────────────────────────────
  useEffect(() => {
    connect();

    return () => {
      if (pcRef.current) {
        pcRef.current.close();
        pcRef.current = null;
      }
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
    };
  }, [connect]);

  // ── Reconectar (cuando cambia retryCount) ───────────────────────
  useEffect(() => {
    if (retryCount > 0) {
      const timer = setTimeout(() => connect(), 2000);
      return () => clearTimeout(timer);
    }
  }, [retryCount, connect]);

  // ── Render ──────────────────────────────────────────────────────
  return (
    <div className={`relative overflow-hidden rounded-lg bg-black ${className}`}>
      {/* Video */}
      <video
        ref={videoRef}
        width={width}
        height={height}
        autoPlay
        playsInline
        muted
        onClick={handleVideoClick}
        className="h-full w-full object-contain cursor-pointer"
      />

      {/* Overlay de estado */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        {status === 'connecting' && (
          <div className="flex flex-col items-center gap-2">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-dark-accent border-t-transparent" />
            <span className="text-sm text-dark-textSecondary">
              Conectando con la cámara...
            </span>
          </div>
        )}

        {status === 'error' && (
          <div className="flex flex-col items-center gap-2 rounded-lg bg-dark-surface/80 p-4">
            <span className="text-sm text-red-400">Error de conexión</span>
            <span className="max-w-xs text-center text-xs text-dark-textSecondary">
              {errorMsg}
            </span>
            <button
              onClick={() => setRetryCount((c) => c + 1)}
              className="pointer-events-auto rounded bg-dark-accent px-3 py-1 text-xs text-black transition-colors hover:bg-dark-accent/80"
            >
              Reintentar
            </button>
          </div>
        )}

        {status === 'disconnected' && (
          <div className="flex flex-col items-center gap-2">
            <span className="text-sm text-dark-textSecondary">
              Sin conexión
            </span>
            <button
              onClick={() => setRetryCount((c) => c + 1)}
              className="pointer-events-auto rounded bg-dark-accent px-3 py-1 text-xs text-black transition-colors hover:bg-dark-accent/80"
            >
              Conectar
            </button>
          </div>
        )}
      </div>

      {/* Badge de estado */}
      <div className="absolute right-2 top-2 rounded-full px-2 py-0.5 text-xs font-medium"
        style={{
          backgroundColor:
            status === 'connected'
              ? 'rgba(34, 197, 94, 0.2)'
              : status === 'connecting'
              ? 'rgba(234, 179, 8, 0.2)'
              : 'rgba(239, 68, 68, 0.2)',
          color:
            status === 'connected'
              ? 'rgb(34, 197, 94)'
              : status === 'connecting'
              ? 'rgb(234, 179, 8)'
              : 'rgb(239, 68, 68)',
        }}
      >
        {status === 'connected'
          ? '🟢 En vivo'
          : status === 'connecting'
          ? '🟡 Conectando'
          : status === 'error'
          ? '🔴 Error'
          : '⚫ Desconectado'}
      </div>
    </div>
  );
}

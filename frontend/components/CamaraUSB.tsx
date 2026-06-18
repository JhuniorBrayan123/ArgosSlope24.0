'use client';

import { useRef, useState, useEffect, useCallback, forwardRef, useImperativeHandle } from 'react';

interface CamaraUSBProps {
  className?: string;
  width?: number;
  height?: number;
}

export interface CamaraUSBHandle {
  captureFrame: () => Promise<string>;
}

/**
 * CamaraUSB — Accede a la cámara USB via getUserMedia().
 * Reemplaza a CamaraMJPEG para entornos sin servidor MJPEG.
 *
 * Expone captureFrame() que devuelve un base64 JPEG del frame actual.
 */
const CamaraUSB = forwardRef<CamaraUSBHandle, CamaraUSBProps>(function CamaraUSB({
  className = '',
  width = 640,
  height = 480,
}, ref) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Iniciar cámara al montar ──────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    async function startCamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 1280 },
            height: { ideal: 720 },
            facingMode: 'environment', // cámara trasera en celus, usa la única en laptop
          },
          audio: false,
        });

        if (cancelled) {
          stream.getTracks().forEach(t => t.stop());
          return;
        }

        streamRef.current = stream;

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }

        setConnected(true);
        setError(null);
      } catch (err: any) {
        if (!cancelled) {
          setError(err.message || 'No se pudo acceder a la cámara');
          setConnected(false);
        }
      }
    }

    startCamera();

    return () => {
      cancelled = true;
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
        streamRef.current = null;
      }
    };
  }, []);

  // ── Capturar frame actual como base64 ─────────────────────────
  const captureFrame = useCallback(async (): Promise<string> => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) throw new Error('Cámara no inicializada');

    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;

    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('No se pudo obtener contexto 2D');

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    return canvas.toDataURL('image/jpeg', 0.92);
  }, []);

  useImperativeHandle(ref, () => ({ captureFrame }), [captureFrame]);

  return (
    <div className={`relative overflow-hidden rounded-lg bg-black ${className}`}>
      {/* Video en vivo */}
      <video
        ref={videoRef}
        width={width}
        height={height}
        autoPlay
        playsInline
        muted
        className="h-full w-full object-contain"
      />

      {/* Canvas oculto para capturar frames */}
      <canvas ref={canvasRef} style={{ display: 'none' }} />

      {/* Overlay de estado */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        {!connected && !error && (
          <div className="flex flex-col items-center gap-2">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-dark-accent border-t-transparent" />
            <span className="text-sm text-dark-textSecondary">
              Accediendo a la cámara...
            </span>
          </div>
        )}

        {error && (
          <div className="flex flex-col items-center gap-2 rounded-lg bg-dark-surface/80 p-4">
            <span className="text-sm text-red-400">Error de cámara</span>
            <span className="max-w-xs text-center text-xs text-dark-textSecondary">
              {error}
            </span>
          </div>
        )}
      </div>

      {/* Badge de estado */}
      <div
        className="absolute right-2 top-2 rounded-full px-2 py-0.5 text-xs font-medium"
        style={{
          backgroundColor: connected
            ? 'rgba(34, 197, 94, 0.2)'
            : error
            ? 'rgba(239, 68, 68, 0.2)'
            : 'rgba(234, 179, 8, 0.2)',
          color: connected
            ? 'rgb(34, 197, 94)'
            : error
            ? 'rgb(239, 68, 68)'
            : 'rgb(234, 179, 8)',
        }}
      >
        {connected ? '🟢 En vivo' : error ? '🔴 Error' : '🟡 Conectando'}
      </div>
    </div>
  );
});

export default CamaraUSB;

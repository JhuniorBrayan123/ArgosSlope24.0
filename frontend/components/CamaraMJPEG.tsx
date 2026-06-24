'use client';

import { useRef, useState, useEffect, useCallback, forwardRef, useImperativeHandle } from 'react';

interface CamaraMJPEGProps {
  streamUrl: string;
  width?: number;
  height?: number;
  className?: string;
}

export interface ImageDisplayInfo {
  /** Dimensiones nativas del frame (la resolución real de la cámara) */
  naturalWidth: number;
  naturalHeight: number;
  /** Ancho/alto del contenedor donde se dibuja el ROI */
  containerWidth: number;
  containerHeight: number;
}

export interface CamaraMJPEGHandle {
  /** Captura el frame actual del stream MJPEG como base64 JPEG */
  captureFrame: () => Promise<string>;
  /** Devuelve info de dimensiones para escalar el ROI correctamente */
  getImageDisplayInfo: () => ImageDisplayInfo | null;
}

/**
 * CamaraMJPEG — Reproductor MJPEG simple.
 *
 * Usa una imagen HTML con el stream MJPEG directamente.
 * Expone captureFrame() para capturar el frame actual como base64.
 */
const CamaraMJPEG = forwardRef<CamaraMJPEGHandle, CamaraMJPEGProps>(function CamaraMJPEG({
  streamUrl,
  width = 640,
  height = 480,
  className = '',
}, ref) {
  const imgRef = useRef<HTMLImageElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState(false);
  const mountedRef = useRef(true);

  // ── Capturar frame actual como base64 ───────────────────────────
  const captureFrame = useCallback(async (): Promise<string> => {
    const img = imgRef.current;
    const canvas = canvasRef.current;
    if (!img || !canvas) throw new Error('MJPEG stream no inicializado');
    if (!img.complete || img.naturalWidth === 0) throw new Error('Sin frame disponible');

    canvas.width = img.naturalWidth || width;
    canvas.height = img.naturalHeight || height;

    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('No se pudo obtener contexto 2D');

    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.92);
  }, [width, height]);

  // ── Devolver info de la imagen para escalar el ROI ──────────────
  const getImageDisplayInfo = useCallback((): ImageDisplayInfo | null => {
    const img = imgRef.current;
    const parent = img?.parentElement;
    if (!img || !parent) return null;
    if (!img.complete || img.naturalWidth === 0) return null;
    const parentRect = parent.getBoundingClientRect();
    return {
      naturalWidth: img.naturalWidth,
      naturalHeight: img.naturalHeight,
      containerWidth: parentRect.width,
      containerHeight: parentRect.height,
    };
  }, []);

  useImperativeHandle(ref, () => ({ captureFrame, getImageDisplayInfo }), [captureFrame, getImageDisplayInfo]);

  // ── Conectar (solo una vez al montar) ─────────────────────────────
  useEffect(() => {
    setConnected(false);
    setError(true); // Start as error, will clear on load
    mountedRef.current = true;

    const img = imgRef.current;
    if (!img) return;

    // Timeout de conexion
    const timeoutId = setTimeout(() => {
      if (!connected && mountedRef.current) {
        setError(true);
      }
    }, 8000);

    const onLoad = () => {
      if (mountedRef.current) {
        setConnected(true);
        setError(false);
      }
      clearTimeout(timeoutId);
    };
    img.onload = onLoad;

    const onErrorOrig = img.onerror;
    img.onerror = () => {
      if (mountedRef.current) {
        setConnected(false);
        setError(true);
      }
    };

    // Forzar recarga
    img.src = streamUrl;

    return () => {
      mountedRef.current = false;
      clearTimeout(timeoutId);
    };
  }, [streamUrl]); // Solo cambia si cambia la URL base

  return (
    <div
      className={`relative overflow-hidden rounded-lg bg-black ${className}`}
    >
      {/* Imagen MJPEG */}
      <img
        ref={imgRef}
        width={width}
        height={height}
        alt="Camara en vivo"
        crossOrigin="anonymous"
        className="h-full w-full object-contain"
        style={{ display: 'block' }}
      />

      {/* Canvas oculto para capturar frames */}
      <canvas ref={canvasRef} style={{ display: 'none' }} />

      {/* Overlay de estado */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        {!connected && !error && (
          <div className="flex flex-col items-center gap-2">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-dark-accent border-t-transparent" />
            <span className="text-sm text-dark-textSecondary">
              Conectando con la camara...
            </span>
          </div>
        )}

        {error && !connected && (
          <div className="flex flex-col items-center gap-2 rounded-lg bg-dark-surface/80 p-4">
            <span className="text-sm text-red-400">Error de conexion</span>
            <span className="max-w-xs text-center text-xs text-dark-textSecondary">
              No se puede conectar al stream. Haz click para reintentar.
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

export default CamaraMJPEG;

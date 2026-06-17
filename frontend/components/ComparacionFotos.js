'use client';

import { useState } from 'react';

/* ──────────────────────────────────────────────────────────────────
   ComparacionFotos
   Side-by-side comparison of original and AI-segmented fissure image.
   ────────────────────────────────────────────────────────────────── */

function PanelImagen({ titulo, src, label }) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  return (
    <div className="flex flex-col">
      <div className="mb-2 flex items-center gap-2">
        <span className="rounded bg-dark-accent/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-dark-accent">
          {label}
        </span>
        <span className="text-sm font-semibold text-dark-secondary">{titulo}</span>
      </div>

      <div className="relative flex aspect-[4/3] items-center justify-center overflow-hidden rounded-lg border border-dark-border bg-dark-primary">
        {!loaded && !failed && (
          <div className="flex flex-col items-center gap-2">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-dark-accent border-t-transparent" />
            <span className="text-xs text-dark-secondary">Cargando...</span>
          </div>
        )}

        {failed && (
          <div className="flex flex-col items-center gap-2 text-dark-secondary">
            <svg className="h-10 w-10 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
              />
            </svg>
            <span className="text-xs">Imagen no disponible</span>
          </div>
        )}

        {!failed && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={src}
            alt={titulo}
            className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-300 ${
              loaded ? 'opacity-100' : 'opacity-0'
            }`}
            onLoad={() => setLoaded(true)}
            onError={() => setFailed(true)}
          />
        )}
      </div>
    </div>
  );
}

export default function ComparacionFotos({ fisuraId }) {
  // Use placeholder images — in production these come from the backend
  const originalSrc = fisuraId
    ? `http://localhost:8000/static/samples/roi_a_01_original.jpg`
    : '';

  const segmentedSrc = fisuraId
    ? `http://localhost:8000/static/samples/roi_a_01_segmented.jpg`
    : '';

  return (
    <div className="rounded-xl border border-dark-border bg-dark-surface p-5">
      <h3 className="mb-4 text-base font-semibold text-dark-text">
        Comparación de Imágenes
      </h3>
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <PanelImagen
          titulo="Foto Original"
          label="original"
          src={originalSrc}
        />
        <PanelImagen
          titulo="Foto Segmentada por IA"
          label="segmentada por ia"
          src={segmentedSrc}
        />
      </div>
    </div>
  );
}

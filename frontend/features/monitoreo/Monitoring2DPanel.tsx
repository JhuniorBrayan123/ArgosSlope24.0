'use client';

import React from 'react';

interface Monitoring2DPanelProps {
  onCapture: () => void;
  onSaveBase: () => void;
  onCompare: () => void;
  onClear: () => void;
  isCapturing: boolean;
  statusMessage: string;
  hasBase: boolean;
  hasResults: boolean;
}

export default function Monitoring2DPanel({
  onCapture,
  onSaveBase,
  onCompare,
  onClear,
  isCapturing,
  statusMessage,
  hasBase,
  hasResults,
}: Monitoring2DPanelProps) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-dark-border bg-dark-elevated p-4 shadow-card">
      <h2 className="text-sm font-semibold text-dark-text">Controles</h2>

      {/* ── Botón Capturar ────────────────────────────────────────── */}
      <button
        onClick={onCapture}
        disabled={isCapturing}
        className="btn-primary w-full justify-center py-2.5"
      >
        {isCapturing ? (
          <>
            <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Procesando...
          </>
        ) : (
          <>
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
              <circle cx="12" cy="13" r="3" />
            </svg>
            Capturar y Analizar
          </>
        )}
      </button>

      {/* ── Botones Base / Comparar ────────────────────────────────── */}
      <div className="flex gap-2">
        <button
          onClick={onSaveBase}
          disabled={isCapturing}
          className="btn-secondary flex-1 justify-center px-2 py-2 text-[11px]"
        >
          <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
          </svg>
          Base
        </button>
        <button
          onClick={onCompare}
          disabled={isCapturing || !hasBase}
          className="btn-secondary flex-1 justify-center px-2 py-2 text-[11px] disabled:opacity-50"
          title={!hasBase ? 'Guardá una base primero' : ''}
        >
          <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
          Comparar
        </button>
      </div>

      {/* ── Limpiar resultados ─────────────────────────────────────── */}
      {hasResults && (
        <button
          onClick={onClear}
          className="text-xs text-dark-muted hover:text-dark-danger transition-colors underline underline-offset-2"
        >
          Limpiar resultados
        </button>
      )}

      {/* ── Status ──────────────────────────────────────────────────── */}
      {statusMessage && (
        <div className="flex items-center gap-1.5 text-xs font-medium rounded px-2 py-1.5"
          style={{
            backgroundColor: statusMessage.startsWith('❌')
              ? 'rgba(239, 68, 68, 0.1)'
              : statusMessage.startsWith('✅')
              ? 'rgba(34, 197, 94, 0.1)'
              : 'rgba(234, 179, 8, 0.1)',
            color: statusMessage.startsWith('❌')
              ? 'rgb(239, 68, 68)'
              : statusMessage.startsWith('✅')
              ? 'rgb(34, 197, 94)'
              : 'rgb(234, 179, 8)',
          }}
        >
          <span className="shrink-0">{statusMessage.startsWith('❌') ? '🔴' : statusMessage.startsWith('✅') ? '🟢' : '🟡'}</span>
          <span>{statusMessage.replace(/^[✅❌⏳]\s*/, '')}</span>
        </div>
      )}
    </div>
  );
}

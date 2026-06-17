'use client';

import React, { useState } from 'react';

// ── Shared UI Components ─────────────────────────────────────────────

function TabButton({ active, label, count, onClick }: { active: boolean, label: string, count?: number, onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`relative px-4 py-3 text-sm font-medium transition-colors ${
        active ? 'text-dark-accent' : 'text-dark-muted hover:text-dark-text'
      }`}
    >
      <div className="flex items-center gap-2">
        {label}
        {count !== undefined && (
          <span className={`rounded-full px-1.5 py-0.5 text-[10px] ${
            active ? 'bg-dark-accent/20 text-dark-accent' : 'bg-dark-border text-dark-secondary'
          }`}>
            {count}
          </span>
        )}
      </div>
      {active && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-dark-accent shadow-[0_0_8px_rgba(14,165,197,0.5)]" />}
    </button>
  );
}

function DetectionCard({ crack }: { crack: any }) {
  const isDanger = crack.length_mm > 50;
  return (
    <div className="group rounded-lg border border-dark-border bg-dark-elevated p-3 transition-colors hover:border-dark-borderActive/30">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono font-bold text-dark-text">{crack.id}</span>
          <span className={`rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider ${
            crack.family === 'F1' ? 'bg-dark-fam1/15 text-dark-fam1' :
            crack.family === 'F2' ? 'bg-dark-fam2/15 text-dark-fam2' :
            crack.family === 'F3' ? 'bg-dark-fam3/15 text-dark-fam3' : 'bg-dark-fam4/15 text-dark-fam4'
          }`}>{crack.family}</span>
        </div>
        <span className={`text-[10px] font-semibold uppercase tracking-wider ${isDanger ? 'text-dark-danger' : 'text-dark-success'}`}>
          {isDanger ? 'ALTO RIESGO' : 'ESTABLE'}
        </span>
      </div>
      
      <div className="mt-3 grid grid-cols-3 gap-2 divide-x divide-dark-border">
        <div>
          <p className="text-[10px] text-dark-muted">Longitud</p>
          <p className="text-xs font-semibold text-dark-text">{crack.length_mm?.toFixed(1)} mm</p>
        </div>
        <div className="pl-2">
          <p className="text-[10px] text-dark-muted">Apertura</p>
          <p className="text-xs font-semibold text-dark-text">{(crack.length_mm * 0.05).toFixed(2)} mm</p>
        </div>
        <div className="pl-2">
          <p className="text-[10px] text-dark-muted">Orientación</p>
          <p className="text-xs font-semibold text-dark-text">{crack.orientation?.toFixed(1)}°</p>
        </div>
      </div>
    </div>
  );
}

// ── Panel Component ───────────────────────────────────────────────────

interface Monitoring2DPanelProps {
  onCapture: () => void;
  onSaveBase: () => void;
  onCompare: () => void;
  analysisResult: any;
  baseImageSaved: boolean;
  isCapturing: boolean;
  statusMessage: string;
}

export default function Monitoring2DPanel({
  onCapture,
  onSaveBase,
  onCompare,
  analysisResult,
  baseImageSaved,
  isCapturing,
  statusMessage
}: Monitoring2DPanelProps) {
  const [activeTab, setActiveTab] = useState<'fisuras'|'familias'|'metricas'>('fisuras');

  const cracks = analysisResult?.cracks ?? [];
  const spacing = analysisResult?.spacing ?? null;
  const processedImg = analysisResult?.imageBase64 
    ? `data:image/jpeg;base64,${analysisResult.imageBase64}` 
    : null;

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-xl border border-dark-border bg-dark-surface shadow-card">
      
      {/* ── Toolbar ─────────────────────────────────────────────────── */}
      <div className="shrink-0 border-b border-dark-border p-4 bg-dark-elevated">
        <h2 className="mb-3 text-sm font-semibold text-dark-text">Panel de Control Operativo</h2>
        
        <div className="flex flex-col gap-2">
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
                Procesando en el Edge...
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
              disabled={isCapturing || !baseImageSaved}
              className="btn-secondary flex-1 justify-center px-2 py-2 text-[11px] disabled:opacity-50"
            >
              <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
              Comparar
            </button>
          </div>
        </div>

        {/* Status messages */}
        {(baseImageSaved || statusMessage) && (
          <div className="mt-3 space-y-1">
            {baseImageSaved && (
              <div className="flex items-center gap-1.5 text-[10px] font-medium text-dark-success bg-dark-success/10 border border-dark-success/20 rounded px-2 py-1">
                <span className="status-dot-online h-1.5 w-1.5" />
                Base guardada activa
              </div>
            )}
            {statusMessage && (
              <div className="flex items-center gap-1.5 text-[10px] font-medium text-dark-warning bg-dark-warning/10 border border-dark-warning/20 rounded px-2 py-1">
                <span className="status-dot-warning h-1.5 w-1.5" />
                {statusMessage}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Tabs ──────────────────────────────────────────────────────── */}
      <div className="flex shrink-0 border-b border-dark-border bg-dark-surface px-2">
        <TabButton active={activeTab === 'fisuras'} label="Fisuras" count={cracks.length} onClick={() => setActiveTab('fisuras')} />
        <TabButton active={activeTab === 'familias'} label="Familias" onClick={() => setActiveTab('familias')} />
        <TabButton active={activeTab === 'metricas'} label="Métricas" onClick={() => setActiveTab('metricas')} />
      </div>

      {/* ── Scrollable Content ───────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto p-4 bg-dark-primary/50">
        {!analysisResult ? (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <svg className="mb-4 h-12 w-12 text-dark-border" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
            <p className="text-sm font-medium text-dark-secondary">Sin datos de análisis</p>
            <p className="mt-1 text-xs text-dark-muted max-w-[200px]">Ejecuta una captura para visualizar discontinuidades y RQD.</p>
          </div>
        ) : (
          <div className="space-y-4 animate-fade-in">
            {activeTab === 'fisuras' && (
              <div className="space-y-3">
                {cracks.map((c: any) => <DetectionCard key={c.id} crack={c} />)}
              </div>
            )}

            {activeTab === 'familias' && (
              <div className="space-y-3">
                {spacing?.by_family && Object.entries(spacing.by_family).map(([family, data]: [string, any]) => (
                  <div key={family} className="argos-card p-4">
                    <div className="mb-3 flex items-center justify-between">
                      <span className={`rounded px-2 py-0.5 text-xs font-bold uppercase tracking-wider ${
                        family === 'F1' ? 'bg-dark-fam1/15 text-dark-fam1' :
                        family === 'F2' ? 'bg-dark-fam2/15 text-dark-fam2' :
                        family === 'F3' ? 'bg-dark-fam3/15 text-dark-fam3' : 'bg-dark-fam4/15 text-dark-fam4'
                      }`}>{family}</span>
                      <span className="text-xs font-medium text-dark-muted">{data.count} elementos</span>
                    </div>
                    <div className="flex justify-between border-t border-dark-border pt-2 text-xs">
                      <span className="text-dark-secondary">Espaciamiento (S)</span>
                      <span className="font-semibold text-dark-success">{data.spacing_mm?.toFixed(1)} mm</span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {activeTab === 'metricas' && (
              <div className="space-y-4">
                <div className="argos-card p-4">
                  <p className="section-label mb-3">Estimación Geomecánica</p>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-3xl font-bold text-dark-success">
                        {spacing?.estimated_rqd != null ? spacing.estimated_rqd.toFixed(1) : '—'}<span className="text-xl">%</span>
                      </p>
                      <p className="text-xs text-dark-secondary">RQD Palmström</p>
                    </div>
                    <div className="h-12 w-12 rounded-full border-4 border-dark-success flex items-center justify-center">
                      <span className="text-[10px] font-bold text-dark-success">BUENA</span>
                    </div>
                  </div>
                </div>

                {processedImg && (
                  <div className="argos-card overflow-hidden">
                    <p className="section-label bg-dark-elevated px-4 py-2 border-b border-dark-border">
                      Debug OpenCV
                    </p>
                    <img src={processedImg} alt="Procesado" className="w-full object-contain max-h-[160px] bg-[#000]" />
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

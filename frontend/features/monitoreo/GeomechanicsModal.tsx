'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import type { AnalysisData } from './useMonitoring2D';

interface GeomechanicsModalProps {
  onClose: () => void;
  currentAnalysis: AnalysisData | null;
  zoneId: string;
}

interface RmrOption {
  parameterKey: string;
  code: string;
  label: string;
  score: number;
}

interface RqdResult {
  value: number;
  quality: string;
}

export default function GeomechanicsModal({ onClose, currentAnalysis, zoneId }: GeomechanicsModalProps) {
  const [catalog, setCatalog] = useState<Record<string, RmrOption[]>>({});
  const [loading, setLoading] = useState(true);
  
  // Selected codes for RMR parameters
  const [selectedParams, setSelectedParams] = useState<Record<string, RmrOption>>({});
  
  // RQD from Palmström
  const [rqdResult, setRqdResult] = useState<RqdResult | null>(null);
  const [rqdLoading, setRqdLoading] = useState(false);
  
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parameterKeys = [
    'compressive_strength',
    'rqd',
    'discontinuity_spacing',
    'persistence',
    'aperture',
    'roughness',
    'infilling',
    'weathering',
    'groundwater',
    'discontinuity_orientation'
  ];

  const parameterLabels: Record<string, string> = {
    'compressive_strength': 'Resistencia a la Compresión',
    'rqd': 'RQD',
    'discontinuity_spacing': 'Espaciamiento',
    'persistence': 'Persistencia',
    'aperture': 'Apertura',
    'roughness': 'Rugosidad',
    'infilling': 'Relleno',
    'weathering': 'Alteración',
    'groundwater': 'Agua Subterránea',
    'discontinuity_orientation': 'Orientación'
  };

  // Load Catalog
  useEffect(() => {
    fetch('/api/geomechanics/catalogs')
      .then(res => res.json())
      .then(data => {
        setCatalog(data);
        
        // Auto-select first option for each parameter
        const initialSelected: Record<string, RmrOption> = {};
        parameterKeys.forEach(key => {
          if (data[key] && data[key].length > 0) {
            initialSelected[key] = data[key][0];
          }
        });
        setSelectedParams(initialSelected);
      })
      .catch(err => setError('Error al cargar catálogo RMR'))
      .finally(() => setLoading(false));
  }, []);

  // Calculate RQD
  const calculateRqd = useCallback(async () => {
    if (!currentAnalysis || !currentAnalysis.cracks) return;
    
    setRqdLoading(true);
    try {
      // Usamos LineLengthM = 1.0 por defecto para el prototipo (100cm de ancho)
      const res = await fetch('/api/geomechanics/rqd/palmstrom', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          discontinuityCount: currentAnalysis.cracks.length,
          lineLengthM: 1.0
        })
      });
      const data = await res.json();
      setRqdResult(data);
      
      // Auto-update RMR RQD option if possible based on value
      if (catalog['rqd']) {
        const value = data.value;
        const matchingOption = catalog['rqd'].find(o => {
          if (o.code === 'rqd_1') return value >= 90;
          if (o.code === 'rqd_2') return value >= 75 && value < 90;
          if (o.code === 'rqd_3') return value >= 50 && value < 75;
          if (o.code === 'rqd_4') return value >= 25 && value < 50;
          return value < 25;
        });
        if (matchingOption) {
          setSelectedParams(prev => ({ ...prev, rqd: matchingOption }));
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      setRqdLoading(false);
    }
  }, [currentAnalysis, catalog]);

  // Initial RQD calc
  useEffect(() => {
    if (!loading && catalog['rqd'] && !rqdResult) {
      calculateRqd();
    }
  }, [loading, catalog, rqdResult, calculateRqd]);

  const handleSelectChange = (key: string, code: string) => {
    const option = catalog[key]?.find(o => o.code === code);
    if (option) {
      setSelectedParams(prev => ({ ...prev, [key]: option }));
    }
  };

  const totalRmr = useMemo(() => {
    return Object.values(selectedParams).reduce((sum, opt) => sum + opt.score, 0);
  }, [selectedParams]);

  const rmrClass = useMemo(() => {
    if (totalRmr > 80) return { class: 'I', quality: 'Muy Buena', color: 'text-dark-accent' };
    if (totalRmr > 60) return { class: 'II', quality: 'Buena', color: 'text-[#10b981]' };
    if (totalRmr > 40) return { class: 'III', quality: 'Regular', color: 'text-dark-warning' };
    if (totalRmr > 20) return { class: 'IV', quality: 'Mala', color: 'text-[#f97316]' };
    return { class: 'V', quality: 'Muy Mala', color: 'text-dark-danger' };
  }, [totalRmr]);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const payload = {
        zoneId: zoneId,
        monitoringId: currentAnalysis?.analysis_id,
        rqd: rqdResult ? {
          method: 'Palmstrom',
          discontinuityCount: currentAnalysis?.cracks?.length || 0,
          lineLengthM: 1.0,
          value: rqdResult.value,
          quality: rqdResult.quality
        } : null,
        rmr: {
          value: totalRmr,
          class: `Clase ${rmrClass.class}`,
          quality: rmrClass.quality,
          parameters: Object.values(selectedParams).map(opt => ({
            parameterKey: opt.parameterKey,
            selectedCode: opt.code,
            selectedLabel: opt.label,
            score: opt.score
          }))
        }
      };

      const res = await fetch('/api/geomechanics/evaluations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      
      if (!res.ok) throw new Error('Error al guardar la evaluación');
      
      onClose();
    } catch (e: any) {
      setError(e.message);
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-2xl bg-dark-surface rounded-xl border border-dark-border shadow-2xl flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-dark-border">
          <div>
            <h2 className="text-lg font-bold text-dark-text">Evaluación Geomecánica</h2>
            <p className="text-xs text-dark-textSecondary">
              Captura: {currentAnalysis?.analysis_id ? currentAnalysis.analysis_id.slice(0,8) : 'N/A'} • {currentAnalysis?.cracks?.length || 0} fisuras
            </p>
          </div>
          <button onClick={onClose} className="text-dark-textSecondary hover:text-dark-text">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          {error && (
            <div className="p-3 bg-dark-danger/10 border border-dark-danger/30 rounded-lg text-sm text-dark-danger">
              {error}
            </div>
          )}

          {loading ? (
            <div className="flex justify-center py-8">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-dark-accent border-t-transparent" />
            </div>
          ) : (
            <>
              {/* RQD Section */}
              <div className="p-4 rounded-xl border border-dark-border bg-dark-primary/30">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-dark-text">RQD Estimado (Palmström)</h3>
                  <button 
                    onClick={calculateRqd} 
                    disabled={rqdLoading}
                    className="text-xs text-dark-accent hover:text-dark-accent/80 flex items-center gap-1"
                  >
                    <svg className={`w-3 h-3 ${rqdLoading ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    Recalcular
                  </button>
                </div>
                
                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-dark-surface p-3 rounded-lg border border-dark-border text-center">
                    <p className="text-[10px] uppercase text-dark-textSecondary tracking-wider">Fisuras Visibles</p>
                    <p className="text-xl font-bold mt-1 text-dark-text">{currentAnalysis?.cracks?.length || 0}</p>
                  </div>
                  <div className="bg-dark-surface p-3 rounded-lg border border-dark-border text-center">
                    <p className="text-[10px] uppercase text-dark-textSecondary tracking-wider">Línea Ref.</p>
                    <p className="text-xl font-bold mt-1 text-dark-text">1.0 m</p>
                  </div>
                  <div className="bg-dark-surface p-3 rounded-lg border border-dark-accent/30 text-center">
                    <p className="text-[10px] uppercase text-dark-accent tracking-wider">RQD Resultante</p>
                    <p className="text-xl font-bold mt-1 text-dark-text">
                      {rqdResult ? `${rqdResult.value.toFixed(1)}%` : '—'}
                    </p>
                  </div>
                </div>
              </div>

              {/* RMR Parameters */}
              <div>
                <h3 className="text-sm font-semibold text-dark-text mb-4">Parámetros RMR (Bieniawski)</h3>
                <div className="grid sm:grid-cols-2 gap-4">
                  {parameterKeys.map(key => (
                    <div key={key} className="space-y-1.5">
                      <label className="text-xs font-medium text-dark-textSecondary">{parameterLabels[key]}</label>
                      <select 
                        className="w-full bg-dark-primary border border-dark-border rounded-lg px-3 py-2 text-sm text-dark-text outline-none focus:border-dark-accent"
                        value={selectedParams[key]?.code || ''}
                        onChange={(e) => handleSelectChange(key, e.target.value)}
                      >
                        {catalog[key]?.map(opt => (
                          <option key={opt.code} value={opt.code}>
                            {opt.label} ({opt.score > 0 ? '+' : ''}{opt.score})
                          </option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-dark-border px-5 py-4 bg-dark-primary/30 flex items-center justify-between rounded-b-xl shrink-0">
          <div>
            <p className="text-xs text-dark-textSecondary uppercase tracking-wider font-semibold">Clasificación RMR</p>
            <p className="text-lg font-bold flex items-baseline gap-2">
              <span className="text-dark-text">{totalRmr}</span>
              <span className={`text-sm ${rmrClass.color}`}>Clase {rmrClass.class} • {rmrClass.quality}</span>
            </p>
          </div>
          <div className="flex gap-3">
            <button 
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-dark-textSecondary hover:text-dark-text"
            >
              Cancelar
            </button>
            <button 
              onClick={handleSave}
              disabled={loading || saving}
              className="px-6 py-2 bg-dark-accent text-dark-primary text-sm font-bold rounded-lg hover:opacity-90 disabled:opacity-50 flex items-center gap-2"
            >
              {saving ? 'Guardando...' : 'Guardar Evaluación'}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}

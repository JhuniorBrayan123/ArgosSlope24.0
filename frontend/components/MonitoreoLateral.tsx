'use client';

import { useEffect, useState } from 'react';
import mqtt, { MqttClient } from 'mqtt';

interface FisuraDetectada {
  roi_id: string;
  classification: 'fina' | 'media' | 'gruesa' | 'none';
  // Supports both naming conventions: edge Python (largo/ancho/area) and legacy (length_mm/width_mm/area_mm2)
  length_mm?: number;
  width_mm?: number;
  area_mm2?: number;
  largo?: number;
  ancho?: number;
  area?: number;
  timestamp: number;
  calibrado?: boolean;
  unidad?: string;
}

interface MonitoreoLateralProps {
  mqttUrl: string;
  mqttTopic?: string;
  mqttUsername?: string;
  mqttPassword?: string;
}

export default function MonitoreoLateral({
  mqttUrl,
  mqttTopic = 'argos/+/fisura',
  mqttUsername,
  mqttPassword,
}: MonitoreoLateralProps) {
  const [fisuras, setFisuras] = useState<FisuraDetectada[]>([]);
  const [client, setClient] = useState<MqttClient | null>(null);

  useEffect(() => {
    if (!mqttUrl) return;

    const mqttClient = mqtt.connect(mqttUrl, {
      protocolId: 'MQTT',
      protocolVersion: 4,
      clean: true,
      reconnectPeriod: 5000,
      username: mqttUsername,
      password: mqttPassword,
    });

    setClient(mqttClient);

    mqttClient.on('connect', () => {
      mqttClient.subscribe(mqttTopic, { qos: 1 });
    });

    mqttClient.on('message', (topic, payload) => {
      try {
        const raw = JSON.parse(payload.toString());
        // Normalize both field naming conventions
        const data: FisuraDetectada = {
          roi_id: raw.roi_id ?? raw.id ?? 'unknown',
          classification: raw.classification ?? 'none',
          length_mm: raw.length_mm ?? raw.largo ?? 0,
          width_mm: raw.width_mm ?? raw.ancho ?? 0,
          area_mm2: raw.area_mm2 ?? raw.area ?? 0,
          timestamp: Date.now() / 1000,
          calibrado: raw.calibrado,
          unidad: raw.unidad,
        };

        setFisuras((prev) => {
          const existingIdx = prev.findIndex((f) => f.roi_id === data.roi_id);
          let newFisuras = [...prev];
          
          if (existingIdx >= 0) {
            newFisuras[existingIdx] = data;
          } else {
            newFisuras.push(data);
          }
          
          // Limpiar fisuras viejas (más de 5 segundos)
          const now = Date.now() / 1000;
          newFisuras = newFisuras.filter((f) => now - f.timestamp < 5.0);
          
          // Ordenar por severidad (gruesa -> media -> fina) y luego por largo
          return newFisuras.sort((a, b) => {
            const getSeverityWeight = (c: string) => {
              if (c === 'gruesa') return 3;
              if (c === 'media') return 2;
              if (c === 'fina') return 1;
              return 0;
            };
            const wA = getSeverityWeight(a.classification);
            const wB = getSeverityWeight(b.classification);
            if (wA !== wB) return wB - wA;
            return (b.length_mm ?? 0) - (a.length_mm ?? 0);
          });
        });
      } catch (err) {
        // Ignorar mensajes mal formados
      }
    });

    return () => {
      mqttClient.end(true);
      setClient(null);
    };
  }, [mqttUrl, mqttTopic, mqttUsername, mqttPassword]);

  // Intervalo de limpieza adicional (para cuando dejan de llegar mensajes)
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now() / 1000;
      setFisuras((prev) => prev.filter((f) => now - f.timestamp < 5.0));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const getBadgeColors = (classification: string) => {
    switch (classification) {
      case 'gruesa': return 'bg-red-500/20 text-red-400 border-red-500/30';
      case 'media': return 'bg-amber-500/20 text-amber-400 border-amber-500/30';
      case 'fina': return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';
      default: return 'bg-gray-500/20 text-gray-400 border-gray-500/30';
    }
  };

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-xl border border-dark-border bg-dark-surface">
      <div className="flex shrink-0 items-center justify-between border-b border-dark-border px-4 py-3">
        <h2 className="font-semibold text-dark-text">Detecciones Activas</h2>
        <span className="rounded-full bg-dark-accent/10 px-2 py-0.5 text-xs font-medium text-dark-accent">
          {fisuras.length}
        </span>
      </div>
      
      <div className="flex-1 overflow-y-auto p-2">
        {fisuras.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center p-6 text-center text-dark-textSecondary">
            <svg className="mb-2 h-8 w-8 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M5 13l4 4L19 7" />
            </svg>
            <p className="text-sm">No se detectan fisuras en este momento.</p>
          </div>
        ) : (
          <ul className="space-y-2">
            {fisuras.map((f) => (
              <li key={f.roi_id} className="flex flex-col gap-2 rounded-lg border border-dark-border bg-dark-primary p-3 transition-colors hover:border-dark-secondary/50">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs text-dark-text">ID: {f.roi_id}</span>
                  <span className={`rounded border px-1.5 py-0.5 text-[10px] font-bold uppercase ${getBadgeColors(f.classification)}`}>
                    {f.classification}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs text-dark-textSecondary">
                  <div>
                    <span className="block text-[10px] uppercase opacity-70">Largo</span>
                    <span className="font-medium text-dark-text">
                      {(f.length_mm ?? 0).toFixed(1)}{' '}
                      <span className="text-[10px] opacity-60">
                        {f.calibrado === false ? 'px [Est.]' : (f.unidad || 'mm')}
                      </span>
                    </span>
                  </div>
                  <div>
                    <span className="block text-[10px] uppercase opacity-70">Ancho Máx</span>
                    <span className="font-medium text-dark-text">
                      {(f.width_mm ?? 0).toFixed(1)}{' '}
                      <span className="text-[10px] opacity-60">
                        {f.calibrado === false ? 'px [Est.]' : (f.unidad || 'mm')}
                      </span>
                    </span>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

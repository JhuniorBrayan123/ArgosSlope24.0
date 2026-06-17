/**
 * ARGOS SLOPE 4.0 — Hook: useDatos3D.
 *
 * Consumes Snapshot3D payloads from MQTT topic "mineria/talud/alertas":
 *   mesh + image_base64 texture + cracks with x3d/y3d/z3d
 *
 * Fallback: "argos/+/fisura" for 2D detections (estimated 3D positions).
 */

'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import mqtt, { MqttClient } from 'mqtt';
import type {
  PointCloudPoint,
  Crack3D,
  Mesh3D,
  Calibration3D,
  ReconstructionStatus,
  ReconstructionMode,
} from '@/services/pointcloud.types';

export type MqttStatus = 'connecting' | 'connected' | 'disconnected' | 'error';

export type DataSource3D =
  | 'mesh-3d'
  | 'pointcloud-3d'
  | 'cracks-2d'
  | 'reconstruction-2d'
  | 'sin-datos';

export interface Datos3D {
  mesh: Mesh3D | null;
  imageBase64: string | null;
  pointCloud: PointCloudPoint[];
  cracks: Crack3D[];
  timestamp: string | null;
  deviceId: string | null;
  calibration: Calibration3D | null;
  reconstruction: ReconstructionStatus | null;
  totalDetectadas: number;
  fuente: DataSource3D;
}

export interface UseDatos3DResult {
  datos: Datos3D;
  status: MqttStatus;
  statusMessage: string;
  error: string | null;
  reconnect: () => void;
}

const EMPTY_DATOS: Datos3D = {
  mesh: null,
  imageBase64: null,
  pointCloud: [],
  cracks: [],
  timestamp: null,
  deviceId: null,
  calibration: null,
  reconstruction: null,
  totalDetectadas: 0,
  fuente: 'sin-datos',
};

function parseMesh(raw: Record<string, unknown> | undefined): Mesh3D | null {
  if (!raw?.vertices || !raw?.indices || !raw?.uvs) return null;
  const vertices = (raw.vertices as number[]) ?? [];
  const indices = (raw.indices as number[]) ?? [];
  const uvs = (raw.uvs as number[]) ?? [];
  if (vertices.length < 9 || indices.length < 3) return null;
  return {
    vertices,
    indices,
    uvs,
    centroid: raw.centroid as number[] | undefined,
    scale: raw.scale as number | undefined,
  };
}

function parseSnapshotPayload(payload: Record<string, unknown>): Datos3D {
  // Parse reconstruction metadata (v2 payloads always include this)
  const rawRec = payload.reconstruction as Record<string, unknown> | undefined;
  const reconstruction: ReconstructionStatus | null = rawRec
    ? {
        mode: (rawRec.mode as ReconstructionMode) || '2d_only',
        scene_valid: Boolean(rawRec.scene_valid),
        quality_score: Number(rawRec.quality_score ?? 0),
        reject_reason: String(rawRec.reject_reason ?? ''),
        message: String(rawRec.message ?? ''),
      }
    : null;

  // Parse mesh — only trust it when reconstruction.mode === '3d_valid'
  const reconstructionMode = reconstruction?.mode;
  const rawMesh = payload.mesh as Record<string, unknown> | undefined;
  const mesh =
    (reconstructionMode === '3d_valid' || reconstructionMode == null)
      ? parseMesh(rawMesh)
      : null;

  const imageBase64 = (payload.image_base64 as string) || null;

  const pointCloud: PointCloudPoint[] = (payload.point_cloud as number[][] || []).map(
    (p: number[]) => [
      Number(p[0] ?? 0),
      Number(p[1] ?? 0),
      Number(p[2] ?? 0),
      Number(p[3] ?? 128),
      Number(p[4] ?? 128),
      Number(p[5] ?? 128),
    ]
  );

  const cracks: Crack3D[] = (payload.cracks as Record<string, unknown>[] || []).map(
    (c) => ({
      roi_id: String(c.roi_id ?? ''),
      x: Number(c.x ?? 0) || undefined,
      y: Number(c.y ?? 0) || undefined,
      w: Number(c.w ?? 0) || undefined,
      h: Number(c.h ?? 0) || undefined,
      x3d: c.x3d !== undefined ? Number(c.x3d) : undefined,
      y3d: c.y3d !== undefined ? Number(c.y3d) : undefined,
      z3d: c.z3d !== undefined ? Number(c.z3d) : 1,
      classification: String(c.classification ?? 'none'),
      length_mm: Number(c.length_mm ?? 0) || undefined,
      width_mm: Number(c.width_mm ?? 0) || undefined,
      surface_valid: Boolean(c.surface_valid),
    })
  );

  const calibration = payload.calibration as Calibration3D | undefined;

  // Determine data source based on reconstruction mode
  let fuente: DataSource3D = 'sin-datos';
  if (reconstructionMode === '3d_valid' && mesh) {
    fuente = 'mesh-3d';
  } else if (reconstructionMode === '2d_only' || reconstructionMode === 'invalid_scene') {
    fuente = 'reconstruction-2d';
  } else if (mesh) {
    fuente = 'mesh-3d'; // legacy payload without reconstruction field
  } else if (pointCloud.length > 0) {
    fuente = 'pointcloud-3d';
  } else if (cracks.length > 0) {
    fuente = 'cracks-2d';
  }

  return {
    mesh,
    imageBase64,
    pointCloud,
    cracks,
    timestamp: (payload.timestamp as string) || new Date().toISOString(),
    deviceId: (payload.device_id as string) || null,
    calibration: calibration ?? null,
    reconstruction,
    totalDetectadas: cracks.length,
    fuente,
  };
}

function bboxToCrack3D(msg: Record<string, unknown>): Crack3D | null {
  const x = Number(msg.x ?? 0);
  const y = Number(msg.y ?? 0);
  const w = Number(msg.width ?? msg.w ?? 10);
  const h = Number(msg.height ?? msg.h ?? 10);
  const cx = x + w / 2;
  const cy = y + h / 2;

  const z3d = 1.0;
  const x3d = (cx / 854 - 0.5) * 2.0;
  const y3d = (0.5 - cy / 480) * 1.5;

  return {
    roi_id: String(msg.roi_id ?? ''),
    x: Math.round(x),
    y: Math.round(y),
    w: Math.round(w),
    h: Math.round(h),
    x3d: Math.round(x3d * 1000) / 1000,
    y3d: Math.round(y3d * 1000) / 1000,
    z3d,
    classification: String(msg.classification ?? 'none'),
    length_mm: Number(msg.length_mm ?? 0) || undefined,
    width_mm: Number(msg.width_mm ?? 0) || undefined,
  };
}

export default function useDatos3D(
  mqttWsUrl?: string,
  username?: string,
  password?: string
): UseDatos3DResult {
  const url =
    mqttWsUrl ||
    process.env.NEXT_PUBLIC_MQTT_WS_URL ||
    '';

  const mqttUser = username || process.env.NEXT_PUBLIC_MQTT_USERNAME || '';
  const mqttPass = password || process.env.NEXT_PUBLIC_MQTT_PASSWORD || '';

  const clientRef = useRef<MqttClient | null>(null);
  const statusRef = useRef<MqttStatus>('disconnected');
  const [status, setStatus] = useState<MqttStatus>('disconnected');
  const [statusMessage, setStatusMessage] = useState('Esperando snapshot 3D real desde el Edge…');
  const [error, setError] = useState<string | null>(null);
  const [datos, setDatos] = useState<Datos3D>(EMPTY_DATOS);

  const cracks2DRef = useRef<Map<string, Crack3D>>(new Map());
  const totalDetectadasRef = useRef(0);

  const updateStatus = useCallback((s: MqttStatus) => {
    statusRef.current = s;
    setStatus(s);
  }, []);

  const connect = useCallback(() => {
    if (clientRef.current) {
      clientRef.current.end(true);
    }

    if (!url) {
      setStatus('disconnected');
      setStatusMessage('Sin conexión MQTT configurada');
      return;
    }

    updateStatus('connecting');
    setStatusMessage('Conectando al broker MQTT...');
    setError(null);

    try {
      const opts: Record<string, unknown> = {};
      if (mqttUser) opts.username = mqttUser;
      if (mqttPass) opts.password = mqttPass;

      const client = mqtt.connect(url, opts);
      clientRef.current = client;

      client.on('connect', () => {
        updateStatus('connected');
        setStatusMessage('Esperando snapshot 3D real desde el Edge…');
        setError(null);
        client.subscribe('mineria/talud/alertas', { qos: 1 });
        client.subscribe('argos/+/fisura', { qos: 1 });
        client.subscribe('argos/+/telemetry', { qos: 1 });
      });

      client.on('message', (topic: string, raw: Buffer) => {
        try {
          const payload = JSON.parse(raw.toString()) as Record<string, unknown>;

          if (topic === 'mineria/talud/alertas') {
            const parsed = parseSnapshotPayload(payload);
            setDatos(parsed);

            if (parsed.fuente === 'mesh-3d') {
              const faceCount = Math.floor((parsed.mesh?.indices.length ?? 0) / 3);
              const score = parsed.reconstruction?.quality_score;
              setStatusMessage(
                `Malla 3D · ${faceCount} caras · ${parsed.cracks.length} fisuras` +
                (score !== undefined ? ` · Q=${score.toFixed(2)}` : '')
              );
            } else if (parsed.fuente === 'reconstruction-2d') {
              const reason = parsed.reconstruction?.reject_reason || 'calidad insuficiente';
              setStatusMessage(
                `Vista 2D · ${parsed.cracks.length} fisuras · ${reason}`
              );
            } else if (parsed.fuente === 'pointcloud-3d') {
              setStatusMessage(
                `Nube 3D · ${parsed.pointCloud.length} pts · ${parsed.cracks.length} fisuras`
              );
            } else if (parsed.cracks.length > 0) {
              setStatusMessage(`${parsed.cracks.length} fisuras (sin malla aún)`);
            }
            return;
          }

          if (topic.includes('/fisura')) {
            const crack3d = bboxToCrack3D(payload);
            if (crack3d?.roi_id) {
              cracks2DRef.current.set(crack3d.roi_id, crack3d);
              totalDetectadasRef.current = cracks2DRef.current.size;
            }
            return;
          }

          if (topic.includes('/telemetry')) {
            const count = Number(payload.cracks_count ?? 0);
            if (count > 0) totalDetectadasRef.current = count;
          }
        } catch {
          // Ignorar mensajes malformados
        }
      });

      client.on('error', (err: Error) => {
        updateStatus('error');
        setStatusMessage('Error MQTT');
        setError(err.message);
      });

      client.on('close', () => {
        if (statusRef.current !== 'error') {
          updateStatus('disconnected');
          setStatusMessage('Desconectado');
        }
      });

      client.on('offline', () => {
        updateStatus('disconnected');
        setStatusMessage('Broker no disponible');
      });
    } catch (err) {
      updateStatus('error');
      setStatusMessage('Error al conectar');
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [url, mqttUser, mqttPass, updateStatus]);

  useEffect(() => {
    connect();
    return () => {
      if (clientRef.current) {
        clientRef.current.end(true);
        clientRef.current = null;
      }
    };
  }, [connect]);

  useEffect(() => {
    const interval = setInterval(() => {
      const cracks2d = Array.from(cracks2DRef.current.values());
      const total = totalDetectadasRef.current;

      if (cracks2d.length > 0) {
        setDatos((prev) => {
          if (prev.fuente === 'mesh-3d' || prev.fuente === 'pointcloud-3d') return prev;
          return {
            ...EMPTY_DATOS,
            cracks: cracks2d,
            timestamp: new Date().toISOString(),
            totalDetectadas: total,
            fuente: 'cracks-2d',
          };
        });
        setStatusMessage(`${cracks2d.length} fisuras detectadas (2D → 3D estimado)`);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  return {
    datos,
    status,
    statusMessage,
    error,
    reconnect: connect,
  };
}

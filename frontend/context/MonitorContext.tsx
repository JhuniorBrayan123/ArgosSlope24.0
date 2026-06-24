
'use client';

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useCallback,
  type ReactNode,
} from 'react';

// ── Tipos ──────────────────────────────────────────────────────────

export interface Point3D {
  x: number;
  y: number;
  z: number;
  r: number;
  g: number;
  b: number;
}

export interface CrackData {
  x: number;
  y: number;
  w: number;
  h: number;
  classification: string;
  roi_id: string;
}

export interface HdCaptureInfo {
  filename: string;
  timestamp: string;
  device_id: string;
  point_count: number;
  vertex_count: number;
  face_count: number;
}

export interface Alerta {
  id: string;
  tipo: 'fisura' | 'alerta_crecimiento' | 'captura_hd' | 'telemetry';
  timestamp: number;
  mensaje: string;
  data: Record<string, unknown>;
}

export type WebRtcStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface MonitorState {
  /** Conexión MQTT */
  mqttConnected: boolean;
  /** Estado de la cámara WebRTC */
  camaraStatus: WebRtcStatus;
  /** URL de señalización WebRTC */
  signalingUrl: string;
  /** Última nube de puntos 3D recibida */
  pointCloud: number[][];
  /** Timestamp de la última alerta 3D */
  pointCloudTimestamp: string | null;
  /** Fisuras del último mensaje 3D */
  cracks: CrackData[];
  /** Ruta de imagen del último mensaje 3D */
  imagePath: string;
  /** Historial de alertas (máx 100) */
  alertas: Alerta[];
  /** Captura HD más reciente */
  ultimaCapturaHd: HdCaptureInfo | null;
  /** Lista de capturas HD disponibles */
  capturasHd: HdCaptureInfo[];
  /** URL base para archivos estáticos (MJPEG server) */
  staticFilesUrl: string;
}

// ── Context ────────────────────────────────────────────────────────

export interface MonitorContextValue extends MonitorState {
  /** Enviar señal de captura HD */
  triggerCapturaHd: () => void;
  /** Conectar cámara WebRTC con una URL de señalización */
  conectarCamara: (url: string) => void;
  /** Desconectar cámara */
  desconectarCamara: () => void;
  /** Limpiar historial de alertas */
  limpiarAlertas: () => void;
  /** Seleccionar una captura HD para visualizar */
  seleccionarCapturaHd: (captura: HdCaptureInfo) => void;
  /** Captura HD seleccionada actualmente */
  capturaHdSeleccionada: HdCaptureInfo | null;
}

const MonitorContext = createContext<MonitorContextValue | null>(null);

// ── Constantes ─────────────────────────────────────────────────────

const MQTT_WS_URL =
  process.env.NEXT_PUBLIC_MQTT_WS_URL ||
  'wss://f7d15ef59be6462fa26af237cfa21b0f.s1.eu.hivemq.cloud:8884/mqtt';

const MQTT_USERNAME =
  process.env.NEXT_PUBLIC_MQTT_USERNAME || 'argos-edge';

const MQTT_PASSWORD =
  process.env.NEXT_PUBLIC_MQTT_PASSWORD || 'Argosmineria123.@';

const ALERT_TOPIC_3D =
  process.env.NEXT_PUBLIC_ALERT_TOPIC || 'mineria/talud/alertas';

const CAPTURA_COMPLETA_TOPIC = 'mineria/talud/captura_completada';
const CAPTURA_TRIGGER_TOPIC = 'mineria/talud/capturar_hd';

const STATIC_FILES_URL =
  process.env.NEXT_PUBLIC_STATIC_URL || 'http://localhost:8082';

const MAX_ALERTAS = 100;

// ── Id único para alertas ──────────────────────────────────────────

let _alertaId = 0;
function nextAlertaId(): string {
  _alertaId += 1;
  return `alerta-${_alertaId}-${Date.now()}`;
}

// ── Provider ───────────────────────────────────────────────────────

export function MonitorProvider({ children }: { children: ReactNode }) {
  // ── Estado ───────────────────────────────────────────────────────
  const [mqttConnected, setMqttConnected] = useState(false);
  const [camaraStatus, setCamaraStatus] = useState<WebRtcStatus>('disconnected');
  const [signalingUrl, setSignalingUrl] = useState('');
  const [pointCloud, setPointCloud] = useState<number[][]>([]);
  const [pointCloudTimestamp, setPointCloudTimestamp] = useState<string | null>(null);
  const [cracks, setCracks] = useState<CrackData[]>([]);
  const [imagePath, setImagePath] = useState('');
  const [alertas, setAlertas] = useState<Alerta[]>([]);
  const [ultimaCapturaHd, setUltimaCapturaHd] = useState<HdCaptureInfo | null>(null);
  const [capturasHd, setCapturasHd] = useState<HdCaptureInfo[]>([]);
  const [capturaHdSeleccionada, setCapturaHdSeleccionada] = useState<HdCaptureInfo | null>(null);

  // Refs para servicios que viven toda la vida del Provider
  const mqttClientRef = useRef<any>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const mountedRef = useRef(true);

  // ── Helper: agregar alerta al historial ──────────────────────────
  const addAlerta = useCallback(
    (tipo: Alerta['tipo'], mensaje: string, data: Record<string, unknown> = {}) => {
      const alerta: Alerta = {
        id: nextAlertaId(),
        tipo,
        timestamp: Date.now(),
        mensaje,
        data,
      };
      setAlertas((prev) => [alerta, ...prev].slice(0, MAX_ALERTAS));
    },
    [],
  );

  // ── MQTT: conectar al montar ──────────────────────────────────
  useEffect(() => {
    mountedRef.current = true;

    async function connectMqtt() {
      try {
        const mqttModule = await import('mqtt');
        const mqtt = mqttModule.default || mqttModule;
        const client = mqtt.connect(MQTT_WS_URL, {
          protocolVersion: 4,
          clean: true,
          reconnectPeriod: 5000,
          connectTimeout: 10_000,
          keepalive: 60,
          username: MQTT_USERNAME,
          password: MQTT_PASSWORD,
        });

        mqttClientRef.current = client;

        client.on('connect', () => {
          if (!mountedRef.current) return;
          setMqttConnected(true);
          addAlerta('telemetry', 'Conectado al broker MQTT');

          // Suscribirse a topics
          client.subscribe(ALERT_TOPIC_3D, { qos: 1 });
          client.subscribe(CAPTURA_COMPLETA_TOPIC, { qos: 1 });
        });

        client.on('message', (topic: string, raw: Buffer) => {
          if (!mountedRef.current) return;
          try {
            const payload = JSON.parse(raw.toString());

            if (topic === ALERT_TOPIC_3D) {
              // Nube de puntos 3D + fisuras
              const pc = payload.point_cloud ?? [];
              setPointCloud(pc);
              setPointCloudTimestamp(payload.timestamp ?? null);
              setCracks(payload.cracks ?? []);
              setImagePath(payload.image_path ?? '');

              if (payload.cracks?.length > 0) {
                addAlerta('fisura', `${payload.cracks.length} fisura(s) detectada(s)`, payload);
              }
            } else if (topic === CAPTURA_COMPLETA_TOPIC) {
              // Captura HD completada
              const info: HdCaptureInfo = {
                filename: payload.filename,
                timestamp: payload.timestamp,
                device_id: payload.device_id,
                point_count: payload.point_count,
                vertex_count: payload.vertex_count,
                face_count: payload.face_count,
              };
              setUltimaCapturaHd(info);
              setCapturasHd((prev) => [info, ...prev].slice(0, 20));
              setCapturaHdSeleccionada(info);
              addAlerta('captura_hd', `Captura HD completada: ${payload.filename}`, payload);
            }
          } catch {
            // Ignorar mensajes malformados
          }
        });

        client.on('close', () => {
          if (!mountedRef.current) return;
          setMqttConnected(false);
        });

        client.on('offline', () => {
          if (!mountedRef.current) return;
          setMqttConnected(false);
        });

        client.on('error', (err: Error) => {
          console.warn('[MonitorContext] MQTT error:', err.message);
        });
      } catch (err) {
        console.error('[MonitorContext] Failed to create MQTT client:', err);
      }
    }

    connectMqtt();

    return () => {
      mountedRef.current = false;
      if (mqttClientRef.current) {
        mqttClientRef.current.end(true);
        mqttClientRef.current = null;
      }
    };
  }, [addAlerta]);

  // ── WebRTC: conexión de cámara ─────────────────────────────────
  const conectarCamara = useCallback(
    async (url: string) => {
      if (pcRef.current) {
        pcRef.current.close();
        pcRef.current = null;
      }
      setCamaraStatus('connecting');
      setSignalingUrl(url);

      try {
        const pc = new RTCPeerConnection({
          iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
          ],
        });
        pcRef.current = pc;

        pc.ontrack = (event) => {
          if (videoRef.current && event.streams[0]) {
            videoRef.current.srcObject = event.streams[0];
            setCamaraStatus('connected');
            videoRef.current.play().catch(() => {});
          }
        };

        pc.oniceconnectionstatechange = () => {
          if (
            pc.iceConnectionState === 'disconnected' ||
            pc.iceConnectionState === 'failed'
          ) {
            setCamaraStatus('disconnected');
          }
        };

        const offer = await pc.createOffer({
          offerToReceiveVideo: true,
          offerToReceiveAudio: false,
        });
        await pc.setLocalDescription(offer);

        const origin = url.replace(/\/+$/, '');
        const response = await fetch(`${origin}/offer`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sdp: pc.localDescription?.sdp,
            type: pc.localDescription?.type,
          }),
        });

        if (!response.ok) {
          throw new Error(`Signaling error (${response.status})`);
        }

        const answer = await response.json();
        if (!answer.sdp) throw new Error('Invalid signaling response: missing SDP');
        await pc.setRemoteDescription(new RTCSessionDescription(answer));
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        setCamaraStatus('error');
        addAlerta('telemetry', `Error de cámara: ${msg}`);
        if (pcRef.current) {
          pcRef.current.close();
          pcRef.current = null;
        }
      }
    },
    [addAlerta],
  );

  const desconectarCamara = useCallback(() => {
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCamaraStatus('disconnected');
    setSignalingUrl('');
  }, []);

  // ── Trigger captura HD ──────────────────────────────────────────
  const triggerCapturaHd = useCallback(() => {
    const client = mqttClientRef.current;
    if (!client || !mqttConnected) {
      addAlerta('telemetry', 'MQTT desconectado — no se puede capturar');
      return;
    }
    const payload = JSON.stringify({
      command: 'capturar',
      device_id: 'argos-edge-01',
      timestamp: new Date().toISOString(),
    });
    client.publish(CAPTURA_TRIGGER_TOPIC, payload, { qos: 1 });
    addAlerta('telemetry', 'Señal de captura HD enviada');
  }, [mqttConnected, addAlerta]);

  // ── Utilidades ──────────────────────────────────────────────────
  const limpiarAlertas = useCallback(() => setAlertas([]), []);

  const value: MonitorContextValue = {
    mqttConnected,
    camaraStatus,
    signalingUrl,
    pointCloud,
    pointCloudTimestamp,
    cracks,
    imagePath,
    alertas,
    ultimaCapturaHd,
    capturasHd,
    capturaHdSeleccionada,
    staticFilesUrl: STATIC_FILES_URL,
    triggerCapturaHd,
    conectarCamara,
    desconectarCamara,
    limpiarAlertas,
    seleccionarCapturaHd: setCapturaHdSeleccionada,
  };

  return (
    <MonitorContext.Provider value={value}>
      {/* Video oculto para WebRTC — el PanelPrincipal lo referenciará */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        style={{ display: 'none' }}
      />
      {children}
    </MonitorContext.Provider>
  );
}

// ── Hook ───────────────────────────────────────────────────────────

export function useMonitor(): MonitorContextValue {
  const ctx = useContext(MonitorContext);
  if (!ctx) {
    throw new Error('useMonitor debe usarse dentro de <MonitorProvider>');
  }
  return ctx;
}

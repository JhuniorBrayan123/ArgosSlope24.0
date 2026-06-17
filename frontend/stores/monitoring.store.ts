/**
 * ARGOS SLOPE 4.0 — Monitoring Store.
 *
 * Persists WebRTC signaling URL, MQTT connection config, and overlay
 * state across page navigations so the video stream doesn't reset
 * when switching between Monitoreo → Talud 3D → Monitoreo.
 *
 * State is kept in zustand (in-memory) — survives React unmount/remount
 * as long as the app shell (layout) stays mounted.
 */

import { create } from 'zustand';

interface MonitoringState {
  // WebRTC signaling
  signalingUrl: string;
  setSignalingUrl: (url: string) => void;

  // MQTT
  mqttUrl: string;
  mqttUser: string;
  mqttPass: string;
  setMqttConfig: (url: string, user: string, pass: string) => void;

  // Overlay
  showOverlay: boolean;
  toggleOverlay: () => void;

  // Connection status (not persisted, but tracked)
  mqttConnected: boolean;
  setMqttConnected: (connected: boolean) => void;
  webrtcConnected: boolean;
  setWebrtcConnected: (connected: boolean) => void;
}

const DEFAULT_SIGNALING =
  process.env.NEXT_PUBLIC_WEBRTC_URL || 'http://localhost:8081';
const DEFAULT_MQTT =
  process.env.NEXT_PUBLIC_MQTT_WS_URL || '';
const DEFAULT_MQTT_USER =
  process.env.NEXT_PUBLIC_MQTT_USERNAME || '';
const DEFAULT_MQTT_PASS =
  process.env.NEXT_PUBLIC_MQTT_PASSWORD || '';

export const useMonitoringStore = create<MonitoringState>((set) => ({
  // WebRTC
  signalingUrl: DEFAULT_SIGNALING,
  setSignalingUrl: (url) => set({ signalingUrl: url }),

  // MQTT
  mqttUrl: DEFAULT_MQTT,
  mqttUser: DEFAULT_MQTT_USER,
  mqttPass: DEFAULT_MQTT_PASS,
  setMqttConfig: (url, user, pass) =>
    set({ mqttUrl: url, mqttUser: user, mqttPass: pass }),

  // Overlay
  showOverlay: true,
  toggleOverlay: () => set((s) => ({ showOverlay: !s.showOverlay })),

  // Connection status
  mqttConnected: false,
  setMqttConnected: (connected) => set({ mqttConnected: connected }),
  webrtcConnected: false,
  setWebrtcConnected: (connected) => set({ webrtcConnected: connected }),
}));

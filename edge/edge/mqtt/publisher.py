"""
ARGOS SLOPE 4.0 — MQTT Publisher for Crack Telemetry.

Publishes crack detection results and system health telemetry to an
MQTT broker. The .NET backend subscribes to these topics.

Topic Structure:
    argos/{device_id}/fisura        # Individual crack detection (JSON)
    argos/{device_id}/telemetry     # System health heartbeat (JSON)
    argos/{device_id}/snapshot      # Base64-encoded frame (optional)

Usage:
    publisher = MqttPublisher()
    publisher.connect()
    publisher.publish_fisura(crack_result)
    publisher.publish_telemetry(fps, cpu, temp)
    publisher.disconnect()
"""

from __future__ import annotations

import base64
import json
import logging
import socket
import time
from typing import Any, Optional

import cv2
import numpy as np

# paho-mqtt is an optional dependency; fail gracefully at import time
try:
    import paho.mqtt.client as mqtt
except ImportError:
    mqtt = None  # type: ignore[assignment]

from edge.config import config
from edge.detector.fisura_detector import CrackResult
from edge.temporal.trend_predictor import TrendPredictionResult

logger = logging.getLogger(__name__)


class MqttPublisher:
    """
    MQTT publisher for edge crack telemetry.

    Connects to the configured broker and publishes on topics:
      - ``{prefix}/fisura`` — per-crack detection result
      - ``{prefix}/telemetry`` — periodic health stats
      - ``{prefix}/snapshot`` — base64 JPEG frame (optional)

    Parameters are read from ``edge.config.config`` by default.
    """

    def __init__(self) -> None:
        self._broker = config.mqtt_broker
        self._port = config.mqtt_port
        self._username = config.mqtt_username
        self._password = config.mqtt_password
        self._tls = config.mqtt_tls_enabled
        self._qos = config.mqtt_qos
        self._topic_prefix = config.mqtt_topic_prefix
        self._device_id = config.device_id

        self._client: Optional["mqtt.Client"] = None
        self._connected = False

    # ── Connection management ───────────────────────────────────────

    def connect(self) -> None:
        """
        Establish connection to the MQTT broker.

        Raises:
            ImportError: If ``paho-mqtt`` is not installed.
            ConnectionError: If the broker cannot be reached.
        """
        if mqtt is None:
            raise ImportError(
                "paho-mqtt is required. Install with: pip install paho-mqtt"
            )

        client_id = f"argos-edge-{self._device_id}-{int(time.time())}"
        self._client = mqtt.Client(
            callback_api_version=mqtt.CallbackAPIVersion.VERSION1,
            client_id=client_id,
            protocol=mqtt.MQTTv311,
        )

        # Authentication
        if self._username:
            self._client.username_pw_set(self._username, self._password)

        # TLS
        if self._tls:
            self._client.tls_set()

        # Reconnect with exponential backoff (1–60s) to avoid broker rate limits
        self._client.reconnect_delay_set(min_delay=1, max_delay=60)

        # Callbacks
        self._client.on_connect = self._on_connect
        self._client.on_disconnect = self._on_disconnect

        logger.info(
            "Connecting to MQTT broker at %s:%d (client=%s)...",
            self._broker,
            self._port,
            client_id,
        )

        try:
            self._client.connect(self._broker, self._port, keepalive=120)
            self._client.loop_start()
            # Wait briefly for the connection to establish
            time.sleep(0.5)
        except (socket.gaierror, OSError, ConnectionRefusedError) as exc:
            raise ConnectionError(
                f"Cannot connect to MQTT broker at {self._broker}:{self._port}: {exc}"
            ) from exc

    def disconnect(self) -> None:
        """Gracefully disconnect from the broker."""
        if self._client and self._connected:
            self._client.loop_stop()
            self._client.disconnect()
            self._connected = False
            logger.info("Disconnected from MQTT broker.")

    @property
    def connected(self) -> bool:
        return self._connected

    # ── Callbacks ───────────────────────────────────────────────────

    def _on_connect(
        self,
        client: "mqtt.Client",
        userdata: Any,
        flags: dict,
        rc: int,
    ) -> None:
        if rc == 0:
            self._connected = True
            logger.info("MQTT connected (rc=0).")
        else:
            self._connected = False
            reasons = {
                1: "Incorrect protocol version",
                2: "Invalid client identifier",
                3: "Server unavailable",
                4: "Bad username or password",
                5: "Not authorised",
            }
            logger.error(
                "MQTT connection failed (rc=%d): %s",
                rc,
                reasons.get(rc, "Unknown error"),
            )

    def _on_disconnect(
        self,
        client: "mqtt.Client",
        userdata: Any,
        rc: int,
    ) -> None:
        self._connected = False
        if rc != 0:
            logger.warning("MQTT unexpected disconnect (rc=%d).", rc)
        else:
            logger.info("MQTT disconnected gracefully.")

    # ── Publish methods ─────────────────────────────────────────────

    def _publish(self, topic_suffix: str, payload: dict) -> None:
        """Publish a JSON payload to ``{prefix}/{suffix}``."""
        if not self._client or not self._connected:
            logger.debug("MQTT not connected — skipping publish.")
            return

        topic = f"{self._topic_prefix}/{topic_suffix}"
        payload_str = json.dumps(payload, ensure_ascii=False, default=str)

        result = self._client.publish(topic, payload_str, qos=self._qos)
        if result.rc != mqtt.MQTT_ERR_SUCCESS:
            logger.warning(
                "MQTT publish failed (rc=%d) on topic=%s",
                result.rc,
                topic,
            )

    def publish_fisura(self, crack: CrackResult) -> None:
        """
        Publish a single crack detection result.

        Topic: ``argos/{device_id}/fisura``

        Args:
            crack: Detection result from the detector.
        """
        payload = crack.to_dict()
        payload["event"] = "fisura_detectada"
        payload["device_id"] = self._device_id
        payload["timestamp"] = time.time()
        self._publish("fisura", payload)

    def publish_batch(self, cracks: list[CrackResult]) -> None:
        """
        Publish all cracks in a single batch.

        Topic: ``argos/{device_id}/fisura`` (one message per crack)

        Args:
            cracks: List of detection results from one frame.
        """
        for crack in cracks:
            self.publish_fisura(crack)

    def publish_telemetry(
        self,
        fps: float,
        cpu_temp: Optional[float] = None,
        cpu_percent: Optional[float] = None,
        memory_percent: Optional[float] = None,
        cracks_count: int = 0,
    ) -> None:
        """
        Publish device health telemetry.

        Topic: ``argos/{device_id}/telemetry``

        Args:
            fps: Current processing frames-per-second.
            cpu_temp: CPU temperature (°C), if available.
            cpu_percent: CPU usage percentage.
            memory_percent: Memory usage percentage.
            cracks_count: Number of cracks detected in the last frame.
        """
        payload: dict[str, Any] = {
            "event": "telemetry",
            "device_id": self._device_id,
            "timestamp": time.time(),
            "fps": round(fps, 1),
            "cracks_count": cracks_count,
        }
        if cpu_temp is not None:
            payload["cpu_temp_c"] = round(cpu_temp, 1)
        if cpu_percent is not None:
            payload["cpu_percent"] = round(cpu_percent, 1)
        if memory_percent is not None:
            payload["memory_percent"] = round(memory_percent, 1)

        self._publish("telemetry", payload)

    def publish_snapshot(self, frame: np.ndarray, quality: int = 70) -> None:
        """
        Publish a JPEG-encoded frame as base64.

        Topic: ``argos/{device_id}/snapshot``

        This is **optional** and bandwidth-intensive. Use with caution
        on metered connections.

        Args:
            frame: BGR frame to publish.
            quality: JPEG quality (1–100, default 70).
        """
        _, buffer = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, quality])
        b64 = base64.b64encode(buffer).decode("ascii")

        payload = {
            "event": "snapshot",
            "device_id": self._device_id,
            "timestamp": time.time(),
            "image_jpg_base64": b64,
            "width": frame.shape[1],
            "height": frame.shape[0],
            "quality": quality,
        }
        self._publish("snapshot", payload)

    def publish_alert(
        self,
        crack: CrackResult,
        delta_percent: float,
        threshold: float,
    ) -> None:
        """
        Publish a growth alert when a crack exceeds the critical threshold.

        Topic: ``argos/{device_id}/fisura`` (with alert flag)

        Args:
            crack: The crack that triggered the alert.
            delta_percent: Growth percentage.
            threshold: Critical threshold that was exceeded.
        """
        payload = crack.to_dict()
        payload["event"] = "alerta_crecimiento"
        payload["device_id"] = self._device_id
        payload["timestamp"] = time.time()
        payload["delta_percent"] = round(delta_percent, 2)
        payload["threshold_percent"] = threshold
        payload["is_critical"] = delta_percent > threshold

        self._publish("fisura", payload)
        logger.warning(
            "Growth alert published for %s: Δ=%.1f%% (threshold=%.1f%%)",
            crack.roi_id,
            delta_percent,
            threshold,
        )

    def publish_velocity_alert(self, payload: dict) -> bool:
        """
        Publish a velocity-based alert from the alert engine.

        Topic: ``argos/{self._topic_prefix}/fisura``

        Args:
            payload: Alert payload dict from AlertEngine.

        Returns:
            True if published, False if not connected.
        """
        if not self._client or not self._connected:
            logger.debug("MQTT not connected — skipping velocity alert.")
            return False

        topic = f"{self._topic_prefix}/fisura"
        payload_str = json.dumps(payload, ensure_ascii=False, default=str)

        result = self._client.publish(topic, payload_str, qos=self._qos)
        if result.rc != mqtt.MQTT_ERR_SUCCESS:
            logger.warning(
                "MQTT velocity alert publish failed (rc=%d) on topic=%s",
                result.rc,
                topic,
            )
            return False

        logger.info(
            "Velocity alert published: alert_id=%s, category=%s, track_id=%d",
            payload.get("alert_id", "N/A"),
            payload.get("category", "N/A"),
            payload.get("track_id", -1),
        )
        return True

    def publish_prediction_alert(
        self,
        crack_id: int,
        prediction: TrendPredictionResult,
        trace_id: str = "",
    ) -> bool:
        """
        Publish a predictive trend alert for a single crack track.

        Topic: ``argos/{device_id}/prediction/{crack_id}``

        Payload includes:
        - ``track_id``, ``trend_direction``, ``slope``, ``r_squared``
        - ``ttt_days``, ``confidence``, ``trace_id``
        - Standard ``event``, ``device_id``, ``timestamp`` fields

        Args:
            crack_id: Crack track identifier.
            prediction: Trend prediction result to publish.
            trace_id: Optional trace identifier for request correlation.

        Returns:
            True if published successfully, False if not connected
            or publish failed.
        """
        if not self._client or not self._connected:
            logger.debug(
                "MQTT not connected — skipping prediction alert for track %d",
                crack_id,
            )
            return False

        topic = f"{self._topic_prefix}/prediction/{crack_id}"
        payload: dict[str, object] = {
            "event": "prediccion_tendencia",
            "device_id": self._device_id,
            "track_id": crack_id,
            "trace_id": trace_id,
            "trend_direction": prediction.trend_direction,
            "slope": prediction.slope,
            "r_squared": prediction.r_squared,
            "ttt_days": prediction.ttt_days,
            "confidence": prediction.confidence,
            "timestamp": time.time(),
        }
        payload_str = json.dumps(payload, ensure_ascii=False, default=str)

        result = self._client.publish(topic, payload_str, qos=self._qos)
        if result.rc != mqtt.MQTT_ERR_SUCCESS:
            logger.warning(
                "MQTT prediction alert publish failed (rc=%d) on topic=%s",
                result.rc,
                topic,
            )
            return False

        logger.info(
            "Prediction alert published: track_id=%d, direction=%s, TTT=%s",
            crack_id,
            prediction.trend_direction,
            f"{prediction.ttt_days:.1f}d" if prediction.ttt_days is not None else "N/A",
        )
        return True

    # ── 3D Alert (point cloud + cracks) ────────────────────────────

    def publish_alert_3d(
        self,
        point_cloud: np.ndarray,
        cracks: list,
        image_path: str,
        device_id: str,
        depth_map: Optional[np.ndarray] = None,
        intrinsics: Optional[dict] = None,
    ) -> None:
        """
        Publish a 3D point cloud alert with crack data.

        Topic: ``mineria/talud/alertas`` (from ``config.alert_topic``)

        The point cloud is a flat ``(N, 6)`` array where each row is
        ``[x, y, z, r, g, b]``. Points are capped at 5 000 to keep the
        MQTT payload under 256 KB.

        Args:
            point_cloud: ``(N, 6)`` float32 array of coloured 3D points.
            cracks: List of ``CrackResult`` or dicts with crack data.
            image_path: Filesystem path to the saved annotated frame.
            device_id: Edge device identifier.
            depth_map: Optional depth map in meters (H, W) for computing 3D crack positions.
            intrinsics: Optional dict with fx, fy, cx, cy for projecting cracks to 3D.

        QoS is 1 (at-least-once delivery). Broker offline is handled
        gracefully — a warning is logged and execution continues.
        """
        if not self._client or not self._connected:
            logger.warning("MQTT not connected — skipping 3D alert publish (connected=%s, client=%s).", self._connected, self._client is not None)
            return

        logger.info("Publishing 3D alert (%d points, %d cracks)...", point_cloud.shape[0] if isinstance(point_cloud, np.ndarray) and point_cloud.size > 0 else 0, len(cracks))

        # ── Serialise point cloud (FIX 4: subsample aleatorio, ≤5K pts) ──
        point_list: list[list[float]] = []
        point_count = 0
        if point_cloud is not None and isinstance(point_cloud, np.ndarray) and point_cloud.size > 0:
            max_points = min(len(point_cloud), config.pointcloud_max_points)
            if len(point_cloud) > max_points:
                idx = np.random.choice(len(point_cloud), max_points, replace=False)
                idx.sort()
                cloud_slice = point_cloud[idx]
            else:
                cloud_slice = point_cloud
            point_list = cloud_slice.tolist()
            point_count = len(point_list)

        # ── Serialise cracks ──────────────────────────────────────
        crack_data: list[dict] = []
        # Intrínsecos para proyección 2D→3D de fisuras
        fx = intrinsics.get("fx", 1408.0) if intrinsics else 1408.0
        fy = intrinsics.get("fy", 1408.0) if intrinsics else 1408.0
        cx = intrinsics.get("cx", 640.0) if intrinsics else 640.0
        cy = intrinsics.get("cy", 360.0) if intrinsics else 360.0

        for c in cracks:
            if hasattr(c, "to_dict"):
                d = c.to_dict()
            elif isinstance(c, dict):
                d = c
            else:
                continue

            cx2d = d.get("x", 0) + d.get("width", 0) / 2
            cy2d = d.get("y", 0) + d.get("height", 0) / 2

            # Profundidad en el centro de la fisura
            cz = 1.0  # fallback si no hay depth_map
            if depth_map is not None:
                iy, ix = int(cy2d), int(cx2d)
                if 0 <= iy < depth_map.shape[0] and 0 <= ix < depth_map.shape[1]:
                    dval = float(depth_map[iy, ix])
                    if dval > 0.1 and dval < 5.0:
                        cz = dval

            # Proyección 2D→3D (mismos intrínsecos que generator.py)
            x3d = (cx2d - cx) * cz / fx
            y3d = (cy2d - cy) * cz / fy
            z3d = cz

            crack_data.append({
                "x": d.get("x", 0),
                "y": d.get("y", 0),
                "w": d.get("width", 0),
                "h": d.get("height", 0),
                "x3d": round(x3d, 4),
                "y3d": round(y3d, 4),
                "z3d": round(z3d, 4),
                "classification": d.get("classification", "unknown"),
                "roi_id": d.get("roi_id", ""),
            })

        # ── Build payload ─────────────────────────────────────────
        payload: dict[str, Any] = {
            "device_id": device_id,
            "timestamp": time.strftime("%Y-%m-%dT%H:%M:%S"),
            "point_cloud": point_list,
            "cracks": crack_data,
            "image_path": image_path or "",
            "point_count": point_count,
        }

        try:
            topic = config.alert_topic
            payload_str = json.dumps(
                payload,
                ensure_ascii=False,
                separators=(",", ":"),
                default=str,
            )
            result = self._client.publish(topic, payload_str, qos=1)
            if result.rc != mqtt.MQTT_ERR_SUCCESS:
                logger.warning(
                    "MQTT 3D alert publish failed (rc=%d) on topic=%s",
                    result.rc,
                    topic,
                )
        except Exception:
            logger.warning("Failed to publish 3D alert — broker may be offline.", exc_info=True)

    # ── HD Capture notification ────────────────────────────────────

    def publish_hd_capture_complete(
        self,
        filename: str,
        point_count: int,
        vertex_count: int,
        face_count: int,
    ) -> None:
        """
        Publish that an HD capture has been completed and saved.

        Topic: ``mineria/talud/captura_completada`` (from config)

        Args:
            filename: Name of the .obj file (e.g. ``talud_hd_20260602_123456.obj``).
            point_count: Number of points in the original dense cloud.
            vertex_count: Number of vertices in the resulting mesh.
            face_count: Number of triangles in the resulting mesh.
        """
        if not self._client or not self._connected:
            logger.warning("MQTT not connected — skipping HD capture notification.")
            return

        payload = {
            "event": "captura_hd_completada",
            "device_id": self._device_id,
            "timestamp": time.strftime("%Y-%m-%dT%H:%M:%S"),
            "filename": filename,
            "point_count": point_count,
            "vertex_count": vertex_count,
            "face_count": face_count,
        }

        try:
            topic = config.hd_capture_complete_topic
            payload_str = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
            result = self._client.publish(topic, payload_str, qos=1)
            if result.rc != mqtt.MQTT_ERR_SUCCESS:
                logger.warning(
                    "MQTT HD capture notification failed (rc=%d) on topic=%s",
                    result.rc,
                    topic,
                )
            else:
                logger.info("HD capture notification published: %s", filename)
        except Exception:
            logger.exception("Failed to publish HD capture notification.")

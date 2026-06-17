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
import threading
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
        self._connected_event = threading.Event()
        # Optional callback invoked on MQTT connect (after setting _connected)
        # Signature: on_connect_handler(client) -> None
        # Used by main.py to set up subscriptions that must survive reconnects.
        self.on_connect_handler: Optional[callable] = None

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
            # Wait for the connection to establish (TLS takes 1-3s for cloud brokers)
            self._connected_event.clear()
            if not self._connected_event.wait(timeout=10):
                self._client.loop_stop()
                raise ConnectionError(
                    f"MQTT connection timeout at {self._broker}:{self._port} "
                    f"(TLS={'yes' if self._tls else 'no'})"
                )
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
            self._connected_event.set()
            logger.info("MQTT connected (rc=0).")
            # Invoke external handler for subscription setup (survives reconnects)
            if self.on_connect_handler is not None:
                try:
                    self.on_connect_handler(client)
                except Exception:
                    logger.exception("on_connect_handler failed — subscriptions may be incomplete.")
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

    # ── 3D Snapshot (mesh + texture + cracks) ───────────────────────

    def publish_from_builder(
        self,
        result: "SnapshotBuildResult",
        point_cloud: Optional[np.ndarray] = None,
        intrinsics: Optional[dict] = None,
    ) -> None:
        """
        Publish a Snapshot3D payload from a SnapshotBuildResult.

        This is the preferred method when using SnapshotBuilder.build().
        Mesh is only included when result.mode == '3d_valid'.

        Args:
            result: Output of SnapshotBuilder.build().
            point_cloud: Optional coloured point cloud (N, 6).
            intrinsics: Camera intrinsics dict (fx, fy, cx, cy, calibrated).
        """
        # Serialise projected cracks (already have x3d/y3d/z3d/surface_valid)
        crack_data: list[dict] = []
        for pc in result.cracks:
            entry: dict = {
                "roi_id": pc.roi_id,
                "x": pc.x,
                "y": pc.y,
                "w": pc.w,
                "h": pc.h,
                "classification": pc.classification,
                "surface_valid": pc.surface_valid,
            }
            if pc.length_mm is not None:
                entry["length_mm"] = pc.length_mm
            if pc.width_mm is not None:
                entry["width_mm"] = pc.width_mm
            if pc.surface_valid and pc.x3d is not None:
                entry["x3d"] = pc.x3d
                entry["y3d"] = pc.y3d
                entry["z3d"] = pc.z3d
            crack_data.append(entry)

        # Mesh — only when 3d_valid
        mesh_data: Optional[dict] = None
        if result.mode == "3d_valid" and result.mesh is not None:
            m = result.mesh
            mesh_data = {
                "vertices": m.vertices.astype(np.float32).ravel().tolist(),
                "indices": m.indices.astype(np.int32).ravel().tolist(),
                "uvs": m.uvs.astype(np.float32).ravel().tolist(),
                "centroid": m.centroid.astype(np.float32).tolist(),
                "scale": float(m.scale),
            }

        # Image texture (always when image_bgr available)
        image_base64: Optional[str] = None
        if result.image_bgr is not None and result.image_bgr.size > 0:
            texture_frame = result.image_bgr
            max_w = config.snapshot_texture_max_width
            if max_w > 0 and texture_frame.shape[1] > max_w:
                scale_f = max_w / texture_frame.shape[1]
                new_h = int(texture_frame.shape[0] * scale_f)
                texture_frame = cv2.resize(texture_frame, (max_w, new_h), interpolation=cv2.INTER_AREA)
            _, buf = cv2.imencode(
                ".jpg", texture_frame,
                [cv2.IMWRITE_JPEG_QUALITY, config.snapshot_jpeg_quality],
            )
            image_base64 = base64.b64encode(buf).decode("ascii")

        # Point cloud (optional, subsampled)
        point_list: list = []
        if point_cloud is not None and point_cloud.size > 0:
            max_pts = min(len(point_cloud), config.pointcloud_max_points)
            if len(point_cloud) > max_pts:
                idx = np.random.choice(len(point_cloud), max_pts, replace=False)
                point_list = point_cloud[idx].tolist()
            else:
                point_list = point_cloud.tolist()

        # Calibration
        calibration: Optional[dict] = None
        if intrinsics:
            calibration = {
                "calibrated": bool(intrinsics.get("calibrated", False)),
                "fx": intrinsics.get("fx"),
                "fy": intrinsics.get("fy"),
                "cx": intrinsics.get("cx"),
                "cy": intrinsics.get("cy"),
            }

        # Reconstruction metadata block
        rec = result.reconstruction
        reconstruction_block: dict = {
            "mode": rec.mode,
            "scene_valid": rec.scene_valid,
            "quality_score": round(rec.quality_score, 4),
        }
        if rec.reject_reason:
            reconstruction_block["reject_reason"] = rec.reject_reason
        if rec.message:
            reconstruction_block["message"] = rec.message

        payload: dict = {
            "device_id": config.device_id,
            "timestamp": time.strftime("%Y-%m-%dT%H:%M:%S"),
            "reconstruction": reconstruction_block,
            "cracks": crack_data,
            "point_count": len(point_list),
        }
        if mesh_data:
            payload["mesh"] = mesh_data
        if point_list:
            payload["point_cloud"] = point_list
        if image_base64:
            payload["image_base64"] = image_base64
        if calibration:
            payload["calibration"] = calibration

        if not self._client or not self._connected:
            logger.warning("MQTT not connected — skipping Snapshot3D publish.")
            return

        try:
            topic = config.alert_topic
            payload_str = json.dumps(payload, ensure_ascii=False, separators=(",", ":"), default=str)
            result_pub = self._client.publish(topic, payload_str, qos=1)
            if result_pub.rc != mqtt.MQTT_ERR_SUCCESS:
                logger.warning("MQTT Snapshot3D publish failed rc=%d", result_pub.rc)
            else:
                logger.info(
                    "Snapshot3D: mode=%s score=%.2f cracks=%d mesh=%s texture=%s",
                    rec.mode,
                    rec.quality_score,
                    len(crack_data),
                    f"{result.mesh.face_count}f" if result.mesh else "none",
                    "yes" if image_base64 else "no",
                )
        except Exception:
            logger.warning("Failed to publish Snapshot3D.", exc_info=True)

    def publish_snapshot_3d(
        self,
        *,
        cracks: list,
        device_id: str,
        depth_map: Optional[np.ndarray] = None,
        intrinsics: Optional[dict] = None,
        mesh_vertices: Optional[np.ndarray] = None,
        mesh_indices: Optional[np.ndarray] = None,
        mesh_uvs: Optional[np.ndarray] = None,
        mesh_centroid: Optional[np.ndarray] = None,
        mesh_scale: float = 1.0,
        point_cloud: Optional[np.ndarray] = None,
        image_bgr: Optional[np.ndarray] = None,
        image_path: str = "",
        reconstruction_mode: str = "3d_valid",
        quality_score: float = 1.0,
        reject_reason: str = "",
    ) -> None:
        """
        Publish a full Snapshot3D payload to ``mineria/talud/alertas``.

        Includes textured mesh, optional point cloud, crack 3D positions,
        camera calibration and a base64 JPEG of the captured frame.

        Args:
            cracks: List of ``CrackResult`` or dicts with crack data.
            device_id: Edge device identifier.
            depth_map: Depth map in metres (H, W) for 3D crack projection.
            intrinsics: Dict with fx, fy, cx, cy, calibrated.
            mesh_vertices: (N, 3) float32 vertex positions.
            mesh_indices: (M, 3) int32 triangle indices.
            mesh_uvs: (N, 2) float32 texture coordinates.
            point_cloud: Optional (N, 6) coloured point cloud.
            image_bgr: BGR frame to encode as texture (JPEG base64).
            image_path: Optional filesystem path to annotated frame.
        """
        if not self._client or not self._connected:
            logger.warning(
                "MQTT not connected — skipping 3D snapshot publish."
            )
            return

        # ── Serialise mesh ────────────────────────────────────────
        mesh_data: dict[str, list] | None = None
        if (
            mesh_vertices is not None
            and mesh_indices is not None
            and mesh_uvs is not None
            and mesh_vertices.size > 0
            and mesh_indices.size > 0
        ):
            mesh_data = {
                "vertices": mesh_vertices.astype(np.float32).ravel().tolist(),
                "indices": mesh_indices.astype(np.int32).ravel().tolist(),
                "uvs": mesh_uvs.astype(np.float32).ravel().tolist(),
            }
            if mesh_centroid is not None:
                mesh_data["centroid"] = mesh_centroid.astype(np.float32).tolist()
            if mesh_scale != 1.0:
                mesh_data["scale"] = mesh_scale

        # ── Serialise point cloud (optional, subsampled) ──────────
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

        # ── Encode frame as base64 JPEG texture ───────────────────
        image_base64: str | None = None
        if image_bgr is not None and image_bgr.size > 0:
            texture_frame = image_bgr
            max_w = config.snapshot_texture_max_width
            if max_w > 0 and texture_frame.shape[1] > max_w:
                scale = max_w / texture_frame.shape[1]
                new_h = int(texture_frame.shape[0] * scale)
                texture_frame = cv2.resize(
                    texture_frame,
                    (max_w, new_h),
                    interpolation=cv2.INTER_AREA,
                )
            _, buffer = cv2.imencode(
                ".jpg",
                texture_frame,
                [cv2.IMWRITE_JPEG_QUALITY, config.snapshot_jpeg_quality],
            )
            image_base64 = base64.b64encode(buffer).decode("ascii")

        # ── Serialise cracks with 3D projection ───────────────────
        crack_data = self._serialize_cracks_3d(
            cracks, depth_map, intrinsics, mesh_centroid, mesh_scale,
        )

        # ── Calibration block ─────────────────────────────────────
        calibration: dict[str, object] | None = None
        if intrinsics:
            calibration = {
                "calibrated": bool(intrinsics.get("calibrated", False)),
                "fx": intrinsics.get("fx"),
                "fy": intrinsics.get("fy"),
                "cx": intrinsics.get("cx"),
                "cy": intrinsics.get("cy"),
            }
            if intrinsics.get("pixels_per_mm"):
                calibration["pixels_per_mm"] = intrinsics["pixels_per_mm"]

        # ── Build Snapshot3D payload ──────────────────────────────
        reconstruction_block: dict = {
            "mode": reconstruction_mode,
            "scene_valid": reconstruction_mode == "3d_valid",
            "quality_score": round(quality_score, 4),
        }
        if reject_reason:
            reconstruction_block["reject_reason"] = reject_reason

        payload: dict[str, Any] = {
            "device_id": device_id,
            "timestamp": time.strftime("%Y-%m-%dT%H:%M:%S"),
            "reconstruction": reconstruction_block,
            "cracks": crack_data,
            "image_path": image_path or "",
            "point_count": point_count,
        }
        if mesh_data:
            payload["mesh"] = mesh_data
        if point_list:
            payload["point_cloud"] = point_list
        if image_base64:
            payload["image_base64"] = image_base64
        if calibration:
            payload["calibration"] = calibration

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
                    "MQTT 3D snapshot publish failed (rc=%d) on topic=%s",
                    result.rc,
                    topic,
                )
            else:
                mesh_faces = len(mesh_indices) if mesh_indices is not None else 0
                logger.info(
                    "Snapshot3D published: mesh=%d faces, %d pts, %d cracks, texture=%s",
                    mesh_faces,
                    point_count,
                    len(crack_data),
                    "yes" if image_base64 else "no",
                )
        except Exception:
            logger.warning(
                "Failed to publish Snapshot3D — broker may be offline.",
                exc_info=True,
            )

    def _serialize_cracks_3d(
        self,
        cracks: list,
        depth_map: Optional[np.ndarray],
        intrinsics: Optional[dict],
        mesh_centroid: Optional[np.ndarray] = None,
        mesh_scale: float = 1.0,
    ) -> list[dict]:
        """Project crack bounding boxes to 3D camera space."""
        crack_data: list[dict] = []
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

            x = d.get("x", 0)
            y = d.get("y", 0)
            w = d.get("width", d.get("w", 0))
            h = d.get("height", d.get("h", 0))
            cx2d = x + w / 2
            cy2d = y + h / 2

            cz = 1.0
            if depth_map is not None:
                iy, ix = int(cy2d), int(cx2d)
                if 0 <= iy < depth_map.shape[0] and 0 <= ix < depth_map.shape[1]:
                    dval = float(depth_map[iy, ix])
                    if 0.1 < dval < 5.0:
                        cz = dval

            x3d = (cx2d - cx) * cz / fx
            y3d = (cy2d - cy) * cz / fy
            z3d = cz

            # Apply same centre+scale as mesh so cracks align on surface
            if mesh_centroid is not None:
                x3d = (x3d - float(mesh_centroid[0])) * mesh_scale
                y3d = (y3d - float(mesh_centroid[1])) * mesh_scale
                z3d = (z3d - float(mesh_centroid[2])) * mesh_scale

            crack_data.append({
                "roi_id": d.get("roi_id", ""),
                "x": x,
                "y": y,
                "w": w,
                "h": h,
                "x3d": round(x3d, 4),
                "y3d": round(y3d, 4),
                "z3d": round(z3d, 4),
                "classification": d.get("classification", "unknown"),
                "length_mm": d.get("length_mm"),
                "width_mm": d.get("width_mm"),
            })

        return crack_data

    def publish_alert_3d(
        self,
        point_cloud: np.ndarray,
        cracks: list,
        image_path: str,
        device_id: str,
        depth_map: Optional[np.ndarray] = None,
        intrinsics: Optional[dict] = None,
        mesh_vertices: Optional[np.ndarray] = None,
        mesh_indices: Optional[np.ndarray] = None,
        mesh_uvs: Optional[np.ndarray] = None,
        mesh_centroid: Optional[np.ndarray] = None,
        mesh_scale: float = 1.0,
        image_bgr: Optional[np.ndarray] = None,
    ) -> None:
        """
        Publish a 3D alert (legacy alias → ``publish_snapshot_3d``).

        Kept for backward compatibility; delegates to ``publish_snapshot_3d``.
        """
        self.publish_snapshot_3d(
            cracks=cracks,
            device_id=device_id,
            depth_map=depth_map,
            intrinsics=intrinsics,
            mesh_vertices=mesh_vertices,
            mesh_indices=mesh_indices,
            mesh_uvs=mesh_uvs,
            mesh_centroid=mesh_centroid,
            mesh_scale=mesh_scale,
            point_cloud=point_cloud,
            image_bgr=image_bgr,
            image_path=image_path,
        )

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

#!/usr/bin/env python3
"""
ARGOS SLOPE 4.0 — Edge Processing Main Loop (Raspberry Pi / Laptop).

Orchestrates:
  1. Camera capture (USB camera, PiCamera, or video file)
  2. Crack detection via OpenCV or ONNX model
  3. MQTT publish of telemetry and fissure data
  4. Shared frame buffer for WebRTC live streaming
  5. Optional debug frame saving

Designed for 24/7 operation: graceful error recovery, configurable FPS,
and health telemetry reporting.

Usage:
    # Default (OpenCV detection, WebRTC, local MQTT broker)
    python -m edge.main

    # Without WebRTC
    EDGE_WEBRTC_ENABLED=false python -m edge.main

    # With ONNX model and custom broker
    DETECTOR_METHOD=onnx MODEL_PATH=model.onnx MQTT_BROKER=10.0.0.5 python -m edge.main
"""

from __future__ import annotations

import logging
import os
import sys
import time
import threading
from pathlib import Path
from typing import Optional

import cv2
import numpy as np

from edge.config import config
from edge.detector.fisura_detector import CrackResult, create_detector
from edge.mqtt.publisher import MqttPublisher
from edge.webrtc.shared_frame import shared_frame

# 3D pipeline modules (optional — controlled by config flags)
if config.depth_enabled:
    from edge.depth.midas_depth import MidasDepthEstimator
if config.pointcloud_enabled:
    from edge.pointcloud.generator import PointCloudGenerator
if config.simulator_enabled:
    from edge.simulator.crack_simulator import CrackSimulator
if config.hd_capture_enabled:
    from edge.capture_hd.manager import HdCaptureManager

# ── Logging setup ────────────────────────────────────────────────────

logging.basicConfig(
    level=getattr(logging, config.log_level.upper(), logging.INFO),
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
    stream=sys.stdout,
)
logger = logging.getLogger("edge.main")


# ── Camera helpers ───────────────────────────────────────────────────


def open_camera(source: str) -> cv2.VideoCapture:
    """
    Open a camera source and return a VideoCapture.

    Args:
        source: ``"0"``, ``"1"`` for USB cameras, or a file path for videos.

    Returns:
        Configured VideoCapture.

    Raises:
        RuntimeError: If the camera/video cannot be opened.
    """
    if source.isdigit():
        # Windows → DirectShow, Linux → V4L2, macOS → AVFOUNDATION
        backend = cv2.CAP_DSHOW if os.name == "nt" else cv2.CAP_V4L2
        cap = cv2.VideoCapture(int(source), backend)
    else:
        path = Path(source)
        if not path.exists():
            raise FileNotFoundError(f"Video file not found: {source}")
        cap = cv2.VideoCapture(str(path))

    if not cap.isOpened():
        raise RuntimeError(f"Cannot open camera source: {source}")

    # Set resolution
    cap.set(cv2.CAP_PROP_FRAME_WIDTH, config.frame_width)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, config.frame_height)
    cap.set(cv2.CAP_PROP_FPS, config.fps)

    actual_w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    actual_h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    actual_fps = cap.get(cv2.CAP_PROP_FPS)

    logger.info(
        "Camera opened: source=%s, resolution=%dx%d, FPS=%.1f",
        source,
        actual_w,
        actual_h,
        actual_fps,
    )

    return cap


def apply_roi(frame: np.ndarray, roi_str: str) -> np.ndarray:
    """
    Crop frame to a region of interest defined by config.

    ROI format: ``"x,y,w,h"`` in pixels.
    Empty string returns the full frame.

    Returns:
        Cropped frame (or full frame if no ROI configured).
    """
    if not roi_str:
        return frame

    try:
        parts = [int(p.strip()) for p in roi_str.split(",")]
        if len(parts) != 4:
            raise ValueError
        x, y, w, h = parts
        if x < 0 or y < 0 or x + w > frame.shape[1] or y + h > frame.shape[0]:
            logger.warning("ROI out of bounds — using full frame.")
            return frame
        return frame[y : y + h, x : x + w]
    except (ValueError, IndexError):
        logger.warning("Invalid ROI format '%s' — expected 'x,y,w,h'.", roi_str)
        return frame


def read_cpu_temperature() -> Optional[float]:
    """Read Raspberry Pi CPU temperature. Returns ``None`` on non-RPi systems."""
    try:
        with open("/sys/class/thermal/thermal_zone0/temp") as f:
            return float(f.read().strip()) / 1000.0
    except (FileNotFoundError, PermissionError, ValueError):
        return None


# ── Debug frame saving ───────────────────────────────────────────────


def save_debug_frame(
    frame: np.ndarray,
    cracks: list[CrackResult],
    frame_count: int,
) -> None:
    """
    Save annotated frame for debugging.

    Bounding boxes and ROI IDs are drawn on the frame before saving.
    """
    output_dir = Path(config.debug_output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    annotated = frame.copy()
    for crack in cracks:
        cv2.rectangle(
            annotated,
            (crack.x, crack.y),
            (crack.x + crack.width, crack.y + crack.height),
            color=(0, 212, 170),  # teal
            thickness=2,
        )
        label = f"{crack.roi_id} ({crack.classification.value})"
        cv2.putText(
            annotated,
            label,
            (crack.x, crack.y - 8),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.5,
            (0, 212, 170),
            1,
        )

    path = output_dir / f"frame_{frame_count:06d}.jpg"
    cv2.imwrite(str(path), annotated)


# ── Background servers ────────────────────────────────────────────────


def _run_webrtc_in_thread() -> None:
    """Arranca el servidor de señalización WebRTC en un thread con su propio event loop."""
    import asyncio
    from edge.webrtc.signaling_server import run_signaling_server

    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        loop.run_until_complete(run_signaling_server(
            host="0.0.0.0",
            port=config.webrtc_port,
        ))
        loop.run_forever()
    except Exception:
        logger.exception("WebRTC server thread crashed.")
    finally:
        loop.close()


def _run_mjpeg_in_thread() -> None:
    """Arranca el servidor MJPEG (alternativa simple a WebRTC) en un thread."""
    import asyncio
    from edge.webrtc.mjpeg_server import run_mjpeg_server

    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        loop.run_until_complete(run_mjpeg_server(
            host="0.0.0.0",
            port=8082,
        ))
        loop.run_forever()
    except Exception:
        logger.exception("MJPEG server thread crashed.")
    finally:
        loop.close()


# ── Main loop ────────────────────────────────────────────────────────


def main() -> None:
    """Edge device main loop."""
    logger.info("═" * 60)
    logger.info("ARGOS SLOPE 4.0 — Edge Processing")
    logger.info("Device: %s | Detector: %s | Broker: %s:%d", 
                 config.device_id, config.detector_method, 
                 config.mqtt_broker, config.mqtt_port)
    logger.info("═" * 60)

    # ── 0. Start background servers (WebRTC + MJPEG) ─────────────────
    webrtc_thread: Optional[threading.Thread] = None
    if config.webrtc_enabled:
        webrtc_thread = threading.Thread(
            target=_run_webrtc_in_thread,
            daemon=True,
            name="webrtc-signaling",
        )
        webrtc_thread.start()
        logger.info("WebRTC signaling server started in background thread.")

        # MJPEG stream server (mas simple, funciona siempre)
        mjpeg_thread = threading.Thread(
            target=_run_mjpeg_in_thread,
            daemon=True,
            name="mjpeg-stream",
        )
        mjpeg_thread.start()
        logger.info("MJPEG stream server started on http://localhost:8082/stream")
    else:
        logger.info("WebRTC/MJPEG disabled via EDGE_WEBRTC_ENABLED=false")

    # ── 1. Initialize detector ──────────────────────────────────────
    detector = create_detector()
    logger.info("Detector initialized: %s", type(detector).__name__)

    # ── 1b. Initialize 3D pipeline (depth + point cloud + simulator) ─
    depth_estimator = None
    pointcloud_gen = None
    crack_simulator = None

    if config.depth_enabled:
        depth_estimator = MidasDepthEstimator()
        logger.info("Depth estimator initialized: %s", type(depth_estimator).__name__)

    if config.pointcloud_enabled:
        pointcloud_gen = PointCloudGenerator()
        logger.info("Point cloud generator initialized.")

    if config.simulator_enabled:
        crack_simulator = CrackSimulator()
        logger.info("Crack simulator initialized.")

    # ── 2. Open camera ──────────────────────────────────────────────
    cap = open_camera(config.camera_source)

    # ── 3. MQTT publisher ───────────────────────────────────────────
    publisher = MqttPublisher()
    try:
        publisher.connect()
    except (ConnectionError, ImportError) as exc:
        logger.warning("MQTT unavailable — continuing without publishing: %s", exc)

    # ── 3b. HD Capture Manager ──────────────────────────────────────
    hd_capture = None
    latest_rgb_pc: Optional[np.ndarray] = None
    latest_depth_map: Optional[np.ndarray] = None

    def _on_hd_capture_complete(filename: str) -> None:
        """Callback invocado cuando el meshing HD termina."""
        logger.info("HD capture callback: %s", filename)
        if publisher.connected:
            publisher.publish_hd_capture_complete(
                filename=filename,
                point_count=len(latest_point_cloud) if latest_point_cloud is not None else 0,
                vertex_count=0,
                face_count=0,
            )

    if config.hd_capture_enabled:
        hd_capture = HdCaptureManager(on_complete=_on_hd_capture_complete)
        logger.info("HD Capture manager initialized.")

        # Suscribirse al topic de captura si MQTT está conectado
        if publisher.connected and publisher._client is not None:
            def _on_capture_msg(client, userdata, msg) -> None:  # type: ignore[no-untyped-def]
                logger.info("Señal de captura HD recibida en topic=%s", msg.topic)
                if hd_capture and not hd_capture.is_busy:
                    if latest_rgb_pc is not None and latest_depth_map is not None:
                        hd_capture.freeze(latest_rgb_pc, latest_depth_map, frame_count)
                        hd_capture.process()
                    else:
                        logger.warning("No hay datos de profundidad disponibles para captura HD.")
                else:
                    logger.warning("HD capture ignorada — busy=%s", hd_capture.is_busy if hd_capture else "N/A")

            publisher._client.message_callback_add(
                config.hd_capture_trigger_topic, _on_capture_msg
            )
            logger.info("Suscrito a topic de captura HD: %s", config.hd_capture_trigger_topic)
        else:
            logger.warning("MQTT no disponible — captura HD no puede recibir señales.")

    # ── 4. Processing loop ──────────────────────────────────────────
    frame_count = 0
    last_telemetry = 0.0
    last_second = 0.0
    fps_counter = 0
    current_fps = 0.0

    # 3D pipeline state
    latest_point_cloud = None
    latest_depth_frame_num = 0
    depth_frame_interval = max(1, int(config.fps / max(1, config.depth_fps))) if config.depth_enabled else 0

    try:
        while True:
            loop_start = time.perf_counter()

            # ── Read frame ──────────────────────────────────────────
            ret, frame = cap.read()
            if not ret:
                logger.warning("End of video stream or read error — reconnecting...")
                time.sleep(1.0)
                cap.release()
                cap = open_camera(config.camera_source)
                continue

            frame_count += 1

            # ── Apply ROI ───────────────────────────────────────────
            roi_frame = apply_roi(frame, config.roi)

            # ── Detect cracks ───────────────────────────────────────
            cracks = detector.process(roi_frame)

            # ── 3D Pipeline (Depth + Point Cloud) ───────────────────
            # Depth estimation is throttled to depth_fps to save CPU.
            if depth_estimator is not None and depth_frame_interval > 0:
                if frame_count - latest_depth_frame_num >= depth_frame_interval:
                    depth_map = depth_estimator.estimate(roi_frame)
                    if depth_map is not None:
                        latest_depth_frame_num = frame_count
                        if pointcloud_gen is not None:
                            rgb_for_pc = cv2.cvtColor(roi_frame, cv2.COLOR_BGR2RGB)
                            pc_result = pointcloud_gen.generate(
                                rgb_for_pc, depth_map, frame_count,
                            )
                            latest_point_cloud = pc_result.points if pc_result.points.size > 0 else None

                        # Guardar para captura HD (RGB + depth a resolución completa)
                        latest_rgb_pc = rgb_for_pc
                        latest_depth_map = depth_map
                    else:
                        # Depth returned None — skip point cloud generation
                        latest_point_cloud = None

            # ── Simulator (crack events at random intervals) ─────────
            sim_event = None
            if crack_simulator is not None:
                sim_event = crack_simulator.update(frame_count, roi_frame)

            # ── Publish 3D alert if data is available ───────────────
            # Usa fisuras reales (detector) o simuladas
            cracks_for_3d = cracks if cracks else (sim_event.cracks if sim_event else [])
            image_path_3d = sim_event.image_path if sim_event else ""
            has_pc = latest_point_cloud is not None
            if publisher.connected and (has_pc or cracks_for_3d):
                pc_for_publish = latest_point_cloud if has_pc else np.empty((0, 6), dtype=np.float32)
                intrinsics = {"fx": 1408.0, "fy": 1408.0, "cx": 640.0, "cy": 360.0}
                publisher.publish_alert_3d(
                    point_cloud=pc_for_publish,
                    cracks=cracks_for_3d,
                    image_path=image_path_3d,
                    device_id=config.device_id,
                    depth_map=latest_depth_map,
                    intrinsics=intrinsics,
                )

            # ── Publish via MQTT ────────────────────────────────────
            if cracks and publisher.connected:
                publisher.publish_batch(cracks)

            # ── Feed shared frame for WebRTC ────────────────────────
            # Se envía el roi_frame (con bounding boxes ya calculados)
            # para que el video en vivo muestre exactamente lo que analiza el detector.
            if config.webrtc_enabled:
                shared_frame.write(roi_frame, cracks)

            # ── Debug saving ────────────────────────────────────────
            if config.debug_save_frames and frame_count % 30 == 0:
                save_debug_frame(roi_frame, cracks, frame_count)

            # ── Telemetry (every telemetry_interval_s) ──────────────
            now = time.time()
            if now - last_telemetry >= config.telemetry_interval_s:
                cpu_temp = read_cpu_temperature()
                publisher.publish_telemetry(
                    fps=current_fps,
                    cpu_temp=cpu_temp,
                    cracks_count=len(cracks),
                )
                last_telemetry = now

                logger.info(
                    "Frame %d | FPS: %.1f | Cracks: %d | Temp: %s | WebRTC peers: %s",
                    frame_count,
                    current_fps,
                    len(cracks),
                    f"{cpu_temp:.1f}°C" if cpu_temp else "N/A",
                    "active" if config.webrtc_enabled else "off",
                )

            # ── FPS calculation ─────────────────────────────────────
            fps_counter += 1
            if now - last_second >= 1.0:
                current_fps = fps_counter / (now - last_second)
                fps_counter = 0
                last_second = now

            # ── Frame rate control ──────────────────────────────────
            elapsed = time.perf_counter() - loop_start
            min_period = 1.0 / config.fps
            if elapsed < min_period:
                time.sleep(min_period - elapsed)

    except KeyboardInterrupt:
        logger.info("Shutdown requested by user.")

    finally:
        cap.release()
        publisher.disconnect()
        logger.info("Edge processing stopped. Total frames: %d", frame_count)


if __name__ == "__main__":
    main()

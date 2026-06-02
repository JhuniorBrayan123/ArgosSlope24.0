"""
ARGOS SLOPE 4.0 — Edge device configuration.

All values can be overridden via environment variables for deployment
flexibility across development (laptop) and production (Raspberry Pi).
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path


@dataclass
class EdgeConfig:
    """
    Central configuration for the edge processing pipeline.

    Attributes are grouped by domain: camera, detector, MQTT, and system.
    Each attribute documents its env-var override.
    """

    # ── Camera ──────────────────────────────────────────────────────
    # Source: 0 = USB camera, 0 = PiCamera, or path to video file
    camera_source: str = field(
        default_factory=lambda: os.getenv("CAMERA_SOURCE", "0")
    )
    # Frame width in pixels
    frame_width: int = int(os.getenv("FRAME_WIDTH", "1280"))
    # Frame height in pixels
    frame_height: int = int(os.getenv("FRAME_HEIGHT", "720"))
    # Frames per second capture rate
    fps: int = int(os.getenv("FPS", "15"))
    # ROI (x, y, w, h) — region of interest within the frame.
    # If empty, the full frame is processed.
    roi: str = os.getenv("ROI", "")

    # ── Detector ────────────────────────────────────────────────────
    # Detection method: "opencv" | "onnx" | "tflite"
    detector_method: str = os.getenv("DETECTOR_METHOD", "opencv")
    # Path to model file (onnx / tflite) — empty when using opencv
    model_path: str = os.getenv("MODEL_PATH", "")
    # Confidence threshold (0–1) for ML-based detectors
    confidence_threshold: float = float(
        os.getenv("CONFIDENCE_THRESHOLD", "0.5")
    )
    # Adaptive threshold block size (odd number)
    # Larger block = less sensitive to local texture (use ≥31 for indoor/wallpaper)
    adaptive_block: int = int(os.getenv("ADAPTIVE_BLOCK", "31"))
    # Adaptive threshold C constant
    # Higher C = only very dark regions threshold (use ≥5 to kill texture noise)
    adaptive_c: int = int(os.getenv("ADAPTIVE_C", "5"))
    # Gaussian blur kernel size (odd number)
    blur_ksize: int = int(os.getenv("BLUR_KSIZE", "5"))
    # Morphological kernel size
    morph_ksize: int = int(os.getenv("MORPH_KSIZE", "3"))
    # Minimum contour area in pixels to consider a crack
    # Increase to 2000+ when in indoor/demo environments to suppress wallpaper texture
    min_contour_area_px: int = int(os.getenv("MIN_CONTOUR_AREA", "2000"))

    # ── Camera parameters (mm) ──────────────────────────────────────
    # Focal length in mm (used for pixel-to-mm conversion)
    focal_length_mm: float = float(os.getenv("FOCAL_LENGTH_MM", "50.0"))
    # Distance from camera to slope face in meters
    sensor_distance_m: float = float(
        os.getenv("SENSOR_DISTANCE_M", "10.0")
    )
    # Sensor pixel pitch in µm (used for pixel-to-mm)
    sensor_pixel_um: float = float(os.getenv("SENSOR_PIXEL_UM", "3.0"))

    # ── 3D Pipeline (Depth + Point Cloud) ───────────────────────────
    # Enable depth estimation (MiDaS)
    depth_enabled: bool = (
        os.getenv("DEPTH_ENABLED", "true").lower() == "true"
    )
    # MiDaS model variant: "MiDaS_small" (fast) or "DPT_Large" (accurate)
    depth_model: str = os.getenv("DEPTH_MODEL", "MiDaS_small")
    # Target FPS for depth estimation (frame-skip throttling)
    depth_fps: int = int(os.getenv("DEPTH_FPS", "5"))
    # Enable point cloud generation
    pointcloud_enabled: bool = (
        os.getenv("POINTCLOUD_ENABLED", "true").lower() == "true"
    )
    # Sample every Nth pixel when generating point cloud
    pointcloud_sample: int = int(os.getenv("POINTCLOUD_SAMPLE", "2"))
    # Maximum number of points in the output cloud
    pointcloud_max_points: int = int(os.getenv("POINTCLOUD_MAX_POINTS", "10000"))
    # Enable crack simulator (for dev/demo without live camera)
    simulator_enabled: bool = (
        os.getenv("SIMULATOR_ENABLED", "false").lower() == "true"
    )
    # Crack simulator interval range (seconds)
    simulator_interval_min: int = int(os.getenv("SIMULATOR_INTERVAL_MIN", "30"))
    simulator_interval_max: int = int(os.getenv("SIMULATOR_INTERVAL_MAX", "90"))
    # MQTT topic for 3D alert data
    alert_topic: str = os.getenv("ALERT_TOPIC", "mineria/talud/alertas")
    # Directory for historical crack frame captures
    capturas_dir: str = os.getenv("CAPTURAS_DIR", "capturas_historicas")

    # ── HD Capture ──────────────────────────────────────────────────
    # Enable HD capture (Open3D meshing on demand)
    hd_capture_enabled: bool = (
        os.getenv("HD_CAPTURE_ENABLED", "true").lower() == "true"
    )
    # Directory for HD capture .obj files
    hd_capture_dir: str = os.getenv("HD_CAPTURE_DIR", "capturas_hd")
    # MQTT topic to listen for capture trigger signals
    hd_capture_trigger_topic: str = os.getenv(
        "HD_CAPTURE_TRIGGER_TOPIC", "mineria/talud/capturar_hd"
    )
    # MQTT topic to notify when HD capture is complete
    hd_capture_complete_topic: str = os.getenv(
        "HD_CAPTURE_COMPLETE_TOPIC", "mineria/talud/captura_completada"
    )

    # ── Camera intrinsics (for 3D reconstruction) ────────────────────
    # Camera field of view in degrees (used for point cloud projection)
    fov_degrees: float = float(os.getenv("FOV_DEGREES", "70.0"))
    # Camera sensor width in mm (used for focal length in pixels)
    sensor_width_mm: float = float(os.getenv("SENSOR_WIDTH_MM", "6.4"))

    # ── MQTT ────────────────────────────────────────────────────────
    mqtt_broker: str = os.getenv("MQTT_BROKER", "localhost")
    mqtt_port: int = int(os.getenv("MQTT_PORT", "1883"))
    mqtt_username: str = os.getenv("MQTT_USERNAME", "")
    mqtt_password: str = os.getenv("MQTT_PASSWORD", "")
    mqtt_tls_enabled: bool = os.getenv("MQTT_TLS", "false").lower() == "true"
    # Base topic: argos/{device_id}/
    mqtt_topic_prefix: str = os.getenv(
        "MQTT_TOPIC_PREFIX", "argos/slope-01"
    )
    # MQTT QoS level (0, 1, or 2)
    mqtt_qos: int = int(os.getenv("MQTT_QOS", "1"))
    # Interval in seconds between telemetry publishes
    telemetry_interval_s: int = int(os.getenv("TELEMETRY_INTERVAL", "5"))

    # ── System ──────────────────────────────────────────────────────
    # Device identifier (hostname or custom ID)
    device_id: str = os.getenv(
        "DEVICE_ID",
        Path("/etc/hostname").read_text().strip()
        if Path("/etc/hostname").exists()
        else "argos-edge-01",
    )
    # Enable frame saving for debugging
    debug_save_frames: bool = (
        os.getenv("DEBUG_SAVE_FRAMES", "false").lower() == "true"
    )
    # Directory to save debug frames
    debug_output_dir: str = os.getenv("DEBUG_OUTPUT_DIR", "debug_output")
    # Logging level
    log_level: str = os.getenv("LOG_LEVEL", "INFO")

    # ── WebRTC ──────────────────────────────────────────────────────
    # Enable WebRTC video streaming
    webrtc_enabled: bool = (
        os.getenv("EDGE_WEBRTC_ENABLED", "true").lower() == "true"
    )
    # WebRTC signaling server port
    webrtc_port: int = int(os.getenv("EDGE_WEBRTC_PORT", "8081"))
    # WebRTC stream FPS (may differ from detection FPS)
    webrtc_fps: int = int(os.getenv("EDGE_WEBRTC_FPS", "15"))
    # WebRTC stream frame width
    webrtc_frame_width: int = int(os.getenv("EDGE_WEBRTC_FRAME_WIDTH", "640"))
    # WebRTC stream frame height
    webrtc_frame_height: int = int(os.getenv("EDGE_WEBRTC_FRAME_HEIGHT", "480"))


# ── Singleton ──────────────────────────────────────────────────────
config = EdgeConfig()

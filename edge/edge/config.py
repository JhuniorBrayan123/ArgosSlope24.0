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

    # ── Camera parameters (mm) [DEPRECATED for measurement — fallback only] ──
    # Focal length in mm (DEPRECATED: used only as fallback when no calibration available)
    focal_length_mm: float = float(os.getenv("FOCAL_LENGTH_MM", "50.0"))
    # Distance from camera to slope face in meters (DEPRECATED: fallback only)
    sensor_distance_m: float = float(
        os.getenv("SENSOR_DISTANCE_M", "10.0")
    )
    # Sensor pixel pitch in µm (DEPRECATED: fallback only)
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

    # ── Preprocessing ──────────────────────────────────────────────
    # Enable preprocessing pipeline
    preprocessing_enabled: bool = (
        os.getenv("PREPROCESSING_ENABLED", "true").lower() == "true"
    )
    # Preprocessing steps (JSON list): e.g. '["undistort", "clahe"]'
    preprocessing_steps: str = os.getenv(
        "PREPROCESSING_STEPS", '["undistort","clahe"]'
    )
    # CLAHE clip limit (higher = more contrast)
    clahe_clip_limit: float = float(os.getenv("CLAHE_CLIP_LIMIT", "2.0"))
    # CLAHE tile grid size (tile × tile)
    clahe_tile_grid_size: int = int(os.getenv("CLAHE_TILE_GRID_SIZE", "8"))

    # ── Geometric Filters ──────────────────────────────────────────
    # Enable geometric filter pipeline
    geometric_filtering_enabled: bool = (
        os.getenv("GEOMETRIC_FILTERING_ENABLED", "false").lower() == "true"
    )
    # Minimum aspect ratio (width/height) to consider a crack-like contour
    filter_min_aspect_ratio: float = float(
        os.getenv("FILTER_MIN_ASPECT_RATIO", "0.1")
    )
    # Maximum aspect ratio
    filter_max_aspect_ratio: float = float(
        os.getenv("FILTER_MAX_ASPECT_RATIO", "10.0")
    )
    # Minimum solidity (area / convex hull area) — cracks tend to be irregular (low solidity)
    filter_min_solidity: float = float(os.getenv("FILTER_MIN_SOLIDITY", "0.2"))
    # Minimum convexity (perimeter of convex hull / perimeter of contour)
    filter_min_convexity: float = float(
        os.getenv("FILTER_MIN_CONVEXITY", "0.5")
    )
    # Minimum crack length in mm (requires calibration)
    filter_min_length_mm: float = float(
        os.getenv("FILTER_MIN_LENGTH_MM", "10.0")
    )
    # Minimum crack width in mm (requires calibration)
    filter_min_width_mm: float = float(os.getenv("FILTER_MIN_WIDTH_MM", "0.1"))
    # Maximum crack width in mm — rejects oversized contours (rock edges)
    filter_max_width_mm: float = float(os.getenv("FILTER_MAX_WIDTH_MM", "50.0"))
    # Fallback min length in px (when calibration not available)
    filter_min_length_px: int = int(os.getenv("FILTER_MIN_LENGTH_PX", "30"))
    # Fallback min width in px
    filter_min_width_px: int = int(os.getenv("FILTER_MIN_WIDTH_PX", "3"))

    # ── Temporal Analysis (Sprint 4) ────────────────────────────────
    # Enable temporal comparison pipeline (registration + tracking + velocity)
    temporal_enabled: bool = (
        os.getenv("TEMPORAL_ENABLED", "true").lower() == "true"
    )
    # Path to the reference frame for image registration.
    # If empty, the first processed frame is used as reference.
    temporal_reference_path: str = os.getenv(
        "TEMPORAL_REFERENCE_PATH", ""
    )
    # Minimum ORB feature matches for RANSAC homography
    temporal_min_matches: int = int(
        os.getenv("TEMPORAL_MIN_MATCHES", "10")
    )
    # ORB features to detect per frame
    temporal_orb_features: int = int(
        os.getenv("TEMPORAL_ORB_FEATURES", "2000")
    )
    # IoU threshold for crack track matching (0.0–1.0)
    temporal_iou_threshold: float = float(
        os.getenv("TEMPORAL_IOU_THRESHOLD", "0.3")
    )
    # Max frames a track can be unseen before removal
    temporal_max_missed_frames: int = int(
        os.getenv("TEMPORAL_MAX_MISSED_FRAMES", "30")
    )
    # Min days between measurements to compute velocity
    temporal_min_days: float = float(
        os.getenv("TEMPORAL_MIN_DAYS", "2.0")
    )
    # EMA alpha for velocity smoothing (0.0–1.0)
    temporal_ema_alpha: float = float(
        os.getenv("TEMPORAL_EMA_ALPHA", "0.3")
    )
    # Path for crack history persistence file
    temporal_history_path: str = os.getenv(
        "TEMPORAL_HISTORY_PATH", "crack_history.json"
    )
    # Interval in frames between temporal pipeline runs
    # (registration + tracking are expensive; run every N frames)
    temporal_interval_frames: int = int(
        os.getenv("TEMPORAL_INTERVAL_FRAMES", "10")
    )

    # ── Prediction (Sprint 7) ───────────────────────────────────────
    # Enable trend prediction pipeline
    prediction_enabled: bool = (
        os.getenv("PREDICTION_ENABLED", "true").lower() == "true"
    )
    # Maximum look-ahead days for Time-To-Threshold
    prediction_horizon_days: int = int(
        os.getenv("PREDICTION_HORIZON_DAYS", "7")
    )
    # Minimum data points required for a prediction
    prediction_min_data_points: int = int(
        os.getenv("PREDICTION_MIN_DATA_POINTS", "5")
    )

    # ── Alert Engine (Sprint 5) ─────────────────────────────────────
    # Enable velocity-based alert engine
    alert_enabled: bool = (
        os.getenv("ALERT_ENABLED", "true").lower() == "true"
    )
    # Velocity threshold for "moderada" alerts (mm/day)
    alert_velocity_moderada: float = float(
        os.getenv("ALERT_VELOCITY_MODERADA", "0.5")
    )
    # Velocity threshold for "rapida" alerts (mm/day)
    alert_velocity_rapida: float = float(
        os.getenv("ALERT_VELOCITY_RAPIDA", "2.0")
    )
    # Min consecutive temporal runs above threshold before alerting
    alert_min_consecutive: int = int(
        os.getenv("ALERT_MIN_CONSECUTIVE", "3")
    )
    # Cooldown in minutes before re-alerting after resolution
    alert_cooldown_minutes: int = int(
        os.getenv("ALERT_COOLDOWN_MINUTES", "60")
    )
    # Enable "moderada" level alerts
    alert_moderada_enabled: bool = (
        os.getenv("ALERT_MODERADA_ENABLED", "true").lower() == "true"
    )
    # Enable "rapida" level alerts
    alert_rapida_enabled: bool = (
        os.getenv("ALERT_RAPIDA_ENABLED", "true").lower() == "true"
    )

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

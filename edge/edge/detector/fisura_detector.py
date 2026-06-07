"""
ARGOS SLOPE 4.0 — Crack Detection Module for Edge (Raspberry Pi).

Provides two detection pipelines:

1. **OpenCV pipeline** (default) - Uses adaptive thresholding + contour
   analysis for real-time crack detection. Works without a trained model.
   Suitable for initial deployment on RPi.

2. **ML pipeline** (ONNX/TFLite) - Loads an exported model (YOLOv8, etc.)
   and runs inference. Drop-in replacement when a trained model is available.

Usage:
    detector = CrackDetector(method="opencv")
    results = detector.process(frame)
    for crack in results:
        print(crack.roi_id, crack.length_mm, crack.width_mm)
"""

from __future__ import annotations

import json
import logging
import uuid
from dataclasses import dataclass, field
from enum import Enum
from pathlib import Path
from typing import Optional

import cv2
import numpy as np

from edge.config import config

logger = logging.getLogger(__name__)


# ── Data types ─────────────────────────────────────────────────────────


@dataclass
class GeometricFilterConfig:
    """Configuration for geometric contour filtering.

    Attributes:
        enabled: Whether geometric filters are active.
        min_aspect_ratio: Minimum aspect ratio (width/height) to accept.
        max_aspect_ratio: Maximum aspect ratio (width/height) to accept.
        min_solidity: Minimum solidity (area / convex hull area) to accept.
        min_convexity: Minimum convexity (hull perimeter / contour perimeter) to accept.
    """

    enabled: bool = False
    min_aspect_ratio: float = 0.1
    max_aspect_ratio: float = 10.0
    min_solidity: float = 0.2
    min_convexity: float = 0.5


class CrackClassification(str, Enum):
    """Crack width classification according to mining standards."""

    NONE = "none"
    FINA = "fina"          # < 0.3 mm
    MEDIA = "media"        # 0.3 – 1.0 mm
    GRUESA = "gruesa"      # > 1.0 mm


@dataclass
class CrackResult:
    """
    Result of a single crack detection.

    Maps to the ``fisura`` table in PostgreSQL and the MQTT telemetry
    payload sent to the .NET backend.
    """

    roi_id: str = field(default_factory=lambda: f"CRK-{uuid.uuid4().hex[:8].upper()}")
    """Unique ROI identifier for this crack."""

    # ── Bounding box (pixels) ──
    x: int = 0
    """Top-left X coordinate in the original frame."""
    y: int = 0
    """Top-left Y coordinate in the original frame."""
    width: int = 0
    """Width of the bounding box in pixels."""
    height: int = 0
    """Height of the bounding box in pixels."""

    # ── Centroids ──
    center_x: int = 0
    """Center X in pixels (relative to original frame)."""
    center_y: int = 0
    """Center Y in pixels (relative to original frame)."""

    # ── Measurements (mm) ──
    length_mm: float = 0.0
    """Estimated crack length in mm."""
    width_mm: float = 0.0
    """Average crack width in mm."""
    area_mm2: float = 0.0
    """Crack surface area in mm²."""

    # ── Classification ──
    classification: CrackClassification = CrackClassification.NONE
    """Width-based crack classification."""

    # ── Metadata ──
    orientation_deg: float = 0.0
    """Orientation angle in degrees (0 = horizontal)."""
    confidence: float = 0.0
    """Detection confidence (ML models) or heuristic score (OpenCV)."""
    contour_points: int = 0
    """Number of contour points (diagnostic)."""

    def to_dict(self) -> dict:
        """Serialize to JSON-safe dict for MQTT publishing."""
        return {
            "roi_id": self.roi_id,
            "x": self.x,
            "y": self.y,
            "width": self.width,
            "height": self.height,
            "center_x": self.center_x,
            "center_y": self.center_y,
            "length_mm": round(self.length_mm, 4),
            "width_mm": round(self.width_mm, 4),
            "area_mm2": round(self.area_mm2, 4),
            "classification": self.classification.value,
            "orientation_deg": round(self.orientation_deg, 1),
            "confidence": round(self.confidence, 4),
        }


# ── Detector interface ────────────────────────────────────────────────


class BaseDetector:
    """Abstract base for all crack detection backends."""

    def process(self, frame: np.ndarray) -> list[CrackResult]:
        """
        Detect cracks in a BGR frame.

        Args:
            frame: BGR image from the camera.

        Returns:
            List of ``CrackResult``, one per detected crack.
            Empty list when no cracks are found.
        """
        raise NotImplementedError


# ── OpenCV pipeline ───────────────────────────────────────────────────


class OpenCvDetector(BaseDetector):
    """
    Crack detector using adaptive thresholding and contour analysis.

    Pipeline:
        1. Convert to grayscale
        2. Gaussian blur
        3. Adaptive threshold (Gaussian, inverse binary)
        4. Morphological close → open
        5. Contour detection
        6. Per-contour measurement (length, width, area, orientation)

    This runs comfortably on a Raspberry Pi 4/5 at 5–15 FPS on
    640×480 resolution.
    """

    def __init__(self) -> None:
        self._adaptive_block = config.adaptive_block
        self._adaptive_c = config.adaptive_c
        self._blur_ksize = config.blur_ksize
        self._morph_ksize = config.morph_ksize
        self._min_area = config.min_contour_area_px
        self._focal_mm = config.focal_length_mm
        self._distance_mm = config.sensor_distance_m * 1000.0  # m → mm
        self._pixel_um = config.sensor_pixel_um

        # Precompute pixel-to-mm ratio
        #   pixel_size_mm = sensor_pixel_um / 1_000_000 (µm → mm)
        #   GSD = (pixel_size_mm * distance_mm) / focal_mm   (Ground Sampling Distance)
        pixel_size_mm = self._pixel_um / 1_000_000.0  # µm → mm
        self._pixel_to_mm = (
            (pixel_size_mm * self._distance_mm) / self._focal_mm
            if self._focal_mm > 0
            else 1.0
        )

        # ── Geometric Filter Config ──────────────────────────────────
        self._filter_config = GeometricFilterConfig(
            enabled=config.geometric_filtering_enabled,
            min_aspect_ratio=config.filter_min_aspect_ratio,
            max_aspect_ratio=config.filter_max_aspect_ratio,
            min_solidity=config.filter_min_solidity,
            min_convexity=config.filter_min_convexity,
        )

        # ── Calibration scale (pixels_per_mm) ────────────────────────
        self._pixels_per_mm: Optional[float] = None
        self._scale_available: bool = False
        self._load_calibration_scale()

        # ── Rejected contours accumulator (reset on each process()) ──
        self._rejected_contours: list[tuple[np.ndarray, str]] = []

        logger.info(
            "OpenCvDetector initialized: "
            "pixel_to_mm=%.6f, min_area=%d, blur=%d, block=%d, C=%d, "
            "filters=%s, scale=%s",
            self._pixel_to_mm,
            self._min_area,
            self._blur_ksize,
            self._adaptive_block,
            self._adaptive_c,
            "enabled" if self._filter_config.enabled else "disabled",
            "available" if self._scale_available else "unavailable",
        )

    def _load_calibration_scale(self) -> None:
        """Load ``pixels_per_mm`` from calibration.json if available."""
        cal_path = (
            Path(__file__).resolve().parent.parent
            / "calibration"
            / "calibration.json"
        )
        if not cal_path.exists():
            logger.debug("Calibration file not found: %s", cal_path)
            return

        try:
            with open(cal_path, "r") as f:
                data = json.load(f)
            ppmm = data.get("pixels_per_mm")
            if ppmm is not None and ppmm > 0:
                self._pixels_per_mm = float(ppmm)
                self._scale_available = True
                logger.info(
                    "Calibration scale loaded: %.4f px/mm", self._pixels_per_mm
                )
            else:
                logger.debug(
                    "Calibration file exists but pixels_per_mm is null/zero."
                )
        except (json.JSONDecodeError, OSError) as exc:
            logger.warning(
                "Failed to load calibration scale: %s", exc
            )

    def _segment_cracks(self, gray: np.ndarray) -> np.ndarray:
        """Apply adaptive thresholding + morphology to get binary mask."""
        blurred = cv2.GaussianBlur(gray, (self._blur_ksize, self._blur_ksize), 0)
        binary = cv2.adaptiveThreshold(
            blurred,
            maxValue=255,
            adaptiveMethod=cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
            thresholdType=cv2.THRESH_BINARY_INV,
            blockSize=self._adaptive_block,
            C=self._adaptive_c,
        )
        kernel = np.ones((self._morph_ksize, self._morph_ksize), np.uint8)
        cleaned = cv2.morphologyEx(binary, cv2.MORPH_CLOSE, kernel)
        cleaned = cv2.morphologyEx(cleaned, cv2.MORPH_OPEN, kernel)
        return cleaned

    def _measure_contour(self, contour: np.ndarray) -> CrackResult:
        """Extract crack metrics from a single contour."""
        area_px = float(cv2.contourArea(contour))
        x, y, w, h = cv2.boundingRect(contour)
        center_x = x + w // 2
        center_y = y + h // 2

        # Perimeter → length approximation
        hull = cv2.convexHull(contour)
        perimeter = cv2.arcLength(hull, closed=True)
        length_px = perimeter / 2.0

        # Orientation via ellipse fitting or PCA
        orientation = 0.0
        if len(contour) >= 5:
            (cx, cy), (w_axis, h_axis), angle = cv2.fitEllipse(contour)
            orientation = float(angle)

        # Convert to mm
        ratio = self._pixel_to_mm
        length_mm = length_px * ratio
        area_mm2 = area_px * (ratio**2)
        width_mm = area_mm2 / length_mm if length_mm > 0 else 0.0

        # Classification
        if width_mm <= 0.0:
            classification = CrackClassification.NONE
        elif width_mm < 0.3:
            classification = CrackClassification.FINA
        elif width_mm < 1.0:
            classification = CrackClassification.MEDIA
        else:
            classification = CrackClassification.GRUESA

        # Confidence heuristic: ratio of area to bounding-box area
        bbox_area = w * h
        confidence = min(area_px / bbox_area, 1.0) if bbox_area > 0 else 0.0

        return CrackResult(
            x=x,
            y=y,
            width=w,
            height=h,
            center_x=center_x,
            center_y=center_y,
            length_mm=length_mm,
            width_mm=width_mm,
            area_mm2=area_mm2,
            classification=classification,
            orientation_deg=orientation,
            confidence=confidence,
            contour_points=len(contour),
        )

    # ── Geometric filtering ──────────────────────────────────────────

    def _filter_contour(
        self, contour: np.ndarray, area_px: float
    ) -> tuple[bool, str]:
        """Apply geometric filters to a contour.

        Args:
            contour: OpenCV contour (N×1×2 or N×2 array).
            area_px: Area of the contour in pixels.

        Returns:
            A tuple ``(passed, reason)`` where ``passed`` is ``True`` when
            the contour passes all active filters and ``reason`` is either
            ``"passed"`` or the name of the filter that rejected it.
        """
        if not self._filter_config.enabled:
            return (True, "passed")

        cfg = self._filter_config

        # ── Aspect ratio ─────────────────────────────────────────────
        x, y, w, h = cv2.boundingRect(contour)
        aspect_ratio = w / h if h > 0 else 0.0
        if aspect_ratio < cfg.min_aspect_ratio or aspect_ratio > cfg.max_aspect_ratio:
            return (False, "aspect_ratio")

        # ── Solidity ─────────────────────────────────────────────────
        hull = cv2.convexHull(contour)
        hull_area = cv2.contourArea(hull)
        solidity = area_px / hull_area if hull_area > 0 else 0.0
        if solidity < cfg.min_solidity:
            return (False, "solidity")

        # ── Convexity ────────────────────────────────────────────────
        hull_perimeter = cv2.arcLength(hull, True)
        contour_perimeter = cv2.arcLength(contour, True)
        convexity = (
            hull_perimeter / contour_perimeter if contour_perimeter > 0 else 0.0
        )
        if convexity < cfg.min_convexity:
            return (False, "convexity")

        return (True, "passed")

    def _check_min_size(self, contour: np.ndarray) -> tuple[bool, str]:
        """Check that the contour meets the minimum size requirement.

        Uses calibration data (mm) when available, otherwise falls back
        to pixel thresholds.

        Args:
            contour: OpenCV contour.

        Returns:
            A tuple ``(passed, reason)``.
        """
        x, y, w, h = cv2.boundingRect(contour)

        if self._scale_available and self._pixels_per_mm is not None:
            # Real-world units (mm)
            width_mm = w * (1.0 / self._pixels_per_mm)
            height_mm = h * (1.0 / self._pixels_per_mm)
            if width_mm > config.filter_max_width_mm:  # noqa: E501
                return (False, "max_width_mm")
            if width_mm < config.filter_min_width_mm and height_mm < config.filter_min_length_mm:  # noqa: E501
                return (False, "min_size_mm")
        else:
            # Fallback to pixel thresholds
            if w < config.filter_min_width_px and h < config.filter_min_length_px:
                return (False, "min_size_px")

        return (True, "passed")

    def get_rejected_contours(self) -> list[tuple[np.ndarray, str]]:
        """Return the list of rejected contours from the last ``process()`` call.

        Returns:
            List of ``(contour, reason)`` tuples, one per rejected contour.
        """
        return self._rejected_contours

    def process(self, frame: np.ndarray) -> list[CrackResult]:
        """Run OpenCV crack detection on a BGR frame."""
        if len(frame.shape) == 3:
            gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        else:
            gray = frame

        mask = self._segment_cracks(gray)
        contours, _ = cv2.findContours(
            mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE
        )

        # Reset rejected contours for this frame
        self._rejected_contours.clear()

        results: list[CrackResult] = []
        for cnt in contours:
            area = cv2.contourArea(cnt)
            if area < self._min_area:
                continue

            # Geometric filters
            passed, reason = self._filter_contour(cnt, area)
            if not passed:
                self._rejected_contours.append((cnt, reason))
                continue

            # Scale-aware size check
            passed, reason = self._check_min_size(cnt)
            if not passed:
                self._rejected_contours.append((cnt, reason))
                continue

            results.append(self._measure_contour(cnt))

        return results


# ── ML pipeline (ONNX) ────────────────────────────────────────────────


class OnnxDetector(BaseDetector):
    """
    Crack detector using an ONNX model (e.g. YOLOv8 exported to ONNX).

    Falls back to OpenCV if the model cannot be loaded.

    Expected input:  (N, 3, H, W) normalized float32
    Expected output: (N, num_detections, 6)  [x1, y1, x2, y2, conf, class]
    """

    def __init__(self, model_path: str) -> None:
        self._model_path = model_path
        self._confidence = config.confidence_threshold
        self._session = None
        self._input_name: Optional[str] = None
        self._focal_mm = config.focal_length_mm
        self._distance_mm = config.sensor_distance_m * 1000.0
        self._pixel_um = config.sensor_pixel_um
        pixel_size_mm = self._pixel_um / 1_000_000.0
        self._pixel_to_mm = (
            (pixel_size_mm * self._distance_mm) / self._focal_mm
            if self._focal_mm > 0
            else 1.0
        )
        self._fallback = OpenCvDetector()
        self._load_model()

    def _load_model(self) -> None:
        """Load ONNX model. Falls back silently if not available."""
        try:
            import onnxruntime as ort  # type: ignore[import-untyped]

            self._session = ort.InferenceSession(
                self._model_path,
                providers=["CPUExecutionProvider"],
            )
            self._input_name = self._session.get_inputs()[0].name
            _, _, self._input_h, self._input_w = self._session.get_inputs()[0].shape
            logger.info(
                "ONNX model loaded: %s (input: %dx%d)",
                self._model_path,
                self._input_w,
                self._input_h,
            )
        except (ImportError, FileNotFoundError, RuntimeError) as exc:
            logger.warning(
                "ONNX model not available (%s). Using OpenCV fallback.", exc
            )
            self._session = None

    def process(self, frame: np.ndarray) -> list[CrackResult]:
        """Run ONNX inference or fall back to OpenCV."""
        if self._session is None:
            return self._fallback.process(frame)

        # Preprocess
        h, w = frame.shape[:2]
        input_blob = cv2.dnn.blobFromImage(
            frame,
            scalefactor=1.0 / 255.0,
            size=(self._input_w, self._input_h),
            swapRB=True,
            crop=False,
        ).astype(np.float32)

        # Infer
        outputs = self._session.run(None, {self._input_name: input_blob})
        detections = outputs[0][0]  # (num_detections, 6)

        results: list[CrackResult] = []
        ratio_x = w / self._input_w
        ratio_y = h / self._input_h

        for det in detections:
            conf = float(det[4])
            if conf < self._confidence:
                continue

            x1, y1, x2, y2 = det[:4]
            # Scale back to original frame
            x = int(x1 * ratio_x)
            y = int(y1 * ratio_y)
            bw = int((x2 - x1) * ratio_x)
            bh = int((y2 - y1) * ratio_y)

            # Estimate length (diagonal / 2 approximation)
            length_px = np.sqrt(bw**2 + bh**2) / 2.0
            ratio = self._pixel_to_mm
            length_mm = length_px * ratio
            area_mm2 = (bw * bh) * (ratio**2)
            width_mm = area_mm2 / length_mm if length_mm > 0 else 0.0

            if width_mm <= 0.0:
                classification = CrackClassification.NONE
            elif width_mm < 0.3:
                classification = CrackClassification.FINA
            elif width_mm < 1.0:
                classification = CrackClassification.MEDIA
            else:
                classification = CrackClassification.GRUESA

            results.append(
                CrackResult(
                    x=x,
                    y=y,
                    width=bw,
                    height=bh,
                    center_x=x + bw // 2,
                    center_y=y + bh // 2,
                    length_mm=length_mm,
                    width_mm=width_mm,
                    area_mm2=area_mm2,
                    classification=classification,
                    confidence=conf,
                )
            )

        return results


# ── Factory ───────────────────────────────────────────────────────────


def create_detector(method: str | None = None) -> BaseDetector:
    """
    Factory function to create the appropriate detector.

    Args:
        method: ``"opencv"`` (default), ``"onnx"``, or ``"tflite"``.
                Falls back to config value if ``None``.

    Returns:
        Configured detector instance.

    Raises:
        ValueError: If method is unknown.
    """
    method = (method or config.detector_method).lower()

    if method == "opencv":
        return OpenCvDetector()

    if method == "onnx":
        return OnnxDetector(config.model_path)

    if method == "tflite":
        raise NotImplementedError(
            "TFLite detector not yet implemented. "
            "Use 'opencv' or 'onnx' instead."
        )

    raise ValueError(
        f"Unknown detector method '{method}'. "
        f"Expected: opencv, onnx, tflite"
    )

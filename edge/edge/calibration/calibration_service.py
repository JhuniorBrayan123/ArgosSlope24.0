"""
ARGOS SLOPE 4.0 — Calibration service orchestrator.

Coordinates the full calibration pipeline:
  1. Camera calibration via checkerboard
  2. ArUco marker detection for pixel-to-mm scale
  3. Persistence of all calibration state to a single JSON file

Typical usage::

    service = CalibrationService()
    service.run_full_calibration(
        checkerboard_dir="calib_images/",
        pattern_size=(9, 6),
        square_size_mm=25.0,
        aruco_image="aruco_scene.jpg",
        marker_id=0,
        marker_size_mm=100.0,
    )
    print(service.status())
"""

from __future__ import annotations

import json
import logging
from datetime import datetime
from pathlib import Path
from typing import Optional

import numpy as np
from numpy.typing import NDArray

from edge.calibration.calibrate_camera import CameraCalibrator
from edge.calibration.detect_aruco_scale import ArucoScaleDetector

logger = logging.getLogger(__name__)

#: Default calibration JSON path (relative to the calibration package).
DEFAULT_CALIBRATION_PATH = Path(__file__).parent / "calibration.json"


class CalibrationService:
    """
    Orchestrator for the full camera + scale calibration pipeline.

    Provides a high-level API that combines ``CameraCalibrator`` and
    ``ArucoScaleDetector`` with state persistence.

    Attributes:
        calibrator: The underlying camera calibrator instance.
        aruco: The underlying ArUco scale detector instance.
        calibrated: Whether camera calibration has been completed.
        scale_detected: Whether scale detection has been completed.
        calibration_date: ISO-8601 timestamp of the last calibration.
    """

    def __init__(self, calibration_path: str | Path = DEFAULT_CALIBRATION_PATH) -> None:
        """
        Args:
            calibration_path: Path to the persistent JSON state file.
        """
        self.calibration_path = Path(calibration_path)
        self.calibrator = CameraCalibrator()
        self.aruco = ArucoScaleDetector()

        # ── High-level state ────────────────────────────────────────
        self.calibrated: bool = False
        self.scale_detected: bool = False
        self.calibration_date: Optional[str] = None

        # Try to load previous state
        self.load()

    # ── Full pipeline ──────────────────────────────────────────────

    def run_full_calibration(
        self,
        checkerboard_dir: str | Path,
        pattern_size: tuple[int, int] = (9, 6),
        square_size_mm: float = 25.0,
        aruco_image: Optional[str | Path] = None,
        marker_id: int = 0,
        marker_size_mm: float = 100.0,
        image_extensions: tuple[str, ...] = (".jpg", ".jpeg", ".png", ".bmp", ".tif"),
    ) -> dict:
        """
        Run the complete calibration pipeline.

        Steps:
          1. Find all checkerboard images in ``checkerboard_dir``.
          2. Run camera calibration.
          3. If ``aruco_image`` is provided, detect the marker and compute scale.
          4. If ``aruco_image`` is NOT provided, use the last image from
             the calibration set for scale detection.
          5. Persist results to ``calibration.json``.

        Args:
            checkerboard_dir: Directory containing checkerboard images.
            pattern_size: Inner corners per (columns, rows).
            square_size_mm: Physical square side length in mm.
            aruco_image: Image containing the ArUco marker (optional).
            marker_id: ArUco marker ID.
            marker_size_mm: Physical marker side length in mm.
            image_extensions: File extensions to consider as images.

        Returns:
            Status dict (same as ``status()``).
        """
        cal_dir = Path(checkerboard_dir)
        if not cal_dir.is_dir():
            raise NotADirectoryError(f"Checkerboard directory not found: {cal_dir}")

        # Collect images
        image_paths = [
            str(p)
            for ext in image_extensions
            for p in sorted(cal_dir.glob(f"*{ext}"))
        ]

        if not image_paths:
            raise FileNotFoundError(
                f"No images with extensions {image_extensions} found "
                f"in {cal_dir}"
            )

        logger.info(
            "Full calibration: %d checkerboard images, ArUco image=%s",
            len(image_paths),
            aruco_image or "(last calibration image)",
        )

        # ── Step 1: Camera calibration ──────────────────────────────
        self.calibrator.calibrate_from_images(
            image_paths=image_paths,
            pattern_size=pattern_size,
            square_size_mm=square_size_mm,
        )

        fx = self.calibrator.get_focal_length_px()
        self.calibrated = True
        self.calibration_date = datetime.now().isoformat()

        # ── Step 2: ArUco scale detection ───────────────────────────
        aruco_img_path: Optional[Path] = None
        if aruco_image is not None:
            aruco_img_path = Path(aruco_image)
        else:
            # Use the last checkerboard image as fallback
            last_img = image_paths[-1]
            aruco_img_path = Path(last_img)

        if aruco_img_path and aruco_img_path.exists():
            img = cv2_load_image(aruco_img_path)
            if img is not None:
                self._detect_scale(
                    image=img,
                    marker_id=marker_id,
                    marker_size_mm=marker_size_mm,
                    focal_length_px=fx,
                )

        # ── Step 3: Save ────────────────────────────────────────────
        self.save()
        return self.status()

    def quick_scale_from_aruco(
        self,
        aruco_image: str | Path,
        marker_size_mm: float = 100.0,
        focal_length_px: Optional[float] = None,
        marker_id: int = 0,
    ) -> dict:
        """
        Run scale-only detection using a previously calibrated camera.

        This is useful when the camera is already calibrated but the
        ArUco marker position has changed (e.g. after maintenance).

        Args:
            aruco_image: Image containing the ArUco marker.
            marker_size_mm: Physical marker side length in mm.
            focal_length_px: Camera focal length in px (uses loaded value
                             if omitted).
            marker_id: ArUco marker ID.

        Returns:
            Status dict.

        Raises:
            RuntimeError: If no calibration data is available and no
                          ``focal_length_px`` is provided.
        """
        fx = focal_length_px
        if fx is None:
            if self.calibrator.camera_matrix is None:
                raise RuntimeError(
                    "No camera calibration available. Provide focal_length_px "
                    "or run full calibration first."
                )
            fx = self.calibrator.get_focal_length_px()

        img = cv2_load_image(Path(aruco_image))
        if img is None:
            raise FileNotFoundError(f"Cannot read image: {aruco_image}")

        self._detect_scale(
            image=img,
            marker_id=marker_id,
            marker_size_mm=marker_size_mm,
            focal_length_px=fx,
        )

        self.save()
        return self.status()

    # ── Status & persistence ──────────────────────────────────────

    def status(self) -> dict:
        """
        Return a dict with the current calibration state.

        Keys:
            - ``calibrated``: bool
            - ``scale_detected``: bool
            - ``calibration_date``: str or None
            - ``pixels_per_mm``: float or None
            - ``fx_px``, ``fy_px``, ``cx_px``, ``cy_px``: float or None
            - ``reprojection_error``: float
            - ``marker_id``, ``marker_size_mm``: int/float
            - ``aruco_distance_m``: float or None
        """
        return self._calibration_dict()

    def load(self) -> bool:
        """
        Load calibration state from the JSON file.

        Returns:
            ``True`` if loaded successfully, ``False`` otherwise.
        """
        path = self.calibration_path
        if not path.exists():
            return False

        try:
            with open(path, "r", encoding="utf-8") as f:
                data = json.load(f)
        except (json.JSONDecodeError, OSError) as exc:
            logger.warning("Failed to load calibration state: %s", exc)
            return False

        # Camera calibration
        ok = self.calibrator._load_from_dict(data)
        if not ok:
            return False

        # ArUco scale
        self.aruco.pixels_per_mm = data.get("pixels_per_mm")
        self.aruco.marker_size_mm = data.get("marker_size_mm", 100.0)
        self.aruco.marker_id = data.get("marker_id", 0)
        self.aruco.aruco_distance_m = data.get("aruco_distance_m")

        # High-level flags
        self.calibrated = data.get("calibrated", False)
        self.scale_detected = data.get("scale_detected", False)
        self.calibration_date = data.get("calibration_date")

        return True

    def save(self) -> None:
        """Persist the current calibration state to the JSON file."""
        data = self._calibration_dict()
        path = self.calibration_path
        path.parent.mkdir(parents=True, exist_ok=True)
        with open(path, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)
        logger.info("Calibration state saved to %s", path)

    # ── Internal helpers ───────────────────────────────────────────

    def _detect_scale(
        self,
        image: NDArray[np.uint8],
        marker_id: int,
        marker_size_mm: float,
        focal_length_px: float,
    ) -> None:
        """Internal: detect ArUco marker and compute scale + distance."""
        self.aruco.marker_id = marker_id
        self.aruco.marker_size_mm = marker_size_mm

        corners = self.aruco.detect_marker(image, marker_id=marker_id)
        if corners is not None:
            self.aruco.compute_scale(corners, marker_size_mm)
            self.aruco.estimate_distance(focal_length_px, marker_size_mm)
            self.scale_detected = True
            logger.info(
                "Scale detection complete: %.4f px/mm, distance=%.2f m",
                self.aruco.pixels_per_mm,
                self.aruco.aruco_distance_m,
            )
        else:
            logger.warning(
                "ArUco marker ID=%d not found in the image.", marker_id
            )
            self.scale_detected = False

    def _calibration_dict(self) -> dict:
        """Build the full serialisable state dict."""
        cal = self.calibrator._calibration_dict()
        cal.update(
            {
                "calibration_date": self.calibration_date,
                "marker_id": self.aruco.marker_id,
                "marker_size_mm": self.aruco.marker_size_mm,
                "pixels_per_mm": self.aruco.pixels_per_mm,
                "aruco_distance_m": self.aruco.aruco_distance_m,
                "calibrated": self.calibrated,
                "scale_detected": self.scale_detected,
            }
        )
        return cal


# ── Utility ────────────────────────────────────────────────────────────


def cv2_load_image(path: Path) -> Optional[NDArray[np.uint8]]:
    """
    Load an image with OpenCV, return ``None`` on failure.

    Args:
        path: Image file path.

    Returns:
        BGR image array or ``None``.
    """
    if not path.exists():
        logger.warning("Image not found: %s", path)
        return None
    img = cv2_load_image._cv2_imread(str(path))
    if img is None:
        logger.warning("Failed to load image: %s", path)
    return img


# Cache the import to avoid repeated lookups
cv2_load_image._cv2_imread = __import__("cv2").imread  # type: ignore[attr-defined]

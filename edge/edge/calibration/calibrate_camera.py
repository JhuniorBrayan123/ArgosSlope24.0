"""
ARGOS SLOPE 4.0 — Camera calibration using a checkerboard pattern.

Uses OpenCV's ``findChessboardCorners`` + ``calibrateCamera`` to compute
the camera matrix and distortion coefficients from multiple images taken
at different angles.

Typical usage::

    calibrator = CameraCalibrator()
    calibrator.calibrate_from_images(
        image_paths=["img1.jpg", "img2.jpg", ...],
        pattern_size=(9, 6),
        square_size_mm=25.0,
    )
    calibrator.save_calibration("calibration.json")
    undistorted = calibrator.undistort_image(frame)
"""

from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Optional

import cv2
import numpy as np
from numpy.typing import NDArray

logger = logging.getLogger(__name__)

# Type aliases for readability
MatLike = NDArray[np.uint8 | np.float64]
Points3D = list[list[NDArray[np.float64]]]  # list of image's 3D points
Points2D = list[list[NDArray[np.float64]]]  # list of image's 2D corners


class CameraCalibrator:
    """
    Calibrate a camera using a printed checkerboard pattern.

    The checkerboard must be printed and attached to a flat surface.
    At least 10–15 images from different angles and distances are
    recommended for a good calibration.

    Results are stored as instance attributes and can be persisted
    via ``save_calibration()`` / ``load_calibration()``.
    """

    def __init__(self) -> None:
        # ── Calibration results (populated after calibrate_*) ────────
        self.camera_matrix: Optional[NDArray[np.float64]] = None
        """3×3 intrinsic camera matrix (K)."""

        self.distortion_coefficients: Optional[NDArray[np.float64]] = None
        """Distortion coefficients (k1, k2, p1, p2, k3, ...)."""

        self.reprojection_error: float = 0.0
        """RMS reprojection error from calibration (lower is better, < 1.0)."""

        self.image_width: int = 0
        self.image_height: int = 0

        # ── Internal state ──────────────────────────────────────────
        self._pattern_size: tuple[int, int] = (9, 6)
        self._square_size_mm: float = 25.0
        self._object_points: list[NDArray[np.float64]] = []
        self._image_points: list[NDArray[np.float64]] = []

    # ── Public API ─────────────────────────────────────────────────

    @staticmethod
    def find_checkerboard(
        image: NDArray[np.uint8],
        pattern_size: tuple[int, int] = (9, 6),
    ) -> Optional[NDArray[np.float64]]:
        """
        Find checkerboard corners in an image.

        Args:
            image: Grayscale or BGR image.
            pattern_size: Number of inner corners per row/col, e.g. (9, 6).

        Returns:
            Sub-pixel accurate corner positions (N×1×2) or ``None`` if no
            checkerboard is found.
        """
        if len(image.shape) == 3:
            gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        else:
            gray = image

        ret, corners = cv2.findChessboardCorners(gray, pattern_size, None)
        if not ret:
            return None

        # Refine to sub-pixel accuracy
        criteria = (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 30, 0.001)
        refined = cv2.cornerSubPix(gray, corners, (11, 11), (-1, -1), criteria)
        return refined

    def calibrate_from_images(
        self,
        image_paths: list[str | Path],
        pattern_size: tuple[int, int] = (9, 6),
        square_size_mm: float = 25.0,
    ) -> float:
        """
        Run camera calibration from a list of checkerboard images.

        Args:
            image_paths: Paths to calibration images (at least 10–15 recommended).
            pattern_size: Inner corners per (columns, rows); e.g. (9, 6).
            square_size_mm: Physical side length of each checkerboard square in mm.

        Returns:
            RMS reprojection error.

        Raises:
            ValueError: If fewer than 3 valid images are found.
        """
        self._pattern_size = pattern_size
        self._square_size_mm = square_size_mm

        # Prepare 3D object points: (0,0,0), (1,0,0), …, (cols-1, rows-1, 0)
        objp = np.zeros((pattern_size[0] * pattern_size[1], 3), dtype=np.float32)
        objp[:, :2] = np.mgrid[0 : pattern_size[0], 0 : pattern_size[1]].T.reshape(
            -1, 2
        )
        objp *= square_size_mm

        self._object_points.clear()
        self._image_points.clear()
        first = True

        for path_str in image_paths:
            path = Path(path_str)
            image = cv2.imread(str(path))
            if image is None:
                logger.warning("Cannot read image — skipping: %s", path)
                continue

            corners = self.find_checkerboard(image, pattern_size)
            if corners is None:
                logger.warning("No checkerboard found in: %s", path)
                continue

            h, w = image.shape[:2]
            if first:
                self.image_width = w
                self.image_height = h
                first = False

            self._object_points.append(objp.copy())
            self._image_points.append(corners.reshape(-1, 2))

        n_valid = len(self._object_points)
        if n_valid < 3:
            raise ValueError(
                f"Only {n_valid} valid images with checkerboard found. "
                "At least 3 are required for calibration; 10–15 recommended."
            )

        logger.info(
            "Calibrating from %d checkerboard images (pattern=%sx%s, square=%smm)...",
            n_valid,
            pattern_size[0],
            pattern_size[1],
            square_size_mm,
        )

        # Run OpenCV calibration
        rms, K, dist, _rvecs, _tvecs = cv2.calibrateCamera(
            self._object_points,
            self._image_points,
            (self.image_width, self.image_height),
            cameraMatrix=None,
            distCoeffs=None,
        )

        self.camera_matrix = K
        self.distortion_coefficients = dist
        self.reprojection_error = rms

        logger.info(
            "Calibration complete. RMS error=%.4f | fx=%.1f fy=%.1f cx=%.1f cy=%.1f",
            rms,
            K[0, 0],
            K[1, 1],
            K[0, 2],
            K[1, 2],
        )

        return rms

    def calibrate_from_video(
        self,
        video_path: str | Path,
        pattern_size: tuple[int, int] = (9, 6),
        square_size_mm: float = 25.0,
        frame_step: int = 30,
    ) -> float:
        """
        Extract frames from a video and run calibration.

        Args:
            video_path: Path to video file.
            pattern_size: Inner corners per (columns, rows).
            square_size_mm: Physical square side length in mm.
            frame_step: Process every N-th frame to avoid near-identical frames.

        Returns:
            RMS reprojection error.

        Raises:
            ValueError: If fewer than 3 valid frames are found.
        """
        cap = cv2.VideoCapture(str(video_path))
        if not cap.isOpened():
            raise FileNotFoundError(f"Cannot open video: {video_path}")

        frame_paths: list[Path] = []
        count = 0

        while True:
            ret, frame = cap.read()
            if not ret:
                break
            if count % frame_step == 0:
                # Write a temporary file for calibrate_from_images
                tmp = Path(f"__calib_frame_{count:06d}.png")
                cv2.imwrite(str(tmp), frame)
                frame_paths.append(tmp)
            count += 1

        cap.release()
        logger.info("Extracted %d frames from video (step=%d).", len(frame_paths), frame_step)

        try:
            rms = self.calibrate_from_images(frame_paths, pattern_size, square_size_mm)
        finally:
            # Cleanup temp files
            for p in frame_paths:
                p.unlink(missing_ok=True)

        return rms

    def save_calibration(self, filepath: str | Path) -> None:
        """
        Save calibration results to a JSON file.

        Args:
            filepath: Output JSON path.
        """
        data = self._calibration_dict()
        filepath = Path(filepath)
        filepath.parent.mkdir(parents=True, exist_ok=True)
        with open(filepath, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)
        logger.info("Calibration saved to %s", filepath)

    def load_calibration(self, filepath: str | Path) -> bool:
        """
        Load calibration results from a JSON file.

        Args:
            filepath: JSON file written by ``save_calibration()``.

        Returns:
            ``True`` if loaded successfully, ``False`` if file is missing or corrupt.
        """
        filepath = Path(filepath)
        if not filepath.exists():
            logger.warning("Calibration file not found: %s", filepath)
            return False

        try:
            with open(filepath, "r", encoding="utf-8") as f:
                data = json.load(f)
        except (json.JSONDecodeError, OSError) as exc:
            logger.warning("Failed to load calibration: %s", exc)
            return False

        return self._load_from_dict(data)

    def undistort_image(
        self, image: NDArray[np.uint8]
    ) -> NDArray[np.uint8]:
        """
        Remove lens distortion from an image using the calibrated parameters.

        Args:
            image: Distorted BGR or grayscale image.

        Returns:
            Undistorted image of the same shape.

        Raises:
            RuntimeError: If calibration has not been performed yet.
        """
        if self.camera_matrix is None or self.distortion_coefficients is None:
            raise RuntimeError(
                "No calibration data available. Run calibrate_from_images() "
                "or load_calibration() first."
            )

        return cv2.undistort(
            image, self.camera_matrix, self.distortion_coefficients
        )

    def get_focal_length_px(self) -> float:
        """
        Return the focal length in pixels (fx, assuming fx ≈ fy).

        Returns:
            Focal length in pixels.

        Raises:
            RuntimeError: If calibration has not been performed yet.
        """
        if self.camera_matrix is None:
            raise RuntimeError(
                "No calibration data available. Run calibrate_from_images() "
                "or load_calibration() first."
            )
        return float(self.camera_matrix[0, 0])

    # ── Internal helpers ────────────────────────────────────────────

    def _calibration_dict(self) -> dict:
        """Serialize calibration state to a JSON-safe dict."""
        return {
            "camera_matrix": (
                self.camera_matrix.tolist() if self.camera_matrix is not None else None
            ),
            "distortion_coefficients": (
                self.distortion_coefficients.tolist()
                if self.distortion_coefficients is not None
                else None
            ),
            "fx_px": (
                float(self.camera_matrix[0, 0])
                if self.camera_matrix is not None
                else None
            ),
            "fy_px": (
                float(self.camera_matrix[1, 1])
                if self.camera_matrix is not None
                else None
            ),
            "cx_px": (
                float(self.camera_matrix[0, 2])
                if self.camera_matrix is not None
                else None
            ),
            "cy_px": (
                float(self.camera_matrix[1, 2])
                if self.camera_matrix is not None
                else None
            ),
            "reprojection_error": self.reprojection_error,
            "image_width": self.image_width,
            "image_height": self.image_height,
            "pattern_size": list(self._pattern_size),
            "square_size_mm": self._square_size_mm,
        }

    def _load_from_dict(self, data: dict) -> bool:
        """Populate state from a dict (return False if missing keys)."""
        try:
            mat = data.get("camera_matrix")
            self.camera_matrix = (
                np.array(mat, dtype=np.float64) if mat is not None else None
            )
            dist = data.get("distortion_coefficients")
            self.distortion_coefficients = (
                np.array(dist, dtype=np.float64) if dist is not None else None
            )
            self.reprojection_error = data.get("reprojection_error", 0.0)
            self.image_width = data.get("image_width", 0)
            self.image_height = data.get("image_height", 0)

            ps = data.get("pattern_size")
            if ps and len(ps) == 2:
                self._pattern_size = (int(ps[0]), int(ps[1]))
            self._square_size_mm = data.get("square_size_mm", 25.0)

            return True
        except (ValueError, TypeError, KeyError) as exc:
            logger.warning("Corrupt calibration data: %s", exc)
            return False

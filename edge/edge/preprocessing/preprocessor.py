"""
ARGOS SLOPE 4.0 — Configurable image preprocessing pipeline.

Applies a sequence of preprocessing steps (undistort, CLAHE, …) to rock-face
frames before crack detection. Steps are configured via JSON from the
``PREPROCESSING_STEPS`` env var and built dynamically at runtime.
"""

from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Callable, Optional

import cv2
import numpy as np
from numpy.typing import NDArray

from edge.edge.calibration.calibrate_camera import CameraCalibrator
from edge.edge.config import EdgeConfig

logger = logging.getLogger(__name__)

# Type alias for a single preprocessing step
StepFunc = Callable[[NDArray[np.uint8]], NDArray[np.uint8]]


class EdgePreprocessor:
    """
    Configurable image preprocessing pipeline.

    Builds a sequence of transforms from a list of step names
    (e.g. ``["undistort", "clahe"]``) and applies them in order.

    Steps are resilient: if one step fails, a warning is logged and the
    pipeline continues with the next step.
    """

    def __init__(
        self,
        config: EdgeConfig,
        calibration_path: str | Path = "calibration/calibration.json",
    ) -> None:
        """
        Args:
            config: Application configuration (provides preprocessing params).
            calibration_path: Path to the JSON calibration file produced by
                ``CalibrationService``.  Defaults to
                ``calibration/calibration.json`` relative to the project root.
        """
        self._config = config
        self._calibration_path = Path(calibration_path)

        # Lazy-loaded calibrator (loaded on first undistort request)
        self._calibrator: Optional[CameraCalibrator] = None

        # Pipeline built on init
        self._pipeline: list[tuple[str, StepFunc]] = []
        self._build_pipeline()

    # ── Public API ─────────────────────────────────────────────────

    @property
    def pipeline_description(self) -> str:
        """
        Human-readable description of the active pipeline steps.

        Returns:
            ``"undistort → clahe"`` or ``"<passthrough>"`` if no steps.
        """
        if not self._pipeline:
            return "<passthrough>"
        return " → ".join(name for name, _ in self._pipeline)

    def process(self, image: NDArray[np.uint8]) -> NDArray[np.uint8]:
        """
        Run the full preprocessing pipeline on a single frame.

        Each configured step is applied in order.  If a step fails, its
        error is logged and the (unchanged) frame from the previous step
        is passed to the next step.

        Args:
            image: Input BGR or grayscale image.

        Returns:
            Preprocessed image of the same shape and dtype.
        """
        result = image.copy()
        for step_name, step_func in self._pipeline:
            try:
                result = step_func(result)
                logger.debug("Preprocessing step '%s' OK.", step_name)
            except Exception:
                logger.exception(
                    "Preprocessing step '%s' failed — skipping.", step_name
                )
        return result

    # ── Pipeline construction ──────────────────────────────────────

    def _build_pipeline(self) -> None:
        """Parse ``preprocessing_steps`` from config and build step list."""
        raw = self._config.preprocessing_steps
        try:
            step_names: list[str] = json.loads(raw)
        except (json.JSONDecodeError, TypeError) as exc:
            logger.warning(
                "Cannot parse PREPROCESSING_STEPS (%s), "
                "falling back to empty pipeline: %s",
                raw,
                exc,
            )
            step_names = []

        builder: dict[str, Callable[[], StepFunc]] = {
            "undistort": self._build_undistort,
            "clahe": self._build_clahe,
        }

        self._pipeline.clear()
        for name in step_names:
            name_clean = name.strip().lower()
            factory = builder.get(name_clean)
            if factory is not None:
                try:
                    step_fn = factory()
                    self._pipeline.append((name_clean, step_fn))
                    logger.debug("Pipeline step added: '%s'", name_clean)
                except Exception:
                    logger.exception(
                        "Failed to build step '%s' — skipped.", name_clean
                    )
            else:
                logger.warning("Unknown preprocessing step '%s' — skipped.", name)

        if not self._pipeline:
            logger.info("Preprocessing pipeline is empty (passthrough).")

    # ── Step builders ──────────────────────────────────────────────

    def _build_undistort(self) -> StepFunc:
        """
        Build the ``undistort`` step.

        Loads ``CameraCalibrator`` from the calibration JSON file and returns
        a function that calls ``undistort_image()``.  If the calibration file
        is missing or empty, the step logs a warning and acts as a no-op.
        """
        calibrator = self._load_calibrator()

        def undistort_step(image: NDArray[np.uint8]) -> NDArray[np.uint8]:
            nonlocal calibrator
            if calibrator is None:
                return image
            # Reload calibrator on each call (lazy re-creation) so updates
            # to the calibration file take effect without a restart.
            if calibrator.camera_matrix is None:
                calibrator = self._load_calibrator()
            if calibrator is None or calibrator.camera_matrix is None:
                logger.warning(
                    "Undistort requested but no calibration data available — "
                    "passing image through unchanged."
                )
                return image
            return calibrator.undistort_image(image)

        return undistort_step

    def _build_clahe(self) -> StepFunc:
        """
        Build the ``clahe`` step.

        Creates ``cv2.createCLAHE`` with the configured ``clip_limit`` and
        ``tile_grid_size``.  For colour images the step converts to LAB,
        applies CLAHE on the L channel, and converts back to BGR.
        """
        clip_limit = self._config.clahe_clip_limit
        tile_size = self._config.clahe_tile_grid_size
        clahe = cv2.createCLAHE(
            clipLimit=clip_limit,
            tileGridSize=(tile_size, tile_size),
        )

        def clahe_step(image: NDArray[np.uint8]) -> NDArray[np.uint8]:
            if len(image.shape) == 3 and image.shape[2] == 3:
                # Colour image: LAB → CLAHE on L → back to BGR
                lab = cv2.cvtColor(image, cv2.COLOR_BGR2LAB)
                l, a, b = cv2.split(lab)
                l_eq = clahe.apply(l)
                merged = cv2.merge([l_eq, a, b])
                return cv2.cvtColor(merged, cv2.COLOR_LAB2BGR)
            # Grayscale: apply directly
            return clahe.apply(image)

        return clahe_step

    # ── Helpers ────────────────────────────────────────────────────

    def _load_calibrator(self) -> Optional[CameraCalibrator]:
        """
        Load ``CameraCalibrator`` from the calibration JSON file.

        Returns:
            A ``CameraCalibrator`` instance with loaded data, or ``None``
            if the file is missing or unreadable.
        """
        cal_path = self._calibration_path
        if not cal_path.exists():
            logger.warning("Calibration file not found: %s", cal_path)
            return None

        calibrator = CameraCalibrator()
        ok = calibrator.load_calibration(str(cal_path))
        if not ok or calibrator.camera_matrix is None:
            logger.warning(
                "Calibration file '%s' exists but contains no camera_matrix "
                "data — undistort will be a no-op.",
                cal_path,
            )
            return calibrator

        logger.info(
            "Calibration loaded from '%s' (fx=%.1f, error=%.4f).",
            cal_path,
            calibrator.get_focal_length_px(),
            calibrator.reprojection_error,
        )
        return calibrator

"""
ARGOS SLOPE 4.0 — Unit tests for fallback measurement (no calibration).

Tests that when calibration is unavailable, the detector falls back to
the theoretical pixel-to-mm ratio and logs a WARNING.
Run with::

    python -m pytest edge/edge/tests/test_fallback_measurement.py -v
"""

from __future__ import annotations

import logging
import unittest
from pathlib import Path
from unittest.mock import patch

import numpy as np

from edge.config import config as edge_config


def _make_rect_contour(w: int, h: int) -> np.ndarray:
    """Build a rectangular contour of given width and height."""
    pts = [
        (0, 0),
        (w, 0),
        (w, h),
        (0, h),
    ]
    return np.array(pts, dtype=np.int32).reshape((-1, 1, 2))


class TestFallbackMeasurement(unittest.TestCase):
    """Test measurement fallback when calibration is unavailable."""

    def setUp(self) -> None:
        # Ensure no calibration file exists for these tests
        import edge.detector.fisura_detector as detector_module
        self._orig_cal_path = detector_module.CALIBRATION_PATH
        # Point to a non-existent path
        detector_module.CALIBRATION_PATH = Path("/nonexistent/calibration.json")

    def tearDown(self) -> None:
        import edge.detector.fisura_detector as detector_module
        detector_module.CALIBRATION_PATH = self._orig_cal_path

    def _make_detector(self) -> "OpenCvDetector":
        """Create an OpenCvDetector without calibration."""
        from edge.detector.fisura_detector import OpenCvDetector

        detector = OpenCvDetector()
        detector._load_calibration_scale()
        return detector

    def test_scale_unavailable(self) -> None:
        """Detector should report scale as unavailable."""
        detector = self._make_detector()
        self.assertFalse(detector._scale_available)
        self.assertIsNone(detector._pixels_per_mm)

    def test_fallback_uses_theoretical_ratio(self) -> None:
        """Without calibration, detector uses theoretical pixel_to_mm."""
        detector = self._make_detector()

        # Verify theoretical ratio was computed
        self.assertGreater(detector._pixel_to_mm, 0.0)
        self.assertFalse(detector._scale_available)

    def test_measurement_uses_fallback(self) -> None:
        """Measurement should produce results using fallback ratio."""
        detector = self._make_detector()

        cnt = _make_rect_contour(200, 50)
        result = detector._measure_contour(cnt)

        # Should produce valid measurements (not zero)
        self.assertGreater(result.length_mm, 0.0)
        self.assertGreater(result.width_mm, 0.0)
        self.assertGreater(result.area_mm2, 0.0)

    def test_fallback_logs_warning(self) -> None:
        """Fallback should log a WARNING when used."""
        detector = self._make_detector()

        # Capture log output
        with self.assertLogs("edge.detector.fisura_detector", level="WARNING") as cm:
            cnt = _make_rect_contour(100, 30)
            _ = detector._measure_contour(cnt)

        # Check WARNING was logged about theoretical ratio
        self.assertTrue(
            any("theoretical pixel-to-mm ratio" in msg for msg in cm.output),
            f"Expected WARNING about theoretical ratio, got: {cm.output}"
        )


if __name__ == "__main__":
    unittest.main()
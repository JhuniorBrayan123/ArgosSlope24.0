"""
ARGOS SLOPE 4.0 — Unit tests for calibrated measurement.

Tests the ``_measure_contour()`` method on ``OpenCvDetector`` with a
mock calibration file providing known pixels_per_mm.
Run with::

    python -m pytest edge/edge/tests/test_calibrated_measurement.py -v
"""

from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

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


class TestCalibratedMeasurement(unittest.TestCase):
    """Test mm measurement with calibration (pixels_per_mm)."""

    def setUp(self) -> None:
        # Create a temporary calibration.json with known pixels_per_mm
        self.tmpdir = Path(tempfile.mkdtemp(prefix="cal_measure_"))
        self.cal_data = {
            "pixels_per_mm": 10.0,  # 10 px = 1 mm
            "fx_px": 1400.0,
            "calibrated": True,
            "scale_detected": True,
        }
        self.cal_path = self.tmpdir / "calibration.json"
        with open(self.cal_path, "w") as f:
            json.dump(self.cal_data, f)

        # Patch the calibration path in the detector (module-level variable)
        import edge.detector.fisura_detector as detector_module
        self._orig_cal_path = detector_module.CALIBRATION_PATH
        detector_module.CALIBRATION_PATH = self.cal_path

    def tearDown(self) -> None:
        import shutil

        shutil.rmtree(self.tmpdir, ignore_errors=True)
        # Restore original calibration path
        import edge.detector.fisura_detector as detector_module
        detector_module.CALIBRATION_PATH = self._orig_cal_path

    def _make_detector(self) -> "OpenCvDetector":
        """Create an OpenCvDetector that loads our mock calibration."""
        from edge.detector.fisura_detector import OpenCvDetector

        detector = OpenCvDetector()
        # Force reload calibration
        detector._load_calibration_scale()
        return detector

    def test_width_measurement_calibrated(self) -> None:
        """Width in mm = area_mm2 / length_mm (derived from calibrated area & length)."""
        detector = self._make_detector()
        self.assertTrue(detector._scale_available)
        self.assertEqual(detector._pixels_per_mm, 10.0)

        # Rectangle 200 px wide × 50 px tall
        cnt = _make_rect_contour(200, 50)
        result = detector._measure_contour(cnt)

        # area_px = 200 * 50 = 10000
        # area_mm2 = 10000 / (10.0**2) = 100.0
        # length_px ≈ perimeter/2 = 2*(200+50)/2 = 250
        # length_mm = 250 / 10.0 = 25.0
        # width_mm = area_mm2 / length_mm = 100.0 / 25.0 = 4.0
        expected_width_mm = 4.0
        self.assertAlmostEqual(result.width_mm, expected_width_mm, places=1)

    def test_area_measurement_calibrated(self) -> None:
        """Area in mm² = area_px / (pixels_per_mm)²."""
        detector = self._make_detector()

        # Rectangle 200 × 50
        cnt = _make_rect_contour(200, 50)
        result = detector._measure_contour(cnt)

        # area_px = 200 * 50 = 10000
        # area_mm2 = 10000 / (10.0**2) = 100.0
        expected_area_mm2 = 10000 / 100.0
        self.assertAlmostEqual(result.area_mm2, expected_area_mm2, places=2)

    def test_length_measurement_calibrated(self) -> None:
        """Length in mm = perimeter_convex / 2 / pixels_per_mm."""
        detector = self._make_detector()

        # Rectangle 200 × 50 → perimeter ≈ 2*(200+50) = 500
        # length_px = 500 / 2 = 250
        # length_mm = 250 / 10.0 = 25.0
        cnt = _make_rect_contour(200, 50)
        result = detector._measure_contour(cnt)

        # Perimeter from convexHull of rectangle ≈ 2*(w+h)
        # With our points: (0,0), (200,0), (200,50), (0,50)
        # hull perimeter = 500
        expected_length_px = 250.0
        expected_length_mm = expected_length_px / 10.0
        self.assertAlmostEqual(result.length_mm, expected_length_mm, places=1)

    def test_width_calculation_consistency(self) -> None:
        """width_mm = area_mm2 / length_mm (when length_mm > 0)."""
        detector = self._make_detector()

        cnt = _make_rect_contour(200, 50)
        result = detector._measure_contour(cnt)

        if result.length_mm > 0:
            calculated_width = result.area_mm2 / result.length_mm
            self.assertAlmostEqual(result.width_mm, calculated_width, places=2)


if __name__ == "__main__":
    unittest.main()
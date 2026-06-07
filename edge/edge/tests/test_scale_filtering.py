"""
ARGOS SLOPE 4.0 — Unit tests for scale-aware contour filtering.

Tests the ``_check_min_size()`` method on ``OpenCvDetector`` with and
without a mock calibration file.
Run with::

    python -m pytest edge/edge/tests/test_scale_filtering.py -v
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


class TestScaleFilterFallbackPx(unittest.TestCase):
    """Test pixel-based fallback when no calibration is available."""

    def setUp(self) -> None:
        from edge.detector.fisura_detector import OpenCvDetector

        # Detector without scale — calibration.json won't be found
        self.detector = OpenCvDetector()
        # Ensure scale is unavailable
        self.detector._scale_available = False

    def test_large_contour_passes_px_fallback(self) -> None:
        """A large contour should pass the pixel fallback check."""
        cnt = _make_rect_contour(200, 100)
        passed, reason = self.detector._check_min_size(cnt)
        self.assertTrue(passed, f"Expected passed, got '{reason}'")

    def test_tiny_contour_rejected_px_fallback(self) -> None:
        """A tiny contour should be rejected by pixel fallback."""
        # boundingRect for points spanning 0..1 gives w=2, h=2
        cnt = _make_rect_contour(1, 1)
        passed, reason = self.detector._check_min_size(cnt)
        self.assertFalse(passed, "Tiny contour should be rejected")
        self.assertEqual(reason, "min_size_px")

    def test_narrow_but_tall_passes(self) -> None:
        """A narrow (small width) but tall contour may still pass."""
        cnt = _make_rect_contour(2, 100)
        passed, reason = self.detector._check_min_size(cnt)
        # width < filter_min_width_px (3) AND height < filter_min_length_px (30)
        # → height=100 >= 30, so it passes
        self.assertTrue(passed, f"Tall contour should pass, got '{reason}'")


class TestScaleFilterWithMockCalibration(unittest.TestCase):
    """Test mm-based filtering with a synthetic calibration file."""

    def setUp(self) -> None:
        # Create a temporary calibration.json with a known pixels_per_mm
        self.tmpdir = Path(tempfile.mkdtemp(prefix="scale_test_"))
        self.cal_data = {
            "pixels_per_mm": 10.0,  # 10 px = 1 mm
            "calibrated": True,
            "scale_detected": True,
        }
        self.cal_path = self.tmpdir / "calibration.json"
        with open(self.cal_path, "w") as f:
            json.dump(self.cal_data, f)

    def tearDown(self) -> None:
        import shutil

        shutil.rmtree(self.tmpdir, ignore_errors=True)

    def _make_detector_with_scale(self, ppmm: float) -> "OpenCvDetector":
        """Create an OpenCvDetector with a mocked scale."""
        from edge.detector.fisura_detector import OpenCvDetector

        detector = OpenCvDetector()
        detector._pixels_per_mm = ppmm
        detector._scale_available = True
        return detector

    def test_large_contour_passes_mm(self) -> None:
        """A contour large in mm terms should pass."""
        detector = self._make_detector_with_scale(10.0)
        # 200 px × 100 px → 20 mm × 10 mm
        cnt = _make_rect_contour(200, 100)
        passed, reason = detector._check_min_size(cnt)
        self.assertTrue(passed, f"Expected passed, got '{reason}'")

    def test_sub_mm_contour_rejected(self) -> None:
        """A contour smaller than min thresholds in mm should be rejected."""
        detector = self._make_detector_with_scale(10.0)
        # 2 px × 2 px → 0.2 mm × 0.2 mm
        cnt = _make_rect_contour(2, 2)
        passed, reason = detector._check_min_size(cnt)
        self.assertFalse(passed, "Sub-mm contour should be rejected")
        self.assertEqual(reason, "min_size_mm")

    def test_wide_but_short_passes_mm(self) -> None:
        """A wide contour (exceeds min_width_mm) passes even if short."""
        detector = self._make_detector_with_scale(10.0)
        # 100 px → 10 mm width, 1 px → 0.1 mm height
        # width_mm=10 >= 0.5 → passes (AND condition fails)
        cnt = _make_rect_contour(100, 1)
        passed, reason = detector._check_min_size(cnt)
        self.assertTrue(passed, f"Wide contour should pass, got '{reason}'")


if __name__ == "__main__":
    unittest.main()

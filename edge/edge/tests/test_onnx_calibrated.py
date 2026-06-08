"""
ARGOS SLOPE 4.0 — Unit tests for ONNX detector calibration loading.

Tests that ``OnnxDetector`` loads calibration and uses calibrated ratio.
Since onnxruntime is not installed in test env, we test the calibration
loading logic directly without running inference.
Run with::

    python -m pytest edge/edge/tests/test_onnx_calibrated.py -v
"""

from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

import numpy as np


def _make_rect_contour(w: int, h: int) -> np.ndarray:
    """Build a rectangular contour of given width and height."""
    pts = [
        (0, 0),
        (w, 0),
        (w, h),
        (0, h),
    ]
    return np.array(pts, dtype=np.int32).reshape((-1, 1, 2))


class TestOnnxCalibrationLoading(unittest.TestCase):
    """Test ONNX detector calibration loading logic."""

    def setUp(self) -> None:
        # Create a temporary calibration.json
        self.tmpdir = Path(tempfile.mkdtemp(prefix="onnx_cal_"))
        self.cal_data = {
            "pixels_per_mm": 8.0,
            "fx_px": 1200.0,
            "calibrated": True,
            "scale_detected": True,
        }
        self.cal_path = self.tmpdir / "calibration.json"
        with open(self.cal_path, "w") as f:
            json.dump(self.cal_data, f)

        # Patch the calibration path
        import edge.detector.fisura_detector as detector_module
        self._orig_cal_path = detector_module.CALIBRATION_PATH
        detector_module.CALIBRATION_PATH = self.cal_path

    def tearDown(self) -> None:
        import shutil

        shutil.rmtree(self.tmpdir, ignore_errors=True)
        import edge.detector.fisura_detector as detector_module
        detector_module.CALIBRATION_PATH = self._orig_cal_path

    def test_onnx_loads_calibration(self) -> None:
        """OnnxDetector should load pixels_per_mm from calibration.json."""
        from edge.detector.fisura_detector import OnnxDetector

        # Create detector WITHOUT loading model (will fail gracefully)
        detector = OnnxDetector.__new__(OnnxDetector)
        detector._model_path = "fake_model.onnx"
        detector._confidence = 0.5
        detector._session = None
        detector._input_name = None
        detector._pixel_to_mm = 1.0  # fallback
        detector._fallback = None  # will be set in __init__ but we skip
        detector._pixels_per_mm = None
        detector._scale_available = False
        detector._fx_px = None
        detector._load_calibration_scale()

        # Verify calibration loaded
        self.assertTrue(detector._scale_available)
        self.assertEqual(detector._pixels_per_mm, 8.0)
        self.assertEqual(detector._fx_px, 1200.0)

    def test_onnx_fallback_when_no_calibration(self) -> None:
        """OnnxDetector without calibration should have scale_unavailable."""
        import edge.detector.fisura_detector as detector_module
        original_path = detector_module.CALIBRATION_PATH
        detector_module.CALIBRATION_PATH = Path("/nonexistent/calibration.json")

        try:
            from edge.detector.fisura_detector import OnnxDetector

            detector = OnnxDetector.__new__(OnnxDetector)
            detector._model_path = "fake_model.onnx"
            detector._confidence = 0.5
            detector._session = None
            detector._input_name = None
            detector._pixel_to_mm = 1.0
            detector._fallback = None
            detector._pixels_per_mm = None
            detector._scale_available = False
            detector._fx_px = None
            detector._load_calibration_scale()

            self.assertFalse(detector._scale_available)
            self.assertIsNone(detector._pixels_per_mm)
        finally:
            detector_module.CALIBRATION_PATH = original_path


if __name__ == "__main__":
    unittest.main()
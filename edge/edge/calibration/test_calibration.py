"""
ARGOS SLOPE 4.0 — Offline unit tests for the calibration module.

Tests use synthetic patterns (no physical camera or printed markers
required). Run with::

    python -m pytest edge/edge/calibration/test_calibration.py -v

Or directly::

    python -m edge.calibration.test_calibration
"""

from __future__ import annotations

import json
import logging
import tempfile
import unittest
from pathlib import Path

import cv2
import numpy as np

from edge.calibration.calibrate_camera import CameraCalibrator
from edge.calibration.detect_aruco_scale import ArucoScaleDetector
from edge.calibration.calibration_service import CalibrationService
from edge.calibration.generate_test_patterns import (
    generate_aruco_marker,
    generate_calibration_set,
    generate_checkerboard,
    generate_distorted_checkerboard,
)

logger = logging.getLogger(__name__)

# ── Helpers ────────────────────────────────────────────────────────────


def _save_image(img: np.ndarray, path: Path) -> Path:
    """Helper to save an image and return the path."""
    cv2.imwrite(str(path), img)
    return path


# ── Tests ──────────────────────────────────────────────────────────────


class TestCameraCalibrator(unittest.TestCase):
    """Tests for CameraCalibrator using synthetic checkerboard images."""

    def setUp(self) -> None:
        self.calibrator = CameraCalibrator()
        self.tmpdir = Path(tempfile.mkdtemp(prefix="calib_test_"))
        self.pattern_size = (9, 6)
        # Use a square size that produces boards of ~500-800 px across
        # so findChessboardCorners can always detect them
        self.square_size_px = 60
        self.image_size = (960, 640)

    def tearDown(self) -> None:
        import shutil

        shutil.rmtree(self.tmpdir, ignore_errors=True)

    def test_find_checkerboard(self) -> None:
        """Generate a synthetic checkerboard and verify corners are found."""
        img = generate_checkerboard(
            pattern_size=self.pattern_size,
            square_size_px=self.square_size_px,
        )
        corners = CameraCalibrator.find_checkerboard(img, self.pattern_size)
        self.assertIsNotNone(corners, "Should find checkerboard corners")
        expected_corners = self.pattern_size[0] * self.pattern_size[1]
        self.assertEqual(
            len(corners),
            expected_corners,
            f"Should find {expected_corners} corners",
        )

    def test_find_checkerboard_no_board(self) -> None:
        """A blank image should return None."""
        blank = np.ones((480, 640), dtype=np.uint8) * 128
        corners = CameraCalibrator.find_checkerboard(blank, self.pattern_size)
        self.assertIsNone(corners, "Blank image should not have checkerboard")

    def test_calibrate_from_images(self) -> None:
        """
        Generate a distorted calibration set, run calibration, and verify
        that the reprojection error is below 1.0 pixel.
        """
        calib_set = generate_calibration_set(
            output_dir=self.tmpdir / "calib_set",
            count=12,
            pattern_size=self.pattern_size,
            square_size_px=self.square_size_px,
            image_size=self.image_size,
            seed=42,
        )

        rms = self.calibrator.calibrate_from_images(
            image_paths=calib_set,
            pattern_size=self.pattern_size,
            square_size_mm=25.0,
        )

        self.assertLess(
            rms, 5.0,
            f"Reprojection error should be < 5.0 px for synthetic data (got {rms:.4f})",
        )
        self.assertIsNotNone(self.calibrator.camera_matrix)
        self.assertIsNotNone(self.calibrator.distortion_coefficients)
        self.assertGreater(self.calibrator.get_focal_length_px(), 0)

    def test_calibrate_too_few_images(self) -> None:
        """Calibration with < 3 valid images should raise ValueError."""
        img = generate_checkerboard(self.pattern_size, self.square_size_px)
        path = _save_image(img, self.tmpdir / "single.png")

        with self.assertRaises(ValueError):
            self.calibrator.calibrate_from_images(
                image_paths=[path],
                pattern_size=self.pattern_size,
                square_size_mm=25.0,
            )

    def test_save_load_calibration(self) -> None:
        """Save calibration state and verify it loads back correctly."""
        calib_set = generate_calibration_set(
            output_dir=self.tmpdir / "calib_save_load",
            count=10,
            pattern_size=self.pattern_size,
            square_size_px=self.square_size_px,
            image_size=self.image_size,
            seed=123,
        )
        self.calibrator.calibrate_from_images(
            calib_set, self.pattern_size, 25.0
        )

        cal_path = self.tmpdir / "calib_out.json"
        self.calibrator.save_calibration(cal_path)
        self.assertTrue(cal_path.exists(), "Calibration file should exist")

        # Load into a fresh calibrator
        fresh = CameraCalibrator()
        ok = fresh.load_calibration(cal_path)
        self.assertTrue(ok, "Should load calibration successfully")

        self.assertIsNotNone(fresh.camera_matrix)
        self.assertIsNotNone(fresh.distortion_coefficients)
        fx_orig = self.calibrator.get_focal_length_px()
        fx_fresh = fresh.get_focal_length_px()
        self.assertAlmostEqual(fx_orig, fx_fresh, delta=0.01)

    def test_undistort(self) -> None:
        """
        Verify that undistort_image returns an image of the same size
        as the input.
        """
        calib_set = generate_calibration_set(
            output_dir=self.tmpdir / "undistort",
            count=10,
            pattern_size=self.pattern_size,
            square_size_px=self.square_size_px,
            image_size=self.image_size,
            seed=42,
        )
        self.calibrator.calibrate_from_images(
            calib_set, self.pattern_size, 25.0
        )

        # Load a distorted image and undistort it
        test_img = cv2.imread(str(calib_set[0]))
        undistorted = self.calibrator.undistort_image(test_img)

        self.assertEqual(
            test_img.shape, undistorted.shape,
            "Undistorted image shape should match input",
        )
        self.assertEqual(
            test_img.dtype, undistorted.dtype,
            "Undistorted image dtype should match input",
        )

    def test_undistort_without_calibration_raises(self) -> None:
        """Calling undistort without calibration should raise RuntimeError."""
        with self.assertRaises(RuntimeError):
            self.calibrator.undistort_image(
                np.zeros((100, 100, 3), dtype=np.uint8)
            )


class TestArucoScaleDetector(unittest.TestCase):
    """Tests for ArucoScaleDetector using synthetic markers."""

    def setUp(self) -> None:
        self.detector = ArucoScaleDetector(marker_id=0, marker_size_mm=100.0)

    def test_detect_aruco_marker(self) -> None:
        """Generate an ArUco marker and verify it is detected correctly."""
        marker_img = generate_aruco_marker(
            marker_id=0,
            dictionary=cv2.aruco.DICT_6X6_250,
            size_px=300,
        )
        # The detector expects a BGR image
        bgr = cv2.cvtColor(marker_img, cv2.COLOR_GRAY2BGR)
        corners = self.detector.detect_marker(bgr, marker_id=0)
        self.assertIsNotNone(corners, "Should detect the ArUco marker")
        self.assertEqual(
            corners.shape, (4, 2),
            "Should return 4 corner coordinates",
        )

    def test_detect_wrong_id(self) -> None:
        """A marker with a different ID should not be detected."""
        marker_img = generate_aruco_marker(
            marker_id=5,
            dictionary=cv2.aruco.DICT_6X6_250,
            size_px=300,
        )
        bgr = cv2.cvtColor(marker_img, cv2.COLOR_GRAY2BGR)
        corners = self.detector.detect_marker(bgr, marker_id=0)
        self.assertIsNone(corners, "Should not detect marker ID=0 when ID=5 is present")

    def test_compute_scale(self) -> None:
        """Verify that compute_scale returns a reasonable value."""
        marker_img = generate_aruco_marker(
            marker_id=0,
            dictionary=cv2.aruco.DICT_6X6_250,
            size_px=300,
        )
        bgr = cv2.cvtColor(marker_img, cv2.COLOR_GRAY2BGR)
        corners = self.detector.detect_marker(bgr, marker_id=0)
        self.assertIsNotNone(corners)

        # The marker is 300 px across, so at 100 mm scale, ppmm ≈ 3.0
        ppmm = self.detector.compute_scale(corners, marker_size_mm=100.0)
        self.assertAlmostEqual(ppmm, 3.0, delta=0.2)

    def test_pixels_to_mm(self) -> None:
        """Test pixel-to-mm conversion with a known scale."""
        self.detector.pixels_per_mm = 2.5
        result = self.detector.pixels_to_mm(100.0)
        self.assertAlmostEqual(result, 40.0, places=4)

    def test_pixels_to_mm_without_scale_raises(self) -> None:
        """Calling pixels_to_mm without compute_scale should raise."""
        with self.assertRaises(RuntimeError):
            self.detector.pixels_to_mm(50.0)

    def test_estimate_distance(self) -> None:
        """Verify distance estimation from a known marker."""
        marker_img = generate_aruco_marker(
            marker_id=0,
            dictionary=cv2.aruco.DICT_6X6_250,
            size_px=300,
        )
        bgr = cv2.cvtColor(marker_img, cv2.COLOR_GRAY2BGR)
        corners = self.detector.detect_marker(bgr, marker_id=0)
        self.assertIsNotNone(corners)

        # Focal length chosen so that the distance is meaningful
        distance = self.detector.estimate_distance(
            focal_length_px=800.0,
            marker_size_mm=100.0,
            marker_corners=corners,
        )
        self.assertGreater(distance, 0, "Distance should be positive")
        self.assertLess(distance, 10, "Distance should be reasonable (< 10 m)")

    def test_draw_marker(self) -> None:
        """draw_marker should not crash and return same shape image."""
        marker_img = generate_aruco_marker(
            marker_id=0, dictionary=cv2.aruco.DICT_6X6_250, size_px=300
        )
        bgr = cv2.cvtColor(marker_img, cv2.COLOR_GRAY2BGR)
        corners = self.detector.detect_marker(bgr, marker_id=0)
        self.assertIsNotNone(corners)

        drawn = self.detector.draw_marker(bgr, corners)
        self.assertEqual(drawn.shape, bgr.shape)
        # The drawn image should have some green pixels (the outline)
        self.assertTrue(np.any(drawn[:, :, 1] > 0), "Should have green outline")


class TestCalibrationService(unittest.TestCase):
    """Tests for CalibrationService — full pipeline."""

    def setUp(self) -> None:
        self.tmpdir = Path(tempfile.mkdtemp(prefix="calib_service_test_"))
        self.pattern_size = (9, 6)
        self.square_size_px = 80

    def tearDown(self) -> None:
        import shutil

        shutil.rmtree(self.tmpdir, ignore_errors=True)

    def _make_calibration_set(self) -> Path:
        """Helper: generate a calibration set directory."""
        cal_dir = self.tmpdir / "checkerboard"
        generate_calibration_set(
            output_dir=cal_dir,
            count=12,
            pattern_size=self.pattern_size,
            square_size_px=self.square_size_px,
            image_size=(960, 640),
            seed=42,
        )
        return cal_dir

    def _make_aruco_image(self) -> Path:
        """Helper: generate an image with an ArUco marker."""
        marker = generate_aruco_marker(
            marker_id=0,
            dictionary=cv2.aruco.DICT_6X6_250,
            size_px=300,
        )
        # Place the marker on a plain background
        bg = np.ones((640, 960, 3), dtype=np.uint8) * 200
        marker_bgr = cv2.cvtColor(marker, cv2.COLOR_GRAY2BGR)
        y_off = (640 - 300) // 2
        x_off = (960 - 300) // 2
        bg[y_off : y_off + 300, x_off : x_off + 300] = marker_bgr
        path = self.tmpdir / "aruco_scene.png"
        cv2.imwrite(str(path), bg)
        return path

    def test_status_defaults(self) -> None:
        """A fresh service should report not calibrated."""
        cal_path = self.tmpdir / "custom_calibration.json"
        service = CalibrationService(calibration_path=cal_path)
        status = service.status()
        self.assertFalse(status["calibrated"])
        self.assertFalse(status["scale_detected"])
        self.assertIsNone(status["camera_matrix"])

    def test_full_calibration(self) -> None:
        """
        Run the full calibration pipeline and verify that both camera and
        scale calibration complete successfully.
        """
        cal_dir = self._make_calibration_set()
        aruco_img = self._make_aruco_image()

        cal_path = self.tmpdir / "full_calibration.json"
        service = CalibrationService(calibration_path=cal_path)

        status = service.run_full_calibration(
            checkerboard_dir=cal_dir,
            pattern_size=self.pattern_size,
            square_size_mm=25.0,
            aruco_image=aruco_img,
            marker_id=0,
            marker_size_mm=100.0,
        )

        self.assertTrue(status["calibrated"])
        self.assertTrue(status["scale_detected"])
        self.assertIsNotNone(status["camera_matrix"])
        self.assertIsNotNone(status["pixels_per_mm"])
        self.assertIsNotNone(status["calibration_date"])
        self.assertGreater(status["fx_px"], 0)

    def test_persistence(self) -> None:
        """
        Verify that calibration state persists across service instances.
        """
        cal_dir = self._make_calibration_set()
        aruco_img = self._make_aruco_image()

        cal_path = self.tmpdir / "persist_calibration.json"

        # First instance: run calibration
        service1 = CalibrationService(calibration_path=cal_path)
        service1.run_full_calibration(
            checkerboard_dir=cal_dir,
            pattern_size=self.pattern_size,
            square_size_mm=25.0,
            aruco_image=aruco_img,
            marker_id=0,
            marker_size_mm=100.0,
        )

        # Second instance: load from file
        service2 = CalibrationService(calibration_path=cal_path)
        self.assertTrue(service2.calibrated)
        self.assertTrue(service2.scale_detected)
        self.assertIsNotNone(service2.calibrator.camera_matrix)
        self.assertIsNotNone(service2.aruco.pixels_per_mm)

        # Match values
        fx1 = service1.calibrator.get_focal_length_px()
        fx2 = service2.calibrator.get_focal_length_px()
        self.assertAlmostEqual(fx1, fx2, delta=0.01)

    def test_quick_scale_from_aruco(self) -> None:
        """
        Quick scale detection should work if a camera matrix is already loaded.
        """
        cal_dir = self._make_calibration_set()
        aruco_img = self._make_aruco_image()

        cal_path = self.tmpdir / "quick_calibration.json"
        # First run full to get camera data
        service = CalibrationService(calibration_path=cal_path)
        service.run_full_calibration(
            checkerboard_dir=cal_dir,
            pattern_size=self.pattern_size,
            square_size_mm=25.0,
        )

        # Now reset scale and use quick_scale
        service.scale_detected = False
        service.aruco.pixels_per_mm = None

        status = service.quick_scale_from_aruco(
            aruco_image=aruco_img,
            marker_size_mm=100.0,
            marker_id=0,
        )
        self.assertTrue(status["scale_detected"])
        self.assertIsNotNone(status["pixels_per_mm"])

    def test_missing_checkerboard_dir_raises(self) -> None:
        """Non-existent directory should raise NotADirectoryError."""
        service = CalibrationService(
            calibration_path=self.tmpdir / "error_cal.json"
        )
        with self.assertRaises(NotADirectoryError):
            service.run_full_calibration(
                checkerboard_dir="/nonexistent/path",
            )


class TestRealWorldIntegration(unittest.TestCase):
    """
    Integration-like tests that use the calibration.json template file
    to verify the JSON schema matches what the service produces.
    """

    def test_default_json_loads_correctly(self) -> None:
        """The default calibration.json should load without errors."""
        json_path = Path(__file__).parent / "calibration.json"
        self.assertTrue(json_path.exists(), "calibration.json should exist")

        with open(json_path, "r") as f:
            data = json.load(f)

        # Verify schema keys
        expected_keys = {
            "calibration_date", "camera_matrix", "distortion_coefficients",
            "fx_px", "fy_px", "cx_px", "cy_px", "reprojection_error",
            "image_width", "image_height", "pattern_size", "square_size_mm",
            "marker_id", "marker_size_mm", "pixels_per_mm", "aruco_distance_m",
            "calibrated", "scale_detected",
        }
        self.assertEqual(set(data.keys()), expected_keys)
        self.assertFalse(data["calibrated"])
        self.assertFalse(data["scale_detected"])
        self.assertEqual(data["pattern_size"], [9, 6])
        self.assertEqual(data["square_size_mm"], 25.0)

    def test_generated_checkerboard_is_detectable(self) -> None:
        """A synthetic checkerboard must be detectable by find_checkerboard."""
        img = generate_checkerboard((9, 6), 100)
        corners = CameraCalibrator.find_checkerboard(img, (9, 6))
        self.assertIsNotNone(corners)
        self.assertEqual(len(corners), 54)  # 9*6


# ── Entry point ────────────────────────────────────────────────────────

if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    unittest.main()

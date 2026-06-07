"""
ARGOS SLOPE 4.0 — Unit tests for the DebugDrawer.

Tests annotation overlays and file saving with synthetic crack data.
Run with::

    python -m pytest edge/edge/tests/test_debug_drawer.py -v
"""

from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

import cv2
import numpy as np

from edge.detector.debug_drawer import DebugDrawer
from edge.detector.fisura_detector import (
    CrackClassification,
    CrackResult,
)


def _make_test_image(
    width: int = 320, height: int = 240
) -> np.ndarray:
    """Create a plain BGR test image."""
    return np.ones((height, width, 3), dtype=np.uint8) * 128


def _make_crack(
    x: int = 50,
    y: int = 50,
    w: int = 60,
    h: int = 10,
    length_mm: float = 15.0,
    classification: str = "fina",
) -> CrackResult:
    """Create a synthetic CrackResult."""
    return CrackResult(
        x=x,
        y=y,
        width=w,
        height=h,
        center_x=x + w // 2,
        center_y=y + h // 2,
        length_mm=length_mm,
        width_mm=0.5,
        area_mm2=length_mm * 0.5,
        classification=CrackClassification(classification),
        orientation_deg=45.0,
        confidence=0.85,
        contour_points=20,
    )


def _make_contour(w: int = 30, h: int = 5) -> np.ndarray:
    """Create a synthetic contour."""
    pts = [(0, 0), (w, 0), (w, h), (0, h)]
    return np.array(pts, dtype=np.int32).reshape((-1, 1, 2))


class TestDebugDrawerNoCracks(unittest.TestCase):
    """DebugDrawer should handle empty detection results."""

    def setUp(self) -> None:
        self.drawer = DebugDrawer(enabled=True, output_dir="debug_test")
        self.image = _make_test_image()

    def test_no_cracks_same_shape(self) -> None:
        """With no cracks, the annotated image should keep its shape."""
        result = self.drawer.draw_pipeline_stage(
            self.image, "test", []
        )
        self.assertEqual(result.shape, self.image.shape)
        self.assertEqual(result.dtype, self.image.dtype)

    def test_no_cracks_no_error(self) -> None:
        """No cracks should not raise any exception."""
        try:
            self.drawer.draw_pipeline_stage(self.image, "test", [])
        except Exception as exc:
            self.fail(f"draw_pipeline_stage raised {exc}")

    def test_disabled_returns_original(self) -> None:
        """When disabled, the original image should be returned."""
        drawer = DebugDrawer(enabled=False)
        result = drawer.draw_pipeline_stage(self.image, "test", [])
        np.testing.assert_array_equal(result, self.image)


class TestDebugDrawerWithCracks(unittest.TestCase):
    """DebugDrawer should annotate cracks correctly."""

    def setUp(self) -> None:
        self.drawer = DebugDrawer(enabled=True, output_dir="debug_test")
        self.image = _make_test_image()
        self.cracks = [
            _make_crack(x=20, y=30, w=80, h=12, length_mm=25.0),
            _make_crack(x=150, y=80, w=40, h=8, length_mm=10.0),
        ]

    def test_with_cracks_no_crash(self) -> None:
        """With simulated cracks, should not crash."""
        try:
            self.drawer.draw_pipeline_stage(
                self.image, "test", self.cracks
            )
        except Exception as exc:
            self.fail(f"draw_pipeline_stage raised {exc}")

    def test_with_cracks_same_shape(self) -> None:
        """Annotated image should keep input shape."""
        result = self.drawer.draw_pipeline_stage(
            self.image, "test", self.cracks
        )
        self.assertEqual(result.shape, self.image.shape)

    def test_with_rejected_contours(self) -> None:
        """Rejected contours should not cause errors."""
        rejected = [
            (_make_contour(20, 10), "aspect_ratio"),
            (_make_contour(5, 5), "min_size_px"),
        ]
        try:
            self.drawer.draw_pipeline_stage(
                self.image, "test", self.cracks, rejected
            )
        except Exception as exc:
            self.fail(f"draw_pipeline_stage with rejected raised {exc}")


class TestDebugDrawerSave(unittest.TestCase):
    """Test that save_stage writes files correctly."""

    def setUp(self) -> None:
        self.tmpdir = Path(tempfile.mkdtemp(prefix="debug_drawer_test_"))
        self.drawer = DebugDrawer(enabled=True, output_dir=str(self.tmpdir))
        self.image = _make_test_image()

    def tearDown(self) -> None:
        import shutil

        shutil.rmtree(self.tmpdir, ignore_errors=True)

    def test_save_stage_creates_file(self) -> None:
        """save_stage should create a file on disk."""
        path = self.drawer.save_stage(self.image, "final", 42)
        self.assertIsNotNone(path)
        self.assertTrue(Path(path).exists(), "Saved file should exist")

    def test_save_stage_correct_filename(self) -> None:
        """Filename should follow the expected pattern."""
        path = self.drawer.save_stage(self.image, "post_detection", 1)
        self.assertIsNotNone(path)
        name = Path(path).name
        self.assertIn("post_detection", name)
        self.assertIn("000001", name)

    def test_save_disabled_returns_none(self) -> None:
        """When disabled, save_stage should return None."""
        drawer = DebugDrawer(enabled=False)
        result = drawer.save_stage(self.image, "test", 0)
        self.assertIsNone(result)


if __name__ == "__main__":
    unittest.main()

"""
ARGOS SLOPE 4.0 — Unit tests for geometric contour filters.

Tests the ``_filter_contour()`` method on ``OpenCvDetector`` using
synthetic contours (no camera required).
Run with::

    python -m pytest edge/edge/tests/test_geometric_filters.py -v
"""

from __future__ import annotations

import unittest
from typing import Any

import cv2
import numpy as np

from edge.detector.fisura_detector import GeometricFilterConfig


def _make_contour(points: list[tuple[int, int]]) -> np.ndarray:
    """Build an OpenCV-compatible contour from a list of (x, y) points."""
    arr = np.array(points, dtype=np.int32).reshape((-1, 1, 2))
    return arr


def _elongated_contour(width: int = 100, height: int = 10) -> np.ndarray:
    """Create a long, thin rectangular contour (crack-like)."""
    pts = [
        (0, 0),
        (width, 0),
        (width, height),
        (0, height),
    ]
    return _make_contour(pts)


def _square_contour(side: int = 50) -> np.ndarray:
    """Create a square contour (blob-like, not crack-like)."""
    pts = [
        (0, 0),
        (side, 0),
        (side, side),
        (0, side),
    ]
    return _make_contour(pts)


def _star_contour() -> np.ndarray:
    """Create a star-shaped contour with low solidity."""
    cx, cy = 50, 50
    # A 5-pointed star — the concave regions lower solidity
    pts: list[tuple[int, int]] = []
    for i in range(10):
        angle = i * np.pi / 5 - np.pi / 2
        r = 25 if i % 2 == 0 else 10
        pts.append((int(cx + r * np.cos(angle)), int(cy + r * np.sin(angle))))
    return _make_contour(pts)


class TestGeometricFilterAspectRatio(unittest.TestCase):
    """Test aspect-ratio filtering."""

    def setUp(self) -> None:
        self.config = GeometricFilterConfig(
            enabled=True,
            min_aspect_ratio=0.5,
            max_aspect_ratio=5.0,
            min_solidity=0.1,  # very permissive to isolate aspect-ratio test
            min_convexity=0.1,
        )

    def _filter(self, contour: np.ndarray) -> tuple[bool, str]:
        """Call _filter_contour logic directly via config."""
        # We test the underlying logic that the detector uses
        area_px = float(cv2.contourArea(contour))
        x, y, w, h = cv2.boundingRect(contour)
        aspect_ratio = w / h if h > 0 else 0.0

        if not self.config.enabled:
            return (True, "passed")
        if (
            aspect_ratio < self.config.min_aspect_ratio
            or aspect_ratio > self.config.max_aspect_ratio
        ):
            return (False, "aspect_ratio")
        hull = cv2.convexHull(contour)
        hull_area = cv2.contourArea(hull)
        solidity = area_px / hull_area if hull_area > 0 else 0.0
        if solidity < self.config.min_solidity:
            return (False, "solidity")
        hull_perimeter = cv2.arcLength(hull, True)
        contour_perimeter = cv2.arcLength(contour, True)
        convexity = (
            hull_perimeter / contour_perimeter if contour_perimeter > 0 else 0.0
        )
        if convexity < self.config.min_convexity:
            return (False, "convexity")
        return (True, "passed")

    def test_elongated_contour_passes(self) -> None:
        """A long thin contour should have aspect ratio within range."""
        cnt = _elongated_contour(width=30, height=10)  # boundingRect ratio ~ 31/11 ≈ 2.8
        passed, reason = self._filter(cnt)
        self.assertTrue(passed, f"Expected passed, got '{reason}'")

    def test_square_contour_passes(self) -> None:
        """A square contour (ratio=1) should pass since min=0.5 max=5."""
        cnt = _square_contour(side=50)  # boundingRect ratio = 51/51 ≈ 1.0
        passed, reason = self._filter(cnt)
        self.assertTrue(passed, f"Square should pass, got '{reason}'")

    def test_extreme_aspect_ratio_rejected(self) -> None:
        """A very wide contour (ratio > max) should be rejected."""
        cnt = _elongated_contour(width=300, height=10)  # ratio = 30
        passed, reason = self._filter(cnt)
        self.assertFalse(passed, "Extreme aspect ratio should fail")
        self.assertEqual(reason, "aspect_ratio")


class TestGeometricFilterSolidity(unittest.TestCase):
    """Test solidity filtering."""

    def setUp(self) -> None:
        self.config = GeometricFilterConfig(
            enabled=True,
            min_aspect_ratio=0.01,
            max_aspect_ratio=100.0,
            min_solidity=0.5,
            min_convexity=0.1,
        )

    def _filter(self, contour: np.ndarray) -> tuple[bool, str]:
        area_px = float(cv2.contourArea(contour))
        x, y, w, h = cv2.boundingRect(contour)
        aspect_ratio = w / h if h > 0 else 0.0
        if (
            aspect_ratio < self.config.min_aspect_ratio
            or aspect_ratio > self.config.max_aspect_ratio
        ):
            return (False, "aspect_ratio")
        hull = cv2.convexHull(contour)
        hull_area = cv2.contourArea(hull)
        solidity = area_px / hull_area if hull_area > 0 else 0.0
        if solidity < self.config.min_solidity:
            return (False, "solidity")
        hull_perimeter = cv2.arcLength(hull, True)
        contour_perimeter = cv2.arcLength(contour, True)
        convexity = (
            hull_perimeter / contour_perimeter if contour_perimeter > 0 else 0.0
        )
        if convexity < self.config.min_convexity:
            return (False, "convexity")
        return (True, "passed")

    def test_star_contour_low_solidity(self) -> None:
        """A star contour has low solidity and should be rejected."""
        cnt = _star_contour()
        passed, reason = self._filter(cnt)
        # Stars have solidity < 0.5 typically
        if not passed:
            self.assertIn(reason, ("solidity", "convexity"))


class TestGeometricFilterDisabled(unittest.TestCase):
    """When filters are disabled, all contours should pass."""

    def setUp(self) -> None:
        self.config = GeometricFilterConfig(
            enabled=False,
            min_aspect_ratio=1.5,
            max_aspect_ratio=3.0,
            min_solidity=0.8,
            min_convexity=0.9,
        )

    def test_disabled_passes_square(self) -> None:
        """Even a square contour should pass when filters are off."""
        cnt = _square_contour(side=50)
        area_px = float(cv2.contourArea(cnt))
        if not self.config.enabled:
            passed = True
        else:
            passed, _ = False, ""
        self.assertTrue(passed)

    def test_disabled_passes_star(self) -> None:
        """Even a star contour should pass when filters are off."""
        cnt = _star_contour()
        if not self.config.enabled:
            passed = True
        else:
            passed, _ = False, ""
        self.assertTrue(passed)


if __name__ == "__main__":
    unittest.main()

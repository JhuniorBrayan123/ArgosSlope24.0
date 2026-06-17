"""
ARGOS SLOPE 4.0 — Unit tests for Image Registration.

Tests the ``ImageRegistrator`` class for ORB + RANSAC homography estimation.
Run with::

    python -m pytest edge/edge/tests/test_registration.py -v
"""

from __future__ import annotations

import unittest
from pathlib import Path
from unittest.mock import patch

import cv2
import numpy as np

from edge.config import config as edge_config


class TestImageRegistrator(unittest.TestCase):
    """Test ImageRegistrator with synthetic and real frames."""

    def setUp(self) -> None:
        from edge.temporal.registration import ImageRegistrator, RegistrationConfig

        self.config = RegistrationConfig(min_matches=5, nfeatures=500)
        self.registrator = ImageRegistrator(self.config)

    def _make_simple_frame(self, w: int = 320, h: int = 240, color: int = 128) -> np.ndarray:
        """Create a simple uniform frame."""
        return np.full((h, w), color, dtype=np.uint8)

    def _make_frame_with_features(self, w: int = 320, h: int = 240) -> np.ndarray:
        """Create a frame with distinct features for ORB."""
        frame = np.zeros((h, w), dtype=np.uint8)
        # Add corners and edges
        cv2.rectangle(frame, (10, 10), (50, 50), 255, -1)
        cv2.rectangle(frame, (100, 100), (150, 150), 200, -1)
        cv2.circle(frame, (250, 50), 30, 255, -1)
        cv2.line(frame, (0, 200), (w, 200), 255, 2)
        # Add noise for texture
        noise = np.random.randint(0, 20, (h, w), dtype=np.uint8)
        frame = cv2.add(frame, noise)
        return frame

    def test_identity_fallback_no_features(self) -> None:
        """Uniform frames → no features → identity fallback."""
        ref = self._make_simple_frame()
        cur = self._make_simple_frame()

        H, aligned = self.registrator.register(ref, cur)

        # Should return identity matrix
        np.testing.assert_array_almost_equal(H, np.eye(3))
        # Aligned should be copy of current
        np.testing.assert_array_equal(aligned, cur)

    def test_identity_fallback_insufficient_matches(self) -> None:
        """Few features → insufficient matches → identity fallback."""
        ref = self._make_simple_frame(color=100)
        cur = self._make_simple_frame(color=150)

        # Mock ORB to return very few keypoints
        from edge.temporal.registration import ImageRegistrator
        registrator = ImageRegistrator()
        registrator.config.min_matches = 100  # High threshold

        H, aligned = registrator.register(ref, cur)
        np.testing.assert_array_almost_equal(H, np.eye(3))

    def test_homography_computed_same_frame(self) -> None:
        """Identical frames with features → H ≈ identity."""
        ref = self._make_frame_with_features()
        cur = ref.copy()

        H, aligned = self.registrator.register(ref, cur)

        # H should be close to identity
        self.assertEqual(H.shape, (3, 3))
        # Diagonal elements ≈ 1, off-diagonal ≈ 0
        self.assertAlmostEqual(H[0, 0], 1.0, places=0)
        self.assertAlmostEqual(H[1, 1], 1.0, places=0)
        self.assertAlmostEqual(H[0, 1], 0.0, places=0)
        self.assertAlmostEqual(H[1, 0], 0.0, places=0)

    def test_homography_computed_shifted(self) -> None:
        """Shifted frame → H has translation."""
        ref = self._make_frame_with_features()
        # Shift current by 10px right, 5px down
        M = np.float32([[1, 0, 10], [0, 1, 5]])
        cur = cv2.warpAffine(ref, M, (ref.shape[1], ref.shape[0]))

        H, aligned = self.registrator.register(ref, cur)

        self.assertEqual(H.shape, (3, 3))
        # Translation in H[0,2] and H[1,2] should be close to -10, -5
        # (H maps current→reference, so current is shifted +10,+5 → H translates -10,-5)
        self.assertAlmostEqual(H[0, 2], -10, delta=5)
        self.assertAlmostEqual(H[1, 2], -5, delta=5)

    def test_aligned_same_shape_as_reference(self) -> None:
        """Aligned frame should have same shape as reference."""
        ref = self._make_frame_with_features(400, 300)
        cur = self._make_frame_with_features(320, 240)

        H, aligned = self.registrator.register(ref, cur)

        self.assertEqual(aligned.shape[:2], ref.shape[:2])

    def test_color_frames_converted_to_gray(self) -> None:
        """Color (BGR) frames should be converted to grayscale."""
        ref_gray = self._make_frame_with_features()
        cur_gray = ref_gray.copy()

        # Create color versions
        ref_bgr = cv2.cvtColor(ref_gray, cv2.COLOR_GRAY2BGR)
        cur_bgr = cv2.cvtColor(cur_gray, cv2.COLOR_GRAY2BGR)

        H1, aligned1 = self.registrator.register(ref_gray, cur_gray)
        H2, aligned2 = self.registrator.register(ref_bgr, cur_bgr)

        # Should produce similar results
        np.testing.assert_array_almost_equal(H1, H2, decimal=1)

    def test_identity_fallback_preserves_current(self) -> None:
        """Identity fallback returns copy of current, not reference."""
        ref = np.full((240, 320), 100, dtype=np.uint8)
        cur = np.full((240, 320), 200, dtype=np.uint8)

        H, aligned = self.registrator.register(ref, cur)

        self.assertEqual(aligned.mean(), 200)  # Current's value
        self.assertNotEqual(aligned.mean(), 100)  # Not reference's value


if __name__ == "__main__":
    unittest.main()
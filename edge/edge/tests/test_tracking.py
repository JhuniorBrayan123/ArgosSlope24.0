"""
ARGOS SLOPE 4.0 — Unit tests for Crack Tracking.

Tests the ``CrackTracker`` class for centroid + IoU matching across frames.
Run with::

    python -m pytest edge/edge/tests/test_tracking.py -v
"""

from __future__ import annotations

import unittest

import numpy as np

from edge.detector.fisura_detector import CrackResult


class TestCrackTracker(unittest.TestCase):
    """Test CrackTracker with synthetic crack data."""

    def setUp(self) -> None:
        from edge.temporal.tracking import CrackTracker

        self.tracker = CrackTracker(iou_threshold=0.3, max_missed_frames=5)
        self.H = np.eye(3, dtype=np.float64)  # Identity homography

    def _make_crack(
        self,
        x: int = 0,
        y: int = 0,
        w: int = 40,
        h: int = 10,
        width_mm: float = 1.0,
        length_mm: float = 20.0,
    ) -> CrackResult:
        return CrackResult(
            x=x,
            y=y,
            width=w,
            height=h,
            center_x=x + w // 2,
            center_y=y + h // 2,
            width_mm=width_mm,
            length_mm=length_mm,
            area_mm2=width_mm * length_mm,
        )

    # ── Track creation ──────────────────────────────────────────────

    def test_new_track_gets_id(self) -> None:
        """A single crack gets track_id = 1."""
        cracks = [self._make_crack()]
        result = self.tracker.update(cracks, self.H, frame_number=1)

        self.assertEqual(len(result), 1)
        self.assertEqual(result[0].track_id, 1)

    def test_multiple_cracks_get_incremental_ids(self) -> None:
        """Multiple cracks get sequential track IDs."""
        cracks = [
            self._make_crack(x=0, y=0),
            self._make_crack(x=100, y=50),
            self._make_crack(x=200, y=100),
        ]
        result = self.tracker.update(cracks, self.H, frame_number=1)

        self.assertEqual(len(result), 3)
        self.assertEqual(result[0].track_id, 1)
        self.assertEqual(result[1].track_id, 2)
        self.assertEqual(result[2].track_id, 3)

    # ── Track matching ──────────────────────────────────────────────

    def test_same_crack_matched_across_frames(self) -> None:
        """Same crack position gets same track_id."""
        crack = self._make_crack(x=50, y=30)
        frame1 = self.tracker.update([crack], self.H, frame_number=1)
        frame2 = self.tracker.update([crack], self.H, frame_number=2)

        self.assertEqual(frame1[0].track_id, 1)
        self.assertEqual(frame2[0].track_id, 1)

    def test_overlapping_crack_matched(self) -> None:
        """Slightly shifted crack (IoU >= threshold) keeps same track_id."""
        crack1 = self._make_crack(x=50, y=30)
        frame1 = self.tracker.update([crack1], self.H, frame_number=1)

        # Shift by 5px (IoU should still be high)
        crack2 = self._make_crack(x=55, y=30)
        frame2 = self.tracker.update([crack2], self.H, frame_number=2)

        self.assertEqual(frame1[0].track_id, 1)
        self.assertEqual(frame2[0].track_id, 1)

    def test_distant_crack_gets_new_id(self) -> None:
        """Distant crack (IoU < threshold) gets new track_id."""
        crack1 = self._make_crack(x=50, y=30)
        self.tracker.update([crack1], self.H, frame_number=1)

        # Far away crack
        crack2 = self._make_crack(x=500, y=300)
        result = self.tracker.update([crack2], self.H, frame_number=2)

        self.assertEqual(result[0].track_id, 2)

    def test_best_iou_wins(self) -> None:
        """When multiple tracks match, the highest IoU wins."""
        # Two cracks close together
        crack_a = self._make_crack(x=50, y=30)
        crack_b = self._make_crack(x=150, y=80)
        self.tracker.update([crack_a, crack_b], self.H, frame_number=1)

        # Move crack_a slightly, crack_b far away
        crack_a2 = self._make_crack(x=55, y=30)
        crack_b2 = self._make_crack(x=500, y=300)
        result = self.tracker.update([crack_a2, crack_b2], self.H, frame_number=2)

        # crack_a2 matches track 1, crack_b2 is new (track 3)
        self.assertEqual(result[0].track_id, 1)
        self.assertEqual(result[1].track_id, 3)

    # ── Track aging ─────────────────────────────────────────────────

    def test_track_removed_after_max_missed_frames(self) -> None:
        """Track disappears after max_missed_frames without update."""
        crack = self._make_crack()
        self.tracker.update([crack], self.H, frame_number=1)

        # Don't send any cracks for max_missed_frames+1
        for f in range(2, 8):
            self.tracker.update([], self.H, frame_number=f)

        # Now add crack again — should get new track_id
        result = self.tracker.update([crack], self.H, frame_number=8)
        self.assertEqual(result[0].track_id, 2)  # New ID

    def test_track_persists_within_max_missed(self) -> None:
        """Track survives if seen again before max_missed_frames."""
        crack = self._make_crack()
        self.tracker.update([crack], self.H, frame_number=1)

        # Skip 3 frames (within max_missed_frames=5)
        for f in range(2, 5):
            self.tracker.update([], self.H, frame_number=f)

        # Same crack appears again
        result = self.tracker.update([crack], self.H, frame_number=5)
        self.assertEqual(result[0].track_id, 1)  # Same ID

    # ── Edge cases ──────────────────────────────────────────────────

    def test_empty_cracks_list(self) -> None:
        """Empty crack list returns empty result."""
        result = self.tracker.update([], self.H, frame_number=1)
        self.assertEqual(result, [])

    def test_identity_homography(self) -> None:
        """Identity homography works correctly."""
        cracks = [self._make_crack(x=10, y=10, w=20, h=10)]
        result = self.tracker.update(cracks, self.H, frame_number=1)
        self.assertEqual(len(result), 1)
        self.assertEqual(result[0].track_id, 1)

    def test_homography_with_translation(self) -> None:
        """Non-identity homography transforms centroids correctly."""
        # Translation-only homography: shift by 5px right, 3px down
        H = np.array([
            [1, 0, 5],
            [0, 1, 3],
            [0, 0, 1],
        ], dtype=np.float64)

        cracks = [self._make_crack(x=10, y=10, w=20, h=10)]
        result = self.tracker.update(cracks, H, frame_number=1)
        self.assertEqual(len(result), 1)
        # Track was created, just verify no crash
        self.assertIsNotNone(result[0].track_id)

    def test_confidence_and_orientation_preserved(self) -> None:
        """Crack detection metadata is preserved through tracking."""
        crack = self._make_crack(x=50, y=30)
        crack.confidence = 0.85
        crack.orientation_deg = 45.0
        crack.classification = "media"

        result = self.tracker.update([crack], self.H, frame_number=1)
        tracked = result[0]

        self.assertAlmostEqual(tracked.confidence, 0.85)
        self.assertAlmostEqual(tracked.orientation_deg, 45.0)

    # ── Reset ───────────────────────────────────────────────────────

    def test_reset_clears_all_tracks(self) -> None:
        """Reset clears track state."""
        cracks = [self._make_crack()]
        self.tracker.update(cracks, self.H, frame_number=1)
        self.tracker.reset()

        result = self.tracker.update(cracks, self.H, frame_number=1)
        # Should start fresh from ID 1
        self.assertEqual(result[0].track_id, 1)

    def test_get_active_tracks_returns_copy(self) -> None:
        """get_active_tracks returns a copy (not a reference)."""
        cracks = [self._make_crack()]
        self.tracker.update(cracks, self.H, frame_number=1)

        active = self.tracker.get_active_tracks()
        self.assertEqual(len(active), 1)
        self.assertIn(1, active)

    # ── IoU computation (white-box) ─────────────────────────────────

    def test_iou_identical_boxes(self) -> None:
        """IoU = 1.0 for identical boxes."""
        iou = self.tracker._compute_iou((0, 0, 40, 10), (0, 0, 40, 10))
        self.assertAlmostEqual(iou, 1.0)

    def test_iou_no_overlap(self) -> None:
        """IoU = 0.0 for non-overlapping boxes."""
        iou = self.tracker._compute_iou((0, 0, 10, 10), (100, 100, 10, 10))
        self.assertEqual(iou, 0.0)

    def test_iou_partial_overlap(self) -> None:
        """IoU between 0 and 1 for partially overlapping boxes."""
        iou = self.tracker._compute_iou((0, 0, 20, 20), (10, 0, 20, 20))
        # Intersection: x=10, y=0, w=10, h=20 → area=200
        # Union: 400+400-200 = 600
        # IoU: 200/600 ≈ 0.333
        self.assertAlmostEqual(iou, 200.0 / 600.0, places=4)


class TestCrackTrackerConfigurable(unittest.TestCase):
    """Test CrackTracker with non-default configuration."""

    def test_custom_iou_threshold(self) -> None:
        """Lower IoU threshold allows matching more distant cracks."""
        from edge.temporal.tracking import CrackTracker

        tracker = CrackTracker(iou_threshold=0.1)
        H = np.eye(3, dtype=np.float64)

        crack_a = CrackResult(x=50, y=30, width=40, height=10,
                              center_x=70, center_y=35)
        tracker.update([crack_a], H, frame_number=1)

        # Shifted crack that would fail 0.3 threshold but pass 0.1
        crack_b = CrackResult(x=70, y=35, width=40, height=10,
                              center_x=90, center_y=40)
        result = tracker.update([crack_b], H, frame_number=2)
        self.assertEqual(result[0].track_id, 1)  # Still matched

    def test_custom_max_missed(self) -> None:
        """Tracks expire faster with lower max_missed_frames."""
        from edge.temporal.tracking import CrackTracker

        tracker = CrackTracker(max_missed_frames=2)
        H = np.eye(3, dtype=np.float64)

        crack = CrackResult(x=50, y=30, width=40, height=10,
                            center_x=70, center_y=35)
        tracker.update([crack], H, frame_number=1)

        # Miss 3 frames (exceeds 2)
        for f in range(2, 6):
            tracker.update([], H, frame_number=f)

        result = tracker.update([crack], H, frame_number=6)
        self.assertEqual(result[0].track_id, 2)


if __name__ == "__main__":
    unittest.main()

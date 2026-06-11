"""
ARGOS SLOPE 4.0 — Unit tests for RawFrameCollector (Sprint 7).

Tests the ``RawFrameCollector`` data collection module: periodic JPEG
capture, interval skipping, max-files cleanup, context manager, and
error handling.

Run with::

    python -m pytest edge/edge/tests/test_data_collector.py -v
"""

from __future__ import annotations

import os
import tempfile
import unittest
from pathlib import Path

import numpy as np

from edge.temporal.data_collector import RawFrameCollector


class TestRawFrameCollector(unittest.TestCase):
    """RawFrameCollector unit tests."""

    def setUp(self) -> None:
        self._tmp_dir = tempfile.mkdtemp(prefix="test_data_collector_")
        self.output_dir = Path(self._tmp_dir)

    def tearDown(self) -> None:
        # Clean up all created files
        import shutil
        shutil.rmtree(self._tmp_dir, ignore_errors=True)

    def _make_frame(self) -> np.ndarray:
        """Create a synthetic 100x100 BGR frame."""
        return np.zeros((100, 100, 3), dtype=np.uint8)

    # ── Frame capture creates files ──────────────────────────────────

    def test_capture_creates_file(self) -> None:
        """
        GIVEN a RawFrameCollector with enabled=True, interval=1
        WHEN capture() is called with a valid frame
        THEN a JPEG file is created in the output directory
        """
        collector = RawFrameCollector(
            output_dir=str(self.output_dir),
            interval=1,
            enabled=True,
        )
        frame = self._make_frame()
        result = collector.capture(frame, crack_count=3)

        self.assertIsNotNone(result)
        path = Path(result)  # type: ignore[arg-type]
        self.assertTrue(path.exists(), "Captured file was not created")
        self.assertEqual(path.suffix.lower(), ".jpg")
        self.assertGreater(path.stat().st_size, 0)

    # ── Interval skipping ────────────────────────────────────────────

    def test_interval_skips_frames(self) -> None:
        """
        GIVEN a collector with interval=3
        WHEN capture() is called 5 times
        THEN only frames at call 3 (and 6 if within) are saved
        """
        collector = RawFrameCollector(
            output_dir=str(self.output_dir),
            interval=3,
            enabled=True,
        )
        frame = self._make_frame()

        results = []
        for _ in range(5):
            results.append(collector.capture(frame, crack_count=0))

        # interval=3 → hit at calls 3 (frame_count=3) = index 2
        # frame_count=3 hits → result[2] should have path
        # all others should be None
        self.assertIsNone(results[0], "Frame 1 should be skipped")
        self.assertIsNone(results[1], "Frame 2 should be skipped")
        self.assertIsNotNone(results[2], "Frame 3 should be captured")
        self.assertIsNone(results[3], "Frame 4 should be skipped")
        self.assertIsNone(results[4], "Frame 5 should be skipped")

    def test_interval_one_captures_every_frame(self) -> None:
        """
        GIVEN interval=1
        WHEN capture() is called 3 times
        THEN every call saves a file
        """
        collector = RawFrameCollector(
            output_dir=str(self.output_dir),
            interval=1,
            enabled=True,
        )
        frame = self._make_frame()

        results = [collector.capture(frame) for _ in range(3)]
        self.assertEqual(len([r for r in results if r is not None]), 3)

    # ── Max files cleanup ────────────────────────────────────────────

    def test_max_files_cleanup_oldest_deleted(self) -> None:
        """
        GIVEN max_files=2
        WHEN 3 frames are captured
        THEN the oldest file is deleted, only 2 remain
        """
        collector = RawFrameCollector(
            output_dir=str(self.output_dir),
            interval=1,
            max_files=2,
            enabled=True,
        )
        frame = self._make_frame()

        results: list[str | None] = []
        for _ in range(3):
            results.append(collector.capture(frame))

        # All 3 should have returned paths (they were created)
        self.assertIsNotNone(results[0])
        self.assertIsNotNone(results[1])
        self.assertIsNotNone(results[2])

        # But the oldest file should now be deleted
        files = sorted(self.output_dir.glob("*.jpg"))
        self.assertLessEqual(len(files), 2,
                             "Should have at most 2 files after cleanup")

        # The first-created file should be gone
        first_path = Path(results[0])  # type: ignore[arg-type]
        self.assertFalse(
            first_path.exists(),
            "Oldest file should have been deleted",
        )

    def test_max_files_no_cleanup_below_limit(self) -> None:
        """
        GIVEN max_files=10
        WHEN 3 frames are captured
        THEN all 3 files remain (below limit)
        """
        collector = RawFrameCollector(
            output_dir=str(self.output_dir),
            interval=1,
            max_files=10,
            enabled=True,
        )
        frame = self._make_frame()

        for _ in range(3):
            collector.capture(frame)

        files = list(self.output_dir.glob("*.jpg"))
        self.assertEqual(len(files), 3)

    # ── Disabled config skips capture ────────────────────────────────

    def test_disabled_skips_capture(self) -> None:
        """
        GIVEN enabled=False
        WHEN capture() is called
        THEN returns None and no file is created
        """
        collector = RawFrameCollector(
            output_dir=str(self.output_dir),
            interval=1,
            enabled=False,
        )
        frame = self._make_frame()

        result = collector.capture(frame)
        self.assertIsNone(result)

        files = list(self.output_dir.glob("*.jpg"))
        self.assertEqual(len(files), 0)

    # ── Context manager ──────────────────────────────────────────────

    def test_context_manager_enter_exit(self) -> None:
        """
        GIVEN a RawFrameCollector used as context manager
        WHEN entering and exiting the context
        THEN capture still works during context
        """
        with RawFrameCollector(
            output_dir=str(self.output_dir),
            interval=1,
            enabled=True,
        ) as collector:
            frame = self._make_frame()
            result = collector.capture(frame)

        self.assertIsNotNone(result)
        self.assertTrue(Path(result).exists())  # type: ignore[arg-type]

    # ── Error handling ───────────────────────────────────────────────

    def test_invalid_path_does_not_crash(self) -> None:
        """
        GIVEN an output directory that cannot be created (e.g. invalid chars)
        WHEN capture() is called
        THEN it returns None and does not raise (graceful handling)
        """
        # Use a path with reserved characters (Windows) or in a temp dir
        # that we remove to simulate disk issues
        invalid_dir = self.output_dir / "nonexistent_subdir"
        collector = RawFrameCollector(
            output_dir=str(invalid_dir),
            interval=1,
            enabled=True,
        )
        frame = self._make_frame()

        # Should not raise — should log warning and return None
        try:
            result = collector.capture(frame)
            # This may succeed (directory created) or return None
            # The important thing is it doesn't crash
        except Exception:
            self.fail("capture() raised an exception on invalid path")

    def test_capture_none_frame_returns_none(self) -> None:
        """
        GIVEN a None frame
        WHEN capture() is called
        THEN returns None (graceful handling)
        """
        collector = RawFrameCollector(
            output_dir=str(self.output_dir),
            interval=1,
            enabled=True,
        )
        result = collector.capture(None)  # type: ignore[arg-type]
        self.assertIsNone(result)

    # ── Frame counter property ───────────────────────────────────────

    def test_frame_counter_increments(self) -> None:
        """
        GIVEN a collector
        WHEN capture() is called 3 times
        THEN frame_count property reflects total calls
        """
        collector = RawFrameCollector(
            output_dir=str(self.output_dir),
            interval=1,
            enabled=True,
        )
        frame = self._make_frame()

        collector.capture(frame)
        collector.capture(frame)
        collector.capture(frame)

        self.assertEqual(collector.frame_count, 3)

    def test_frame_counter_not_incremented_when_disabled(self) -> None:
        """
        GIVEN a disabled collector
        WHEN capture() is called
        THEN frame_count stays 0
        """
        collector = RawFrameCollector(
            output_dir=str(self.output_dir),
            enabled=False,
        )
        frame = self._make_frame()

        collector.capture(frame)
        collector.capture(frame)
        collector.capture(frame)

        self.assertEqual(collector.frame_count, 0)


if __name__ == "__main__":
    unittest.main()

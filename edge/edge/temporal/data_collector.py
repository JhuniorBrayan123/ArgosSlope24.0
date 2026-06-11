"""
ARGOS SLOPE 4.0 — Raw Frame Data Collector (Sprint 7).

Periodically saves raw camera frames to ``data/training/raw/`` as JPEG
images for future ML dataset curation. Configurable capture interval,
max file retention, and enable/disable.

Usage::

    collector = RawFrameCollector(
        output_dir="data/training/raw",
        interval=300,
        max_files=1000,
    )
    with collector:
        path = collector.capture(frame, crack_count=5)
        if path:
            print(f"Frame saved to {path}")
"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Optional

import cv2
import numpy as np

logger = logging.getLogger(__name__)


class RawFrameCollector:
    """
    Periodically saves raw frames to disk as JPEG files.

    The collector maintains a frame counter and only saves frames when the
    counter reaches the configured ``interval`` boundary. Oldest files are
    deleted when the total exceeds ``max_files``.

    Args:
        output_dir:
            Directory where JPEG files are saved. Created automatically.
        interval:
            Save one frame every N calls to ``capture()``. Default 300.
        max_files:
            Maximum number of JPEG files to retain. Oldest files are
            deleted when this limit is exceeded. Default 1000.
        jpeg_quality:
            JPEG encoding quality (1–100). Default 80.
        enabled:
            If ``False``, ``capture()`` always returns ``None``.
    """

    def __init__(
        self,
        output_dir: str = "data/training/raw",
        interval: int = 300,
        max_files: int = 1000,
        jpeg_quality: int = 80,
        enabled: bool = True,
    ) -> None:
        self._output_dir = Path(output_dir)
        self._interval = interval
        self._max_files = max_files
        self._jpeg_quality = max(1, min(100, jpeg_quality))
        self._enabled = enabled
        self._frame_count = 0

        logger.info(
            "RawFrameCollector initialized: output_dir=%s, interval=%d, "
            "max_files=%d, jpeg_quality=%d, enabled=%s",
            self._output_dir,
            self._interval,
            self._max_files,
            self._jpeg_quality,
            self._enabled,
        )

    # ── Properties ───────────────────────────────────────────────────

    @property
    def frame_count(self) -> int:
        """Total number of ``capture()`` calls (enabled only)."""
        return self._frame_count

    @property
    def enabled(self) -> bool:
        """Whether the collector is active."""
        return self._enabled

    # ── Public API ───────────────────────────────────────────────────

    def capture(
        self,
        frame: Optional[np.ndarray],
        crack_count: int = 0,
    ) -> Optional[str]:
        """
        Attempt to save the current frame to disk.

        The frame is saved only when:
        - ``enabled`` is ``True``
        - The internal frame counter is a multiple of ``interval``
        - The frame is not ``None``

        Args:
            frame:
                BGR image frame to save. If ``None``, returns ``None``.
            crack_count:
                Number of cracks detected in this frame (for logging).

        Returns:
            Absolute path to the saved JPEG file, or ``None`` if the
            frame was skipped or could not be saved.
        """
        if not self._enabled:
            return None

        if frame is None:
            logger.warning("RawFrameCollector: received None frame — skipping.")
            return None

        self._frame_count += 1

        if self._frame_count % self._interval != 0:
            return None

        # Ensure output directory exists
        try:
            self._output_dir.mkdir(parents=True, exist_ok=True)
        except OSError as exc:
            logger.error(
                "RawFrameCollector: cannot create output dir %s: %s",
                self._output_dir,
                exc,
            )
            return None

        # Build filename from frame count (guarantees uniqueness)
        filename = f"frame_{self._frame_count:08d}.jpg"
        path = self._output_dir / filename

        try:
            success = cv2.imwrite(
                str(path),
                frame,
                [cv2.IMWRITE_JPEG_QUALITY, self._jpeg_quality],
            )
        except Exception as exc:
            logger.error(
                "RawFrameCollector: failed to write frame to %s: %s",
                path,
                exc,
            )
            return None

        if not success:
            logger.warning(
                "RawFrameCollector: cv2.imwrite returned False for %s",
                path,
            )
            return None

        logger.debug(
            "RawFrameCollector: saved frame %s (%d cracks, %d files)",
            filename,
            crack_count,
            len(list(self._output_dir.glob("*.jpg"))),
        )

        # Enforce max file limit
        self._enforce_max_files()

        return str(path.resolve())

    # ── Context manager ──────────────────────────────────────────────

    def __enter__(self) -> RawFrameCollector:
        """Enter context: returns the collector itself."""
        return self

    def __exit__(
        self,
        exc_type: Optional[type],
        exc_val: Optional[BaseException],
        exc_tb: Optional[object],
    ) -> None:
        """Exit context: no cleanup needed (files persist)."""
        pass

    # ── Internal ─────────────────────────────────────────────────────

    def _enforce_max_files(self) -> None:
        """
        Delete oldest files if the total exceeds ``max_files``.

        Files are sorted by modification time (oldest first),
        and the oldest are removed until the count is within the limit.
        """
        try:
            files = sorted(
                self._output_dir.glob("*.jpg"),
                key=lambda p: p.stat().st_mtime,
            )
        except OSError:
            return

        while len(files) > self._max_files:
            oldest = files[0]
            try:
                oldest.unlink()
                logger.debug(
                    "RawFrameCollector: deleted oldest file %s (%d/%d)",
                    oldest.name,
                    len(files) - 1,
                    self._max_files,
                )
            except OSError as exc:
                logger.warning(
                    "RawFrameCollector: failed to delete %s: %s",
                    oldest,
                    exc,
                )
            files = sorted(
                self._output_dir.glob("*.jpg"),
                key=lambda p: p.stat().st_mtime,
            )

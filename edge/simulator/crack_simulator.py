"""
ARGOS SLOPE 4.0 — Crack Simulator.

Generates synthetic crack events at random intervals for development and
demo mode (when no live camera feed is available).

Each simulated crack:
  - Appears at a random location within frame bounds
  - Has a random width classification (fina, media, gruesa)
  - Is saved as an annotated JPEG to ``capturas_historicas/``

Usage:
    simulator = CrackSimulator()
    event = simulator.update(frame_count=42, frame=bgr_frame)
    if event:
        print(event.cracks, event.image_path)
"""

from __future__ import annotations

import logging
import random
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

import cv2
import numpy as np

from edge.config import config
from edge.detector.fisura_detector import (
    CrackClassification,
    CrackResult,
)

logger = logging.getLogger(__name__)


@dataclass
class SimulatorEvent:
    """Event produced when the simulator triggers a crack."""

    cracks: list[CrackResult] = field(default_factory=list)
    """Simulated crack detection results."""

    image_path: Optional[str] = None
    """Path to the saved annotated frame, if one was written."""

    timestamp: float = 0.0
    """Unix timestamp of the event."""


class CrackSimulator:
    """
    Generates simulated crack events at random intervals.

    The simulator uses a cooldown mechanism to prevent triggering multiple
    events in rapid succession. Intervals are randomly chosen between
    ``simulator_interval_min`` and ``simulator_interval_max`` seconds.

    Args:
        interval_min: Minimum interval between events (seconds).
        interval_max: Maximum interval between events (seconds).
        capturas_dir: Directory for saved crack frames.
    """

    def __init__(
        self,
        interval_min: int | None = None,
        interval_max: int | None = None,
        capturas_dir: str | None = None,
    ) -> None:
        self._interval_min = interval_min or config.simulator_interval_min
        self._interval_max = interval_max or config.simulator_interval_max
        self._capturas_dir = Path(capturas_dir or config.capturas_dir)

        # Ensure the capturas directory exists
        self._capturas_dir.mkdir(parents=True, exist_ok=True)

        # Cooldown tracking
        self._last_event_time: float = 0.0
        self._next_interval: float = self._random_interval()

        logger.info(
            "CrackSimulator initialized: interval=[%d, %d]s, output=%s",
            self._interval_min,
            self._interval_max,
            self._capturas_dir,
        )

    # ── Public API ───────────────────────────────────────────────────

    def update(
        self,
        frame_count: int,
        frame: np.ndarray,
    ) -> Optional[SimulatorEvent]:
        """
        Check if a crack event should trigger and generate one if due.

        Args:
            frame_count: Current frame number (for provenance).
            frame: BGR frame (H, W, 3) — used for size bounds and saving.

        Returns:
            ``SimulatorEvent`` with crack results and image path if a
            crack was generated, or ``None`` if no event is due.
        """
        now = time.time()
        elapsed = now - self._last_event_time

        # Cooldown check
        if elapsed < self._next_interval:
            return None

        # Ensure minimum cooldown (2 s) to prevent floods
        if elapsed < 2.0:
            return None

        # Generate crack
        crack = self._generate_crack(frame)
        image_path = self._save_frame(frame, crack, frame_count)

        # Reset timer with a new random interval
        self._last_event_time = now
        self._next_interval = self._random_interval()

        logger.info(
            "Simulated crack %s at (%d, %d) [%s] — next in %.0f s",
            crack.roi_id,
            crack.x,
            crack.y,
            crack.classification.value,
            self._next_interval,
        )

        return SimulatorEvent(
            cracks=[crack],
            image_path=image_path,
            timestamp=now,
        )

    # ── Internal ─────────────────────────────────────────────────────

    def _random_interval(self) -> float:
        """Return a random interval in seconds within the configured range."""
        return random.uniform(self._interval_min, self._interval_max)

    def _generate_crack(self, frame: np.ndarray) -> CrackResult:
        """
        Create a single simulated ``CrackResult`` at a random location.

        The bounding box is placed within the frame dimensions with a
        random size (10–80 px) and a random classification.
        """
        h, w = frame.shape[:2]

        # Random bounding box (pixels)
        bw = random.randint(10, min(80, w // 4))
        bh = random.randint(10, min(80, h // 4))
        x = random.randint(0, max(0, w - bw))
        y = random.randint(0, max(0, h - bh))

        # Random classification
        classification = random.choice([
            CrackClassification.FINA,
            CrackClassification.MEDIA,
            CrackClassification.GRUESA,
        ])

        return CrackResult(
            x=x,
            y=y,
            width=bw,
            height=bh,
            center_x=x + bw // 2,
            center_y=y + bh // 2,
            length_mm=round(random.uniform(10.0, 150.0), 2),
            width_mm={
                CrackClassification.FINA: round(random.uniform(0.05, 0.29), 3),
                CrackClassification.MEDIA: round(random.uniform(0.3, 0.99), 3),
                CrackClassification.GRUESA: round(random.uniform(1.0, 5.0), 3),
            }[classification],
            area_mm2=round(random.uniform(5.0, 200.0), 2),
            classification=classification,
            orientation_deg=round(random.uniform(0.0, 180.0), 1),
            confidence=round(random.uniform(0.7, 0.99), 4),
        )

    def _save_frame(
        self,
        frame: np.ndarray,
        crack: CrackResult,
        frame_count: int,
    ) -> Optional[str]:
        """
        Save the frame with an annotated bounding box to ``capturas_historicas/``.

        Args:
            frame: Original BGR frame.
            crack: The simulated crack result.
            frame_count: Frame number for the filename.

        Returns:
            Relative path to the saved file, or ``None`` on failure.
        """
        try:
            # Annotate
            annotated = frame.copy()
            cv2.rectangle(
                annotated,
                (crack.x, crack.y),
                (crack.x + crack.width, crack.y + crack.height),
                color=(0, 0, 255),  # red
                thickness=2,
            )
            label = f"{crack.roi_id} ({crack.classification.value})"
            cv2.putText(
                annotated,
                label,
                (crack.x, crack.y - 8),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.5,
                (0, 0, 255),
                1,
            )

            # Timestamp-based filename
            ts = time.strftime("%Y%m%d_%H%M%S")
            filename = f"{ts}.jpg"
            filepath = self._capturas_dir / filename

            success = cv2.imwrite(str(filepath), annotated)
            if not success:
                logger.error("Failed to save simulated crack frame to %s", filepath)
                return None

            logger.debug("Saved simulated crack frame to %s", filepath)
            return str(filepath)

        except Exception:
            logger.exception("Failed to save simulated crack frame.")
            return None

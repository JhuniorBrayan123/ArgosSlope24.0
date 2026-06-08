"""
ARGOS SLOPE 4.0 — Crack Deformation Velocity Module.

Calculates crack opening velocity (mm/day) from sequential width
measurements, using configurable smoothing (EMA) to suppress
measurement noise.

Usage:
    calc = VelocityCalculator(min_days=2.0, ema_alpha=0.3)
    v = calc.add_measurement(track_id=1, width_mm=2.5, timestamp=datetime.now())
    # v = instant velocity mm/day, or None if < min_days
"""

from __future__ import annotations

import logging
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import Optional

logger = logging.getLogger(__name__)


@dataclass
class MeasurementRecord:
    """A single width measurement at a point in time."""

    timestamp: datetime
    width_mm: float
    length_mm: float
    area_mm2: float
    velocity_mm_day: Optional[float] = None
    smoothed_velocity: Optional[float] = None


@dataclass
class TrackHistory:
    """Complete measurement history for one tracked crack."""

    track_id: int
    measurements: list[MeasurementRecord] = field(default_factory=list)

    @property
    def last_width_mm(self) -> Optional[float]:
        return self.measurements[-1].width_mm if self.measurements else None

    @property
    def first_width_mm(self) -> Optional[float]:
        return self.measurements[0].width_mm if self.measurements else None

    @property
    def total_delta_mm(self) -> Optional[float]:
        """Total width change from first to last measurement."""
        if len(self.measurements) < 2:
            return None
        return self.measurements[-1].width_mm - self.measurements[0].width_mm

    @property
    def total_days(self) -> Optional[float]:
        """Days between first and last measurement."""
        if len(self.measurements) < 2:
            return None
        delta = self.measurements[-1].timestamp - self.measurements[0].timestamp
        return delta.total_seconds() / 86400.0

    def clear(self) -> None:
        """Clear all measurements for this track."""
        self.measurements.clear()


class VelocityCalculator:
    """
    Computes crack deformation velocity from sequential measurements.

    Instant velocity: (width_mm - prev_width_mm) / days_elapsed
    Smoothed velocity: EMA over instant velocities to reduce noise.

    Args:
        min_days: Minimum elapsed days between two measurements before
            a velocity is computed. Prevents division by tiny time deltas
            that amplify measurement noise.
        ema_alpha: Smoothing factor (0.0–1.0). Lower = more smoothing.
            0.3 is a sensible default; 0.0 freezes the smoothed value,
            1.0 applies no smoothing at all.
        min_measurements: Minimum number of measurements needed before
            returning a non-None velocity (default 2).
    """

    def __init__(
        self,
        min_days: float = 2.0,
        ema_alpha: float = 0.3,
        min_measurements: int = 2,
    ) -> None:
        self.min_days = min_days
        self.ema_alpha = ema_alpha
        self.min_measurements = min_measurements
        self._tracks: dict[int, TrackHistory] = defaultdict(
            lambda: TrackHistory(track_id=0)
        )

        logger.info(
            "VelocityCalculator initialized: min_days=%.1f, ema_alpha=%.2f, "
            "min_measurements=%d",
            self.min_days,
            self.ema_alpha,
            self.min_measurements,
        )

    # ── Public API ──────────────────────────────────────────────────

    def add_measurement(
        self,
        track_id: int,
        width_mm: float,
        timestamp: Optional[datetime] = None,
        length_mm: float = 0.0,
        area_mm2: float = 0.0,
    ) -> Optional[float]:
        """
        Register a new width measurement for a tracked crack.

        Args:
            track_id: Persistent crack track ID.
            width_mm: Crack width in mm.
            timestamp: Observation timestamp (defaults to now).
            length_mm: Crack length in mm (optional, for record-keeping).
            area_mm2: Crack area in mm² (optional, for record-keeping).

        Returns:
            Instant velocity in mm/day if enough data exists,
            otherwise ``None``.
        """
        ts = timestamp or datetime.now()

        # Ensure track history exists
        if track_id not in self._tracks:
            self._tracks[track_id] = TrackHistory(track_id=track_id)
        history = self._tracks[track_id]

        # Compute instant velocity from previous measurement
        instant_v: Optional[float] = None
        if history.measurements:
            prev = history.measurements[-1]
            days = (ts - prev.timestamp).total_seconds() / 86400.0
            if days >= self.min_days:
                instant_v = (width_mm - prev.width_mm) / days
                logger.debug(
                    "Track %d: width %.4f→%.4f over %.2f days → v=%.4f mm/day",
                    track_id,
                    prev.width_mm,
                    width_mm,
                    days,
                    instant_v,
                )
            else:
                logger.debug(
                    "Track %d: only %.2f days elapsed (< min_days=%.1f); "
                    "velocity not computed yet",
                    track_id,
                    days,
                    self.min_days,
                )

        # Compute smoothed velocity (EMA over instant velocities)
        smoothed_v: Optional[float] = None
        if instant_v is not None:
            prev_smoothed = history.measurements[-1].smoothed_velocity
            if prev_smoothed is not None:
                smoothed_v = (
                    self.ema_alpha * instant_v
                    + (1.0 - self.ema_alpha) * prev_smoothed
                )
            else:
                # First velocity measurement — seed with instant value
                smoothed_v = instant_v

        # Store the measurement
        record = MeasurementRecord(
            timestamp=ts,
            width_mm=width_mm,
            length_mm=length_mm,
            area_mm2=area_mm2,
            velocity_mm_day=instant_v,
            smoothed_velocity=smoothed_v,
        )
        history.measurements.append(record)

        # Only return velocity if we have enough measurements
        if len(history.measurements) >= self.min_measurements:
            return smoothed_v if smoothed_v is not None else instant_v
        return None

    def get_velocity(self, track_id: int) -> Optional[float]:
        """
        Return the latest instant velocity for a track.

        Returns:
            mm/day or ``None`` if no data or not yet computable.
        """
        history = self._tracks.get(track_id)
        if not history or not history.measurements:
            return None
        return history.measurements[-1].velocity_mm_day

    def get_smoothed_velocity(self, track_id: int) -> Optional[float]:
        """
        Return the latest EMA-smoothed velocity for a track.

        Returns:
            mm/day or ``None`` if smoothing not yet seeded.
        """
        history = self._tracks.get(track_id)
        if not history or not history.measurements:
            return None
        return history.measurements[-1].smoothed_velocity

    def get_history(self, track_id: int) -> TrackHistory:
        """
        Return the full measurement history for a track.

        Returns:
            ``TrackHistory`` (never ``None``; creates empty if not found).
        """
        if track_id not in self._tracks:
            self._tracks[track_id] = TrackHistory(track_id=track_id)
        return self._tracks[track_id]

    def get_all_track_ids(self) -> list[int]:
        """Return all known track IDs."""
        return sorted(self._tracks.keys())

    def get_all_velocities(self) -> dict[int, Optional[float]]:
        """Return smoothed velocity for every track."""
        return {
            tid: self.get_smoothed_velocity(tid) or self.get_velocity(tid)
            for tid in self._tracks
        }

    def classify_velocity(self, velocity_mm_day: float) -> str:
        """
        Classify deformation velocity according to risk thresholds.

        Thresholds (configurable):
            < 0.1 mm/day  → "estable"
            0.1–0.5       → "lenta"
            0.5–2.0       → "moderada"
            > 2.0         → "rapida" (requires immediate attention)

        Args:
            velocity_mm_day: Velocity in mm/day.

        Returns:
            Risk category string.
        """
        if velocity_mm_day < 0.1:
            return "estable"
        if velocity_mm_day < 0.5:
            return "lenta"
        if velocity_mm_day < 2.0:
            return "moderada"
        return "rapida"

    def reset_track(self, track_id: int) -> None:
        """Clear all measurements for a specific track."""
        history = self._tracks.get(track_id)
        if history:
            history.clear()
            logger.info("Track %d history cleared", track_id)

    def reset_all(self) -> None:
        """Clear all track histories."""
        self._tracks.clear()
        logger.info("All velocity track histories cleared")

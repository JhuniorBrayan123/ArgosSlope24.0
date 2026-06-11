"""
ARGOS SLOPE 4.0 — Trend Predictor Module (Sprint 7).

Performs linear regression (numpy ``polyfit``) over crack width measurements
to compute slope, R², trend direction, and Time-To-Threshold (TTT).

Usage::

    predictor = TrendPredictor(min_data_points=5, horizon_days=7.0)
    result = predictor.predict(track_id=1, measurements=[
        {"days_elapsed": 0.0, "width_mm": 3.0},
        {"days_elapsed": 5.0, "width_mm": 4.2},
    ])
    if result is not None:
        print(result.trend_direction, result.ttt_days)
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Optional

import numpy as np

logger = logging.getLogger(__name__)


@dataclass
class TrendPredictionResult:
    """
    Result of a trend prediction for a single tracked crack.

    Attributes:
        trend_direction:
            One of ``"acelerando"``, ``"estable"``, or ``"desacelerando"``.
        slope:
            Linear regression slope in mm/day.
        r_squared:
            Coefficient of determination (0.0–1.0). Measures goodness-of-fit.
        ttt_days:
            Estimated days until width reaches the threshold,
            or ``None`` if the slope is non-positive.
        confidence:
            Numeric confidence (0.0–1.0) derived from R².
    """

    trend_direction: str
    slope: float
    r_squared: float
    ttt_days: Optional[float]
    confidence: float


class TrendPredictor:
    """
    Stateless trend predictor using linear regression on crack widths.

    Takes pre-processed measurements (list of dicts with ``days_elapsed``
    and ``width_mm`` keys) and returns a ``TrendPredictionResult``.

    Args:
        min_data_points:
            Minimum number of measurements required for a prediction.
            Default 5.
        horizon_days:
            Maximum look-ahead for TTT calculations. TTT values exceeding
            this are capped. Default 7.0.
        threshold_width:
            Width threshold in mm for TTT computation. When ``None``,
            defaults to ``2.0 * horizon_days`` (approximate rapida-equivalent
            width). Default ``None``.
        slope_threshold:
            Absolute slope value below which the trend is considered
            ``"estable"``. Default 0.01.
    """

    def __init__(
        self,
        min_data_points: int = 5,
        horizon_days: float = 7.0,
        threshold_width: Optional[float] = None,
        slope_threshold: float = 0.01,
    ) -> None:
        self.min_data_points = min_data_points
        self.horizon_days = horizon_days
        self.threshold_width = threshold_width or (2.0 * horizon_days)
        self.slope_threshold = slope_threshold

        logger.info(
            "TrendPredictor initialized: min_data_points=%d, "
            "horizon_days=%.1f, threshold_width=%.2f, slope_threshold=%.4f",
            self.min_data_points,
            self.horizon_days,
            self.threshold_width,
            self.slope_threshold,
        )

    # ── Public API ──────────────────────────────────────────────────────

    def predict(
        self,
        crack_id: int,
        measurements: list[dict],
    ) -> Optional[TrendPredictionResult]:
        """
        Run linear regression on crack width measurements.

        Args:
            crack_id:
                Crack track identifier (included in logs).
            measurements:
                List of dicts with ``days_elapsed`` (float) and
                ``width_mm`` (float) keys, sorted chronologically.

        Returns:
            ``TrendPredictionResult`` if enough data, else ``None``.
        """
        if len(measurements) < self.min_data_points:
            logger.debug(
                "Track %d: insufficient data (%d < %d)",
                crack_id,
                len(measurements),
                self.min_data_points,
            )
            return None

        # Extract arrays
        days = np.array([m["days_elapsed"] for m in measurements], dtype=float)
        widths = np.array([m["width_mm"] for m in measurements], dtype=float)

        # Linear regression (degree 1 polyfit)
        coeffs = np.polyfit(days, widths, deg=1)
        slope: float = float(coeffs[0])
        intercept: float = float(coeffs[1])

        # R² computation
        r_squared = self._compute_r_squared(days, widths, slope, intercept)

        # Trend direction
        direction = self._classify_direction(slope)

        # TTT
        ttt = self._compute_ttt(slope, intercept)

        # Confidence: clamped R²
        confidence = max(0.0, min(1.0, r_squared))

        logger.debug(
            "Track %d: slope=%.6f, R²=%.4f, direction=%s, TTT=%s, conf=%.4f",
            crack_id,
            slope,
            r_squared,
            direction,
            f"{ttt:.2f}d" if ttt is not None else "None",
            confidence,
        )

        return TrendPredictionResult(
            trend_direction=direction,
            slope=slope,
            r_squared=r_squared,
            ttt_days=ttt,
            confidence=confidence,
        )

    # ── R² ─────────────────────────────────────────────────────────────

    @staticmethod
    def _compute_r_squared(
        days: np.ndarray,
        widths: np.ndarray,
        slope: float,
        intercept: float,
    ) -> float:
        """Compute coefficient of determination (R²)."""
        ss_res = float(np.sum((widths - (slope * days + intercept)) ** 2))
        ss_tot = float(np.sum((widths - np.mean(widths)) ** 2))
        if ss_tot == 0.0:
            return 0.0
        r2 = 1.0 - ss_res / ss_tot
        # Clamp to [0, 1] to avoid tiny negatives from floating point
        return max(0.0, min(1.0, r2))

    # ── Direction classification ───────────────────────────────────────

    def _classify_direction(self, slope: float) -> str:
        """Classify slope trend direction."""
        if slope > self.slope_threshold:
            return "acelerando"
        if slope < -self.slope_threshold:
            return "desacelerando"
        return "estable"

    # ── TTT ────────────────────────────────────────────────────────────

    def _compute_ttt(
        self,
        slope: float,
        intercept: float,
    ) -> Optional[float]:
        """
        Compute Time-To-Threshold in days.

        Returns ``None`` when slope <= 0 (not widening).
        Caps result at ``horizon_days``.
        """
        if slope <= 0:
            return None
        ttt = (self.threshold_width - intercept) / slope
        if ttt < 0:
            return None
        return min(ttt, self.horizon_days)

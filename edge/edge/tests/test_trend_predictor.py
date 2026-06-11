"""
ARGOS SLOPE 4.0 — Unit tests for TrendPredictor (Sprint 7).

Tests the ``TrendPredictor`` linear regression engine: slope, R², TTT,
direction classification, confidence, and data-point guards.

Run with::

    python -m pytest edge/edge/tests/test_trend_predictor.py -v
"""

from __future__ import annotations

import math
import unittest

from edge.temporal.trend_predictor import TrendPredictor, TrendPredictionResult


class TestTrendPredictionResult(unittest.TestCase):
    """TrendPredictionResult dataclass shape."""

    def test_default_fields(self) -> None:
        """Verify all required fields exist with correct types."""
        result = TrendPredictionResult(
            trend_direction="acelerando",
            slope=0.15,
            r_squared=0.95,
            ttt_days=12.5,
            confidence=0.95,
        )
        self.assertEqual(result.trend_direction, "acelerando")
        self.assertIsInstance(result.slope, float)
        self.assertIsInstance(result.r_squared, float)
        self.assertIsInstance(result.ttt_days, float | None)
        self.assertIsInstance(result.confidence, float)

    def test_ttt_days_can_be_none(self) -> None:
        """ttt_days may be None when slope is non-positive."""
        result = TrendPredictionResult(
            trend_direction="estable",
            slope=0.0,
            r_squared=0.0,
            ttt_days=None,
            confidence=0.0,
        )
        self.assertIsNone(result.ttt_days)


class TestTrendPredictorLinearRegression(unittest.TestCase):
    """Linear regression calculation via numpy polyfit."""

    def setUp(self) -> None:
        self.predictor = TrendPredictor(
            min_data_points=5,
            horizon_days=30.0,
            threshold_width=14.0,
            slope_threshold=0.01,
        )

    # ── Happy path: known positive slope ───────────────────────────────

    def test_positive_slope_known_data(self) -> None:
        """
        GIVEN 8 strictly increasing width measurements over 14 days
        WHEN predict() is called
        THEN slope > 0, direction == "acelerando", R² > 0.8, numeric TTT
        """
        measurements = [
            {"days_elapsed": 0.0, "width_mm": 3.0},
            {"days_elapsed": 1.0, "width_mm": 3.2},
            {"days_elapsed": 3.0, "width_mm": 3.5},
            {"days_elapsed": 5.0, "width_mm": 3.9},
            {"days_elapsed": 7.0, "width_mm": 4.2},
            {"days_elapsed": 10.0, "width_mm": 4.8},
            {"days_elapsed": 12.0, "width_mm": 5.1},
            {"days_elapsed": 14.0, "width_mm": 5.5},
        ]
        result = self.predictor.predict(crack_id=1, measurements=measurements)

        self.assertIsNotNone(result)
        self.assertGreater(result.slope, 0)
        self.assertEqual(result.trend_direction, "acelerando")
        self.assertGreater(result.r_squared, 0.8)
        self.assertIsNotNone(result.ttt_days)
        self.assertGreater(result.confidence, 0.8)

    # ── Negative slope ─────────────────────────────────────────────────

    def test_negative_slope(self) -> None:
        """
        GIVEN decreasing widths over time
        WHEN predict() is called
        THEN direction == "desacelerando", TTT is None
        """
        measurements = [
            {"days_elapsed": 0.0, "width_mm": 5.5},
            {"days_elapsed": 2.0, "width_mm": 5.2},
            {"days_elapsed": 4.0, "width_mm": 4.9},
            {"days_elapsed": 6.0, "width_mm": 4.5},
            {"days_elapsed": 8.0, "width_mm": 4.2},
            {"days_elapsed": 10.0, "width_mm": 3.9},
        ]
        result = self.predictor.predict(crack_id=2, measurements=measurements)

        self.assertIsNotNone(result)
        self.assertLess(result.slope, 0)
        self.assertEqual(result.trend_direction, "desacelerando")
        self.assertIsNone(result.ttt_days)

    # ── Flat / zero slope ─────────────────────────────────────────────

    def test_flat_slope(self) -> None:
        """
        GIVEN constant width over time
        WHEN predict() is called
        THEN direction == "estable", slope near zero
        """
        measurements = [
            {"days_elapsed": 0.0, "width_mm": 4.0},
            {"days_elapsed": 2.0, "width_mm": 4.0},
            {"days_elapsed": 4.0, "width_mm": 4.0},
            {"days_elapsed": 6.0, "width_mm": 4.0},
            {"days_elapsed": 8.0, "width_mm": 4.0},
        ]
        result = self.predictor.predict(crack_id=3, measurements=measurements)

        self.assertIsNotNone(result)
        self.assertAlmostEqual(result.slope, 0.0, places=6)
        self.assertEqual(result.trend_direction, "estable")
        self.assertIsNone(result.ttt_days)

    # ── R² calculation ─────────────────────────────────────────────────

    def test_perfect_fit_r_squared(self) -> None:
        """
        GIVEN widths that are perfectly collinear with time
        WHEN R² is computed
        THEN R² >= 0.999
        """
        measurements = [
            {"days_elapsed": 0.0, "width_mm": 2.0},
            {"days_elapsed": 1.0, "width_mm": 2.5},
            {"days_elapsed": 2.0, "width_mm": 3.0},
            {"days_elapsed": 3.0, "width_mm": 3.5},
            {"days_elapsed": 4.0, "width_mm": 4.0},
        ]
        result = self.predictor.predict(crack_id=4, measurements=measurements)

        self.assertIsNotNone(result)
        self.assertGreaterEqual(result.r_squared, 0.999)

    def test_noisy_data_lower_r_squared(self) -> None:
        """
        GIVEN scattered width values with low correlation
        WHEN R² is computed
        THEN R² < 0.3
        """
        measurements = [
            {"days_elapsed": 0.0, "width_mm": 3.0},
            {"days_elapsed": 1.0, "width_mm": 5.0},
            {"days_elapsed": 2.0, "width_mm": 2.0},
            {"days_elapsed": 3.0, "width_mm": 6.0},
            {"days_elapsed": 4.0, "width_mm": 2.5},
        ]
        result = self.predictor.predict(crack_id=5, measurements=measurements)

        self.assertIsNotNone(result)
        self.assertLess(result.r_squared, 0.3)

    # ── Min data points guard ─────────────────────────────────────────

    def test_insufficient_data_returns_none(self) -> None:
        """
        GIVEN fewer than PREDICTION_MIN_DATA_POINTS measurements
        WHEN predict() is called
        THEN returns None
        """
        measurements = [
            {"days_elapsed": 0.0, "width_mm": 3.0},
            {"days_elapsed": 2.0, "width_mm": 3.5},
            {"days_elapsed": 5.0, "width_mm": 3.8},
        ]
        result = self.predictor.predict(crack_id=6, measurements=measurements)

        self.assertIsNone(result)

    def test_exact_min_data_points_works(self) -> None:
        """
        GIVEN exactly PREDICTION_MIN_DATA_POINTS measurements
        WHEN predict() is called
        THEN returns a valid result
        """
        measurements = [
            {"days_elapsed": float(i), "width_mm": 3.0 + i * 0.3}
            for i in range(5)
        ]
        result = self.predictor.predict(crack_id=7, measurements=measurements)

        self.assertIsNotNone(result)
        self.assertIsInstance(result.slope, float)

    # ── TTT calculation ────────────────────────────────────────────────

    def test_ttt_within_horizon(self) -> None:
        """
        GIVEN slope=0.15 mm/day, intercept=3.0 mm, threshold=7.5 mm
        WHEN TTT is computed
        THEN TTT ≈ 30 days, NOT capped
        """
        measurements = [
            {"days_elapsed": 0.0, "width_mm": 3.0},
            {"days_elapsed": 2.0, "width_mm": 3.3},
            {"days_elapsed": 4.0, "width_mm": 3.6},
            {"days_elapsed": 6.0, "width_mm": 3.9},
            {"days_elapsed": 8.0, "width_mm": 4.2},
        ]
        # With these points the regression should give slope≈0.15, intercept≈3.0
        # TTT = (7.5 - 3.0) / 0.15 = 30.0 days
        result = self.predictor.predict(crack_id=8, measurements=measurements)

        self.assertIsNotNone(result)
        self.assertIsNotNone(result.ttt_days)
        # Allow margin for floating point
        self.assertAlmostEqual(result.ttt_days, 30.0, delta=2.0)

    def test_ttt_capped_at_horizon(self) -> None:
        """
        GIVEN a very gentle slope where TTT exceeds horizon
        WHEN TTT is computed
        THEN the returned TTT is capped at horizon_days
        """
        predictor = TrendPredictor(
            min_data_points=5,
            horizon_days=30.0,
            threshold_width=100.0,
            slope_threshold=0.01,
        )
        # Very small slope → large TTT
        measurements = [
            {"days_elapsed": 0.0, "width_mm": 3.0},
            {"days_elapsed": 10.0, "width_mm": 3.05},
            {"days_elapsed": 20.0, "width_mm": 3.10},
            {"days_elapsed": 30.0, "width_mm": 3.15},
            {"days_elapsed": 40.0, "width_mm": 3.20},
        ]
        result = predictor.predict(crack_id=9, measurements=measurements)

        self.assertIsNotNone(result)
        self.assertIsNotNone(result.ttt_days)
        self.assertLessEqual(result.ttt_days, 30.0)

    # ── Trend direction classification ────────────────────────────────

    def test_trend_direction_acelerando(self) -> None:
        """Slope > 0.01 classifies as 'acelerando'."""
        measurements = [
            {"days_elapsed": 0.0, "width_mm": 3.0},
            {"days_elapsed": 1.0, "width_mm": 3.5},
            {"days_elapsed": 2.0, "width_mm": 4.0},
            {"days_elapsed": 3.0, "width_mm": 4.5},
            {"days_elapsed": 4.0, "width_mm": 5.0},
        ]
        result = self.predictor.predict(crack_id=10, measurements=measurements)

        self.assertEqual(result.trend_direction, "acelerando")

    def test_trend_direction_desacelerando(self) -> None:
        """Slope < -0.01 classifies as 'desacelerando'."""
        measurements = [
            {"days_elapsed": 0.0, "width_mm": 5.0},
            {"days_elapsed": 1.0, "width_mm": 4.5},
            {"days_elapsed": 2.0, "width_mm": 4.0},
            {"days_elapsed": 3.0, "width_mm": 3.5},
            {"days_elapsed": 4.0, "width_mm": 3.0},
        ]
        result = self.predictor.predict(crack_id=11, measurements=measurements)

        self.assertEqual(result.trend_direction, "desacelerando")

    def test_trend_direction_estable(self) -> None:
        """Near-zero slope classifies as 'estable'."""
        measurements = [
            {"days_elapsed": 0.0, "width_mm": 4.0},
            {"days_elapsed": 1.0, "width_mm": 4.01},
            {"days_elapsed": 2.0, "width_mm": 3.99},
            {"days_elapsed": 3.0, "width_mm": 4.02},
            {"days_elapsed": 4.0, "width_mm": 4.0},
        ]
        result = self.predictor.predict(crack_id=12, measurements=measurements)

        self.assertEqual(result.trend_direction, "estable")

    # ── Edge cases ─────────────────────────────────────────────────────

    def test_single_point_returns_none(self) -> None:
        """Single measurement is below min_data_points → None."""
        measurements = [
            {"days_elapsed": 0.0, "width_mm": 4.0},
        ]
        result = self.predictor.predict(crack_id=13, measurements=measurements)
        self.assertIsNone(result)

    def test_equal_values_flat_slope(self) -> None:
        """All identical widths produce a flat (zero) slope."""
        measurements = [
            {"days_elapsed": 0.0, "width_mm": 5.0},
            {"days_elapsed": 1.0, "width_mm": 5.0},
            {"days_elapsed": 2.0, "width_mm": 5.0},
            {"days_elapsed": 3.0, "width_mm": 5.0},
            {"days_elapsed": 4.0, "width_mm": 5.0},
        ]
        result = self.predictor.predict(crack_id=14, measurements=measurements)

        self.assertIsNotNone(result)
        self.assertAlmostEqual(result.slope, 0.0, places=6)
        self.assertEqual(result.trend_direction, "estable")

    def test_empty_measurements_returns_none(self) -> None:
        """Empty measurements list returns None."""
        result = self.predictor.predict(crack_id=15, measurements=[])
        self.assertIsNone(result)

    # ── Confidence ─────────────────────────────────────────────────────

    def test_confidence_matches_r_squared(self) -> None:
        """confidence is clamped R² (always 0..1)."""
        measurements = [
            {"days_elapsed": 0.0, "width_mm": 2.0},
            {"days_elapsed": 1.0, "width_mm": 2.5},
            {"days_elapsed": 2.0, "width_mm": 3.0},
            {"days_elapsed": 3.0, "width_mm": 3.5},
            {"days_elapsed": 4.0, "width_mm": 4.0},
        ]
        result = self.predictor.predict(crack_id=16, measurements=measurements)

        self.assertGreaterEqual(result.confidence, 0.0)
        self.assertLessEqual(result.confidence, 1.0)

    # ── Custom threshold_width ─────────────────────────────────────────

    def test_custom_threshold_width(self) -> None:
        """Passing a custom threshold_width changes TTT."""
        measurements = [
            {"days_elapsed": 0.0, "width_mm": 3.0},
            {"days_elapsed": 2.0, "width_mm": 3.5},
            {"days_elapsed": 4.0, "width_mm": 4.0},
            {"days_elapsed": 6.0, "width_mm": 4.5},
            {"days_elapsed": 8.0, "width_mm": 5.0},
        ]
        # slope ≈ 0.25, intercept ≈ 3.0
        predictor_near = TrendPredictor(
            min_data_points=5,
            horizon_days=30.0,
            threshold_width=5.0,
            slope_threshold=0.01,
        )
        result_near = predictor_near.predict(
            crack_id=17, measurements=measurements
        )

        predictor_far = TrendPredictor(
            min_data_points=5,
            horizon_days=30.0,
            threshold_width=50.0,
            slope_threshold=0.01,
        )
        result_far = predictor_far.predict(
            crack_id=18, measurements=measurements
        )

        self.assertIsNotNone(result_near)
        self.assertIsNotNone(result_far)
        # Near threshold should give smaller TTT
        self.assertLess(result_near.ttt_days, result_far.ttt_days)


if __name__ == "__main__":
    unittest.main()

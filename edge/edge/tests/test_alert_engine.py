"""
ARGOS SLOPE 4.0 — Unit tests for Velocity-Based Alert Engine (Sprint 5).

Tests the ``AlertEngine`` state machine: IDLE → ALERTING → RESOLVED → IDLE,
consecutive counting, suppression flags, deduplication, and publisher
integration.

Run with::

    python -m pytest edge/edge/tests/test_alert_engine.py -v
"""

from __future__ import annotations

import time as time_module
import unittest
from unittest.mock import MagicMock, patch

from edge.temporal.alert_engine import AlertEngine, AlertLevel, CrackAlertState


class TestAlertLevel(unittest.TestCase):
    """AlertLevel IntEnum ordering."""

    def test_level_ordering(self) -> None:
        """Verify NONE < MODERADA < RAPIDA ordering."""
        self.assertLess(AlertLevel.NONE, AlertLevel.MODERADA)
        self.assertLess(AlertLevel.MODERADA, AlertLevel.RAPIDA)

    def test_level_values(self) -> None:
        """Verify IntEnum values."""
        self.assertEqual(int(AlertLevel.NONE), 0)
        self.assertEqual(int(AlertLevel.MODERADA), 1)
        self.assertEqual(int(AlertLevel.RAPIDA), 2)


class TestAlertEngineDetermineLevel(unittest.TestCase):
    """Test ``AlertEngine._determine_level`` thresholds."""

    def setUp(self) -> None:
        self.engine = AlertEngine(
            velocity_moderada=0.5,
            velocity_rapida=2.0,
        )

    def test_negative_velocity_is_none(self) -> None:
        """Negative velocity is treated as NONE."""
        self.assertEqual(
            self.engine._determine_level(-1.0), AlertLevel.NONE
        )
        self.assertEqual(
            self.engine._determine_level(-0.001), AlertLevel.NONE
        )

    def test_zero_velocity_is_none(self) -> None:
        """Zero velocity is NONE."""
        self.assertEqual(
            self.engine._determine_level(0.0), AlertLevel.NONE
        )

    def test_below_moderada_is_none(self) -> None:
        """Velocity below moderada threshold is NONE."""
        self.assertEqual(
            self.engine._determine_level(0.49), AlertLevel.NONE
        )

    def test_at_moderada_threshold(self) -> None:
        """Velocity at exactly moderada threshold."""
        self.assertEqual(
            self.engine._determine_level(0.5), AlertLevel.MODERADA
        )

    def test_between_moderada_and_rapida(self) -> None:
        """Velocity between thresholds is MODERADA."""
        self.assertEqual(
            self.engine._determine_level(1.5), AlertLevel.MODERADA
        )

    def test_at_rapida_threshold(self) -> None:
        """Velocity at exactly rapida threshold."""
        self.assertEqual(
            self.engine._determine_level(2.0), AlertLevel.RAPIDA
        )

    def test_above_rapida_threshold(self) -> None:
        """Velocity above rapida threshold."""
        self.assertEqual(
            self.engine._determine_level(5.0), AlertLevel.RAPIDA
        )


class TestAlertEngine(unittest.TestCase):
    """Core alert engine state machine tests."""

    def setUp(self) -> None:
        self.engine = AlertEngine(
            velocity_moderada=0.5,
            velocity_rapida=2.0,
            min_consecutive=3,
            cooldown_minutes=60,
        )

    # ── IDLE → ALERTING ──────────────────────────────────────────────

    def test_idle_to_alerting_moderada(self) -> None:
        """Velocity above moderada for min_consecutive runs triggers alert."""
        v_moderada = 1.0  # mm/day → MODERADA

        # 1st call: consecutive=1, no alert
        result = self.engine.update(track_id=1, velocity_mm_day=v_moderada)
        self.assertIsNone(result)
        state = self.engine.get_state(1)
        assert state is not None
        self.assertEqual(state.consecutive_count, 1)
        self.assertFalse(state.alert_raised)

        # 2nd call: consecutive=2, no alert
        result = self.engine.update(track_id=1, velocity_mm_day=v_moderada)
        self.assertIsNone(result)

        # 3rd call: consecutive=3 >= min_consecutive → ALERTING
        result = self.engine.update(track_id=1, velocity_mm_day=v_moderada)
        self.assertIsNotNone(result)
        self.assertEqual(result["event"], "alerta_velocidad")
        self.assertEqual(result["category"], "moderada")
        self.assertEqual(result["level"], int(AlertLevel.MODERADA))
        self.assertEqual(result["track_id"], 1)
        self.assertTrue(result["alert_id"].startswith("ALT-"))

        # State is now ALERTING
        state = self.engine.get_state(1)
        assert state is not None
        self.assertTrue(state.alert_raised)
        self.assertIsNotNone(state.alert_id)

    def test_idle_to_alerting_rapida(self) -> None:
        """Velocity above rapida threshold for min_consecutive runs."""
        v_rapida = 3.0  # mm/day → RAPIDA

        # First two calls: no alert yet
        for _ in range(2):
            result = self.engine.update(track_id=1, velocity_mm_day=v_rapida)
            self.assertIsNone(result)

        # Third call → ALERTING
        result = self.engine.update(track_id=1, velocity_mm_day=v_rapida)
        self.assertIsNotNone(result)
        self.assertEqual(result["category"], "rapida")
        self.assertEqual(result["level"], int(AlertLevel.RAPIDA))

    # ── ALERTING → RESOLVED ──────────────────────────────────────────

    def test_alerting_to_resolved(self) -> None:
        """Velocity drops below moderada → transition to RESOLVED."""
        # Trigger alert first
        for _ in range(3):
            self.engine.update(track_id=1, velocity_mm_day=1.0)
        self.assertTrue(self.engine.get_state(1).alert_raised)

        # Now velocity drops to zero
        result = self.engine.update(track_id=1, velocity_mm_day=0.0)
        self.assertIsNone(result)

        state = self.engine.get_state(1)
        assert state is not None
        self.assertFalse(state.alert_raised)
        self.assertIsNone(state.alert_id)
        self.assertIsNotNone(state.resolved_at)

    # ── RESOLVED → IDLE after cooldown ──────────────────────────────

    def test_resolved_to_idle_after_cooldown(self) -> None:
        """Track transitions back to IDLE once cooldown expires."""
        engine = AlertEngine(
            velocity_moderada=0.5,
            velocity_rapida=2.0,
            min_consecutive=1,  # immediate alert
            cooldown_minutes=1,  # 1 minute cooldown
        )

        # Trigger alert then resolve
        engine.update(track_id=1, velocity_mm_day=1.0)
        engine.update(track_id=1, velocity_mm_day=0.0)
        resolved_at = engine.get_state(1).resolved_at
        self.assertIsNotNone(resolved_at)

        # Advance time past cooldown
        far_future = resolved_at + 61.0  # 61 seconds > 1 minute
        with patch.object(time_module, "time", return_value=far_future):
            result = engine.update(track_id=1, velocity_mm_day=0.0)

        # No payload for IDLE transition
        self.assertIsNone(result)

        # State should be IDLE (resolved_at=None)
        state = engine.get_state(1)
        assert state is not None
        self.assertIsNone(state.resolved_at)

    # ── Consecutive count ────────────────────────────────────────────

    def test_no_alert_before_min_consecutive(self) -> None:
        """Need at least min_consecutive runs before alerting."""
        for i in range(1, self.engine.min_consecutive):
            result = self.engine.update(track_id=1, velocity_mm_day=1.0)
            self.assertIsNone(
                result,
                f"Unexpected alert at call #{i} (consecutive={i})",
            )

    def test_consecutive_reset_on_drop(self) -> None:
        """Dropping velocity resets consecutive counter."""
        # 2 runs at moderada velocity
        self.engine.update(track_id=1, velocity_mm_day=1.0)
        self.engine.update(track_id=1, velocity_mm_day=1.0)
        self.assertEqual(self.engine.get_state(1).consecutive_count, 2)

        # Velocity drops → consecutive resets to 0
        self.engine.update(track_id=1, velocity_mm_day=0.0)
        self.assertEqual(self.engine.get_state(1).consecutive_count, 0)

        # Need 3 fresh consecutive runs again
        self.engine.update(track_id=1, velocity_mm_day=1.0)
        self.engine.update(track_id=1, velocity_mm_day=1.0)
        self.assertEqual(self.engine.get_state(1).consecutive_count, 2)
        result = self.engine.update(track_id=1, velocity_mm_day=1.0)
        # Now consecutive=3 → alert
        self.assertIsNotNone(result)

    # ── Deduplication ─────────────────────────────────────────────────

    def test_deduplication(self) -> None:
        """Same level doesn't re-publish once ALERTING is active."""
        # Trigger alert
        for _ in range(3):
            self.engine.update(track_id=1, velocity_mm_day=1.0)
        self.assertTrue(self.engine.get_state(1).alert_raised)

        # Subsequent updates at same level → no payload (already alerting)
        for i in range(3):
            result = self.engine.update(track_id=1, velocity_mm_day=1.0)
            self.assertIsNone(
                result,
                f"Re-published alert at call #{i} (expected dedup)",
            )

    # ── Suppression flags ────────────────────────────────────────────

    def test_suppress_moderada(self) -> None:
        """moderada_enabled=False suppresses MODERADA alerts."""
        engine = AlertEngine(
            moderada_enabled=False,
            min_consecutive=1,
        )

        for _ in range(3):
            result = engine.update(track_id=1, velocity_mm_day=1.0)
            self.assertIsNone(result)
            self.assertFalse(engine.get_state(1).alert_raised)

    def test_suppress_rapida(self) -> None:
        """rapida_enabled=False suppresses RAPIDA alerts."""
        engine = AlertEngine(
            rapida_enabled=False,
            min_consecutive=1,
        )

        for _ in range(3):
            result = engine.update(track_id=1, velocity_mm_day=3.0)
            self.assertIsNone(result)
            self.assertFalse(engine.get_state(1).alert_raised)

    def test_suppress_moderada_allows_rapida(self) -> None:
        """When moderada is suppressed, rapida still triggers."""
        engine = AlertEngine(
            moderada_enabled=False,
            rapida_enabled=True,
            min_consecutive=1,
        )

        # Moderada should not alert
        self.assertIsNone(
            engine.update(track_id=1, velocity_mm_day=1.0)
        )
        self.assertFalse(engine.get_state(1).alert_raised)

        # Rapida should still alert
        result = engine.update(track_id=2, velocity_mm_day=3.0)
        self.assertIsNotNone(result)
        self.assertEqual(result["category"], "rapida")

    # ── Negative velocity ────────────────────────────────────────────

    def test_negative_velocity(self) -> None:
        """Negative velocity is treated as NONE level."""
        self.assertEqual(
            self.engine._determine_level(-0.5), AlertLevel.NONE
        )
        result = self.engine.update(track_id=1, velocity_mm_day=-0.5)
        self.assertIsNone(result)
        state = self.engine.get_state(1)
        assert state is not None
        self.assertEqual(state.level, AlertLevel.NONE)

    # ── Multiple tracks ──────────────────────────────────────────────

    def test_multiple_tracks_independent(self) -> None:
        """Each track has its own independent alert state."""
        # Track 1 reaches ALERTING
        for _ in range(3):
            self.engine.update(track_id=1, velocity_mm_day=1.0)
        self.assertTrue(self.engine.get_state(1).alert_raised)

        # Track 2 begins its own update cycle (starts IDLE)
        self.engine.update(track_id=2, velocity_mm_day=0.1)
        state2 = self.engine.get_state(2)
        self.assertIsNotNone(state2)
        self.assertFalse(state2.alert_raised)

        # Track 2 can independently reach ALERTING
        for _ in range(3):
            self.engine.update(track_id=2, velocity_mm_day=2.5)
        self.assertTrue(self.engine.get_state(2).alert_raised)

        # Track 1 is unaffected by track 2's operations
        self.assertTrue(self.engine.get_state(1).alert_raised)

    # ── Payload schema ───────────────────────────────────────────────

    def test_payload_schema(self) -> None:
        """Verify all required fields are present in the alert payload."""
        engine = AlertEngine(
            min_consecutive=1,
            device_id="test-device",
        )
        result = engine.update(
            track_id=42,
            velocity_mm_day=1.5,
            roi_id="CRK-TEST",
            width_mm=3.2,
            smoothed_velocity=1.3,
        )
        self.assertIsNotNone(result)

        required_fields = [
            "alert_id",
            "event",
            "device_id",
            "track_id",
            "roi_id",
            "level",
            "category",
            "velocity_mm_day",
            "smoothed_velocity",
            "width_mm",
            "consecutive_measurements",
            "timestamp",
        ]
        for field in required_fields:
            self.assertIn(field, result, f"Missing field: {field}")

        # Verify types and values
        self.assertEqual(result["event"], "alerta_velocidad")
        self.assertEqual(result["device_id"], "test-device")
        self.assertEqual(result["track_id"], 42)
        self.assertEqual(result["roi_id"], "CRK-TEST")
        self.assertEqual(result["category"], "moderada")
        self.assertEqual(result["level"], int(AlertLevel.MODERADA))
        self.assertIsInstance(result["velocity_mm_day"], float)
        self.assertIsInstance(result["smoothed_velocity"], float)
        self.assertIsInstance(result["width_mm"], float)
        self.assertIsInstance(result["consecutive_measurements"], int)
        self.assertIsInstance(result["timestamp"], float)

    # ── Reset ────────────────────────────────────────────────────────

    def test_reset_track(self) -> None:
        """reset_track clears the alert state for that track."""
        for _ in range(3):
            self.engine.update(track_id=1, velocity_mm_day=1.0)
        self.assertIsNotNone(self.engine.get_state(1))

        self.engine.reset_track(1)
        self.assertIsNone(self.engine.get_state(1))

        # After reset, track can alert again fresh
        for _ in range(3):
            result = self.engine.update(track_id=1, velocity_mm_day=1.0)
        self.assertIsNotNone(result)

    def test_reset_all(self) -> None:
        """reset_all clears all states."""
        for tid in [1, 2, 3]:
            for _ in range(3):
                self.engine.update(track_id=tid, velocity_mm_day=1.0)

        self.assertEqual(len(self.engine.get_states()), 3)
        self.engine.reset_all()
        self.assertEqual(len(self.engine.get_states()), 0)

    # ── Publisher integration ────────────────────────────────────────

    def test_publisher_called(self) -> None:
        """Publisher callable is invoked when alert transitions to ALERTING."""
        publisher = MagicMock(return_value=True)
        engine = AlertEngine(
            min_consecutive=1,
            publisher=publisher,
        )

        result = engine.update(track_id=1, velocity_mm_day=1.0)
        self.assertIsNotNone(result)
        publisher.assert_called_once_with(result)

    def test_publisher_not_called_when_idle(self) -> None:
        """Publisher is NOT invoked when no alert is raised."""
        publisher = MagicMock(return_value=True)
        engine = AlertEngine(
            min_consecutive=3,
            publisher=publisher,
        )

        # First call — not enough consecutive yet
        engine.update(track_id=1, velocity_mm_day=1.0)
        publisher.assert_not_called()

    def test_publisher_exception_swallowed(self) -> None:
        """Exceptions from publisher callable are logged, not raised."""
        publisher = MagicMock(side_effect=RuntimeError("MQTT down"))
        engine = AlertEngine(
            min_consecutive=1,
            publisher=publisher,
        )

        # Should not raise — exception is caught and logged
        result = engine.update(track_id=1, velocity_mm_day=1.0)
        self.assertIsNotNone(result)
        publisher.assert_called_once()


class TestAlertEngineCooldown(unittest.TestCase):
    """Cooldown edge-case tests."""

    def test_immediate_re_alert_after_cooldown(self) -> None:
        """After cooldown, sustained velocity can re-alert immediately."""
        engine = AlertEngine(
            min_consecutive=1,
            cooldown_minutes=1,
        )

        # Alert → Resolve
        engine.update(track_id=1, velocity_mm_day=1.0)
        engine.update(track_id=1, velocity_mm_day=0.0)
        resolved_at = engine.get_state(1).resolved_at

        # Advance time past cooldown + velocity still high
        far_future = resolved_at + 61.0
        with patch.object(time_module, "time", return_value=far_future):
            result = engine.update(track_id=1, velocity_mm_day=1.0)

        # Should re-alert (cooldown expired and velocity still >= MODERADA)
        self.assertIsNotNone(result)
        self.assertEqual(result["category"], "moderada")


class TestCrackAlertState(unittest.TestCase):
    """CrackAlertState dataclass tests."""

    def test_default_values(self) -> None:
        """Default values for new state."""
        state = CrackAlertState(track_id=1)
        self.assertEqual(state.track_id, 1)
        self.assertEqual(state.level, AlertLevel.NONE)
        self.assertEqual(state.consecutive_count, 0)
        self.assertFalse(state.alert_raised)
        self.assertIsNone(state.alert_id)
        self.assertIsNone(state.last_alerted_at)
        self.assertIsNone(state.resolved_at)


if __name__ == "__main__":
    unittest.main()

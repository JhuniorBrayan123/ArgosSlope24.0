"""
ARGOS SLOPE 4.0 — Unit tests for MqttPublisher (Sprint 7).

Tests the ``publish_prediction_alert`` method and existing publisher
functionality using mocked MQTT client.

Run with::

    python -m pytest edge/edge/tests/test_publisher.py -v
"""

from __future__ import annotations

import json
import unittest
from unittest.mock import MagicMock, patch

import paho.mqtt.client as mqtt_real

from edge.temporal.trend_predictor import TrendPredictionResult

# Patch paho-mqtt before importing MqttPublisher
mqtt_mock = MagicMock()
mqtt_mock.MQTT_ERR_SUCCESS = mqtt_real.MQTT_ERR_SUCCESS
mqtt_mock.CallbackAPIVersion = MagicMock()
mqtt_mock.CallbackAPIVersion.VERSION1 = 1
mqtt_mock.MQTTv311 = 3

with patch.dict("sys.modules", {"paho.mqtt": mqtt_mock, "paho.mqtt.client": mqtt_mock}):
    from edge.mqtt.publisher import MqttPublisher


class TestMqttPublisherPrediction(unittest.TestCase):
    """MqttPublisher.publish_prediction_alert tests."""

    def setUp(self) -> None:
        # Patch config values
        self.config_patcher = patch("edge.mqtt.publisher.config")
        self.mock_config = self.config_patcher.start()
        self.mock_config.mqtt_broker = "localhost"
        self.mock_config.mqtt_port = 1883
        self.mock_config.mqtt_username = ""
        self.mock_config.mqtt_password = ""
        self.mock_config.mqtt_tls_enabled = False
        self.mock_config.mqtt_qos = 1
        self.mock_config.mqtt_topic_prefix = "argos/test-device"
        self.mock_config.device_id = "test-device"

        self.publisher = MqttPublisher()
        # Set up a mock client so _connected is True
        self.publisher._client = MagicMock()
        self.publisher._client.publish.return_value.rc = mqtt_real.MQTT_ERR_SUCCESS
        self.publisher._connected = True

    def tearDown(self) -> None:
        self.config_patcher.stop()

    def _make_prediction(
        self,
        direction: str = "acelerando",
        slope: float = 2.5,
        r_squared: float = 0.85,
        ttt_days: float | None = 5.0,
        confidence: float = 0.85,
    ) -> TrendPredictionResult:
        return TrendPredictionResult(
            trend_direction=direction,
            slope=slope,
            r_squared=r_squared,
            ttt_days=ttt_days,
            confidence=confidence,
        )

    # ── Payload format ───────────────────────────────────────────────

    def test_prediction_payload_has_all_fields(self) -> None:
        """
        GIVEN a prediction result
        WHEN publish_prediction_alert() is called
        THEN the payload includes all required prediction fields
        """
        prediction = self._make_prediction()
        self.publisher.publish_prediction_alert(
            crack_id=42,
            prediction=prediction,
            trace_id="trace-001",
        )

        # Capture the published payload
        self.publisher._client.publish.assert_called_once()
        args, _ = self.publisher._client.publish.call_args
        topic = args[0]
        payload_str = args[1]

        # Verify topic
        self.assertIn("argos/test-device/prediction/42", topic)

        # Parse and verify payload
        payload = json.loads(payload_str)
        self.assertEqual(payload["track_id"], 42)
        self.assertEqual(payload["trend_direction"], "acelerando")
        self.assertEqual(payload["slope"], 2.5)
        self.assertEqual(payload["r_squared"], 0.85)
        self.assertEqual(payload["ttt_days"], 5.0)
        self.assertEqual(payload["confidence"], 0.85)
        self.assertEqual(payload["trace_id"], "trace-001")
        self.assertEqual(payload["event"], "prediccion_tendencia")
        self.assertEqual(payload["device_id"], "test-device")
        self.assertIn("timestamp", payload)

    # ── Topic naming ─────────────────────────────────────────────────

    def test_topic_includes_crack_id(self) -> None:
        """
        GIVEN a prediction for crack_id=99
        WHEN publish_prediction_alert() is called
        THEN the topic ends with /prediction/99
        """
        prediction = self._make_prediction()
        self.publisher.publish_prediction_alert(
            crack_id=99,
            prediction=prediction,
            trace_id="trace-002",
        )

        args, _ = self.publisher._client.publish.call_args
        topic = args[0]
        self.assertEqual(topic, "argos/test-device/prediction/99")

    def test_topic_with_different_crack_id(self) -> None:
        """
        GIVEN crack_id=7
        WHEN publish_prediction_alert() is called
        THEN the topic is correct for that ID
        """
        prediction = self._make_prediction()
        self.publisher.publish_prediction_alert(
            crack_id=7,
            prediction=prediction,
            trace_id="trace-003",
        )

        args, _ = self.publisher._client.publish.call_args
        topic = args[0]
        self.assertEqual(topic, "argos/test-device/prediction/7")

    # ── TTT None handling ────────────────────────────────────────────

    def test_ttt_none_serialized_as_null(self) -> None:
        """
        GIVEN a prediction with ttt_days=None
        WHEN publish_prediction_alert() is called
        THEN the payload has ttt_days as null
        """
        prediction = self._make_prediction(ttt_days=None, slope=-0.5)
        self.publisher.publish_prediction_alert(
            crack_id=10,
            prediction=prediction,
            trace_id="trace-004",
        )

        args, _ = self.publisher._client.publish.call_args
        payload = json.loads(args[1])
        self.assertIsNone(payload["ttt_days"])

    # ── Error handling (broker offline) ──────────────────────────────

    def test_not_connected_returns_false(self) -> None:
        """
        GIVEN a publisher that is not connected to the broker
        WHEN publish_prediction_alert() is called
        THEN it returns False and does not publish
        """
        self.publisher._connected = False
        prediction = self._make_prediction()
        result = self.publisher.publish_prediction_alert(
            crack_id=1,
            prediction=prediction,
            trace_id="trace-005",
        )

        self.assertFalse(result)
        self.publisher._client.publish.assert_not_called()

    def test_publish_failure_returns_false(self) -> None:
        """
        GIVEN the MQTT publish fails with non-zero rc
        WHEN publish_prediction_alert() is called
        THEN it returns False
        """
        self.publisher._client.publish.return_value.rc = 1  # non-success (int ≠ enum)
        prediction = self._make_prediction()
        result = self.publisher.publish_prediction_alert(
            crack_id=1,
            prediction=prediction,
            trace_id="trace-006",
        )

        self.assertFalse(result)

    def test_publish_success_returns_true(self) -> None:
        """
        GIVEN a successful MQTT publish
        WHEN publish_prediction_alert() is called
        THEN it returns True
        """
        prediction = self._make_prediction()
        result = self.publisher.publish_prediction_alert(
            crack_id=1,
            prediction=prediction,
            trace_id="trace-007",
        )

        self.assertTrue(result)


if __name__ == "__main__":
    unittest.main()

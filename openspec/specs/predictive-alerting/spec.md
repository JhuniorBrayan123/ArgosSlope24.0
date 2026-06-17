# Predictive Alerting Specification

## Purpose

Extend the velocity-based alert engine with predictive alert categories (`PREDICTED_WARNING`, `PREDICTED_CRITICAL`) that fire based on trend predictions rather than instantaneous velocity. The FSM remains IDLE→ALERTING→RESOLVED, but the ALERTING transition can now be triggered by prediction-based signals alongside velocity-based signals.

## Requirements

### Requirement: New AlertLevel enum values

The `AlertLevel` enum SHALL gain two new levels after `RAPIDA`:

```python
class AlertLevel(IntEnum):
    NONE = 0
    MODERADA = 1
    RAPIDA = 2
    PREDICTED_WARNING = 3    # ← new
    PREDICTED_CRITICAL = 4   # ← new
```

- `PREDICTED_WARNING` corresponds to TTT between 7 and 30 days (configurable).
- `PREDICTED_CRITICAL` corresponds to TTT ≤ 7 days (configurable).
- Existing numeric comparisons (`>=`, `<`) continue to work; `PREDICTED_CRITICAL` is the highest severity.

#### Scenario: Enum ordering

- GIVEN `AlertLevel.PREDICTED_CRITICAL` (4) and `AlertLevel.PREDICTED_WARNING` (3)
- WHEN these are compared with other levels
- THEN `PREDICTED_CRITICAL > PREDICTED_WARNING > RAPIDA > MODERADA > NONE`

### Requirement: AlertEngine.update() accepts optional prediction

The `AlertEngine.update()` method SHALL accept an optional `prediction` parameter (`dict | None`).

```python
def update(
    self,
    track_id: int,
    velocity_mm_day: float,
    roi_id: str = "",
    width_mm: float = 0.0,
    smoothed_velocity: Optional[float] = None,
    prediction: Optional[dict] = None,   # ← new
) -> Optional[dict]:
```

- If `prediction` is provided and `velocity_mm_day` is below the `MODERADA` threshold (i.e., no velocity alert), the engine evaluates the prediction's `direction` and `ttt_days`.
- If `prediction["direction"] == "acelerando"` and `prediction["ttt_days"]` is not None and `prediction["confidence"] != "low"`:
  - `ttt_days ≤ 7` → `PREDICTED_CRITICAL`
  - `7 < ttt_days ≤ 30` → `PREDICTED_WARNING`
- The FSM transitions follow the same IDLE→ALERTING→RESOLVED pattern.

#### Scenario: Predictive critical alert fires

- GIVEN a track in IDLE state with velocity 0.2 mm/day (below MODERADA)
- AND a prediction with direction `"acelerando"`, TTT = 5 days, confidence `"high"`
- WHEN `update()` is called with the prediction
- THEN the engine transitions to ALERTING with level `PREDICTED_CRITICAL`
- AND the returned payload includes `level: 4` and `category: "predicted_critical"`

#### Scenario: Low-confidence prediction does not alert

- GIVEN a track in IDLE state
- AND a prediction with direction `"acelerando"`, TTT = 5 days, confidence `"low"`
- WHEN `update()` is called
- THEN the engine stays in IDLE, no alert fires

#### Scenario: Velocity alert takes precedence over prediction

- GIVEN a track with velocity 2.5 mm/day (RAPIDA)
- AND a prediction with direction `"estable"`
- WHEN `update()` is called
- THEN the engine evaluates velocity first → fires RAPIDA alert
- Prediction does NOT override a velocity-based alert

### Requirement: Predictive alert suppression flags

The engine SHALL respect `predicted_warning_enabled` and `predicted_critical_enabled` boolean flags (default `True`), following the same pattern as `moderada_enabled` and `rapida_enabled`.

- `AlertEngine.__init__()` gains both parameters.
- When a flag is `False`, alerts of that category are suppressed but the state machine still acknowledges the level internally.

#### Scenario: Predictive alerts disabled

- GIVEN `AlertEngine` with `predicted_critical_enabled=False`
- WHEN all conditions for a PREDICTED_CRITICAL alert are met
- THEN the engine does NOT publish an alert (stays in IDLE)

### Requirement: Predictive payload structure

When a predictive alert fires, the payload SHALL include prediction-specific fields:

```json
{
    "alert_id": "ALT-{timestamp}-{track_id}",
    "event": "alerta_prediccion",
    "device_id": "...",
    "track_id": 1,
    "roi_id": "CRK-00000001",
    "level": 3,
    "category": "predicted_warning",
    "velocity_mm_day": 0.2,
    "smoothed_velocity": null,
    "width_mm": 4.5,
    "ttt_days": 12,
    "trend_direction": "acelerando",
    "r_squared": 0.89,
    "confidence": "high",
    "consecutive_measurements": 0,
    "timestamp": 1234567890.0
}
```

#### Scenario: Published prediction alert has correct fields

- GIVEN a PREDICTED_WARNING alert fires
- WHEN the payload is published via MQTT
- THEN the payload includes `event: "alerta_prediccion"`, `ttt_days`, `trend_direction`, `r_squared`, and `confidence`

### Requirement: MQTT predictive alert topic

The publisher SHALL support `publish_prediction_alert(payload: dict) -> bool` that publishes to `{topic_prefix}/prediccion`.

- Same return semantics as `publish_velocity_alert` (True on success, False if not connected).
- The AlertEngine publisher callable is wired to this method.

#### Scenario: Prediction alert published

- GIVEN `MqttPublisher` is connected to a broker
- WHEN `publish_prediction_alert(payload)` is called
- THEN a JSON message is published on `argos/slope-01/prediccion` with QoS 1

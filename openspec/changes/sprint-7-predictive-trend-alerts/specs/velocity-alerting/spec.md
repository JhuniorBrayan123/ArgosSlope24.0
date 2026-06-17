# Delta for velocity-alerting

## MODIFIED Requirements

### Requirement: AlertEngine processes both velocity and prediction signals

The system SHALL provide an `AlertEngine` that monitors crack deformation velocity AND trend predictions, generating alerts when sustained velocity thresholds are exceeded OR when a prediction indicates a near-term critical width.

The engine now implements a per-track state machine with four alert levels:

```
IDLE → ALERTING (via velocity or prediction) → RESOLVED → IDLE
```
(Previously: only velocity-based alerting with three levels: NONE, MODERADA, RAPIDA)

#### Scenario: Velocity-based MODERADA alert (unchanged)

- GIVEN a track in IDLE state with 4 consecutive measurements above `velocity_moderada` (0.5 mm/day)
- WHEN `update()` is called with velocity 0.6 mm/day
- THEN the engine transitions to ALERTING with level `MODERADA` and category `"moderada"`

#### Scenario: Velocity-based RAPIDA alert (unchanged)

- GIVEN a track in IDLE state with 3 consecutive measurements above `velocity_rapida` (2.0 mm/day)
- WHEN `update()` is called with velocity 2.5 mm/day
- THEN the engine transitions to ALERTING with level `RAPIDA` and category `"rapida"`

#### Scenario: Prediction-based PREDICTED_WARNING alert (NEW)

- GIVEN a track in IDLE state with velocity below MODERADA threshold
- AND a prediction with direction `"acelerando"`, TTT = 15 days, confidence `"high"`
- WHEN `update()` is called with the prediction parameter
- THEN the engine transitions to ALERTING with level `PREDICTED_WARNING` and category `"predicted_warning"`

#### Scenario: Prediction-based PREDICTED_CRITICAL alert (NEW)

- GIVEN a track in IDLE state with velocity below MODERADA threshold
- AND a prediction with direction `"acelerando"`, TTT = 3 days, confidence `"high"`
- WHEN `update()` is called with the prediction parameter
- THEN the engine transitions to ALERTING with level `PREDICTED_CRITICAL` and category `"predicted_critical"`

#### Scenario: Velocity alert takes precedence (NEW)

- GIVEN a track with velocity 2.5 mm/day (RAPIDA) AND a prediction of TTT = 5 days
- WHEN `update()` is called
- THEN the engine fires RAPIDA (velocity-based), not PREDICTED_CRITICAL

#### Scenario: Resolution returns to IDLE (unchanged)

- GIVEN a track in ALERTING state (any alert level)
- WHEN velocity drops below MODERADA consistently
- THEN the engine transitions to RESOLVED, then back to IDLE after cooldown

### Requirement: AlertEngine constructor gains prediction config

The `AlertEngine.__init__()` SHALL accept two new parameters:

- `predicted_warning_enabled: bool = True` — suppression flag for PREDICTED_WARNING
- `predicted_critical_enabled: bool = True` — suppression flag for PREDICTED_CRITICAL

(Previously: no prediction-related parameters existed.)

### Requirement: FastAPI endpoint for predictions

The backend SHALL expose:

- `GET /api/predicciones` — returns all current predictions (one per track with prediction data)
- `GET /api/fisuras/{track_id}` — existing response gains a `"prediccion"` field when a prediction exists for that track

(Previously: no prediction endpoints existed.)

#### Scenario: Predictions endpoint returns list

- GIVEN 3 tracks with prediction data
- WHEN `GET /api/predicciones` is called
- THEN the response is a JSON array with 3 entries, each containing `track_id`, `direction`, `ttt_days`, `r_squared`, `confidence`, `timestamp`

#### Scenario: Fisura detail includes prediction

- GIVEN track 5 has a valid prediction
- WHEN `GET /api/fisuras/5` is called
- THEN the response includes `"prediccion": { "direction": "acelerando", "ttt_days": 12, ... }`

### Requirement: Frontend displays trend arrows and TTT

The `PanelAlertas.tsx` component SHALL render prediction-related information for alerts of type `predicted_warning` and `predicted_critical`:

- A trend arrow indicator (↑ for acelerando, → for estable, ↓ for desacelerando)
- TTT countdown text: `"Estimado: X días para umbral crítico"`
- The `FiltroTipo` type gains `'predicted_warning'` and `'predicted_critical'` values
- A new stats card shows count of predictive alerts
- A new `obtenerPredicciones()` function in `lib/api.js`

(Previously: no prediction display existed.)

#### Scenario: Alert card shows trend arrow

- GIVEN an alert with `category = "predicted_warning"`, `trend_direction = "acelerando"`, `ttt_days = 12`
- WHEN the alert is rendered in `PanelAlertas`
- THEN the card displays an ↑ arrow, "12 días para umbral crítico", and the badge "predicted_warning"

#### Scenario: Predictive alerts filterable

- GIVEN the filter dropdown includes "Pred. Warning" and "Pred. Critical"
- WHEN a user selects "Pred. Critical"
- THEN only alerts with `tipo === 'predicted_critical'` are shown

# Trend Prediction Specification

## Purpose

Predict future crack width from historical measurements using linear regression. Provides operators with trend direction (acelerando/estable/desacelerando) and estimated time-to-threshold (TTT) before a crack reaches a dangerous width. All predictions include an R² goodness-of-fit to guard against false confidence on noisy data.

## Requirements

### Requirement: TrendPredictor runs linear regression on historical widths

The system SHALL expose a `TrendPredictor` class in `edge/edge/temporal/trend_predictor.py` that fits a first-degree polynomial (linear regression) over the last N historical measurements.

- **Regression input**: array of `(days_elapsed, width_mm)` pairs derived from `CrackHistoryStore.load_by_track()`, where `days_elapsed` is relative to the earliest measurement.
- **Minimum data points**: The predictor MUST return `None` (no prediction) when fewer than `PREDICTION_MIN_DATA_POINTS` measurements exist (default 5).
- **Slope classification**: Slope > 0.001 → `"acelerando"`, slope < -0.001 → `"desacelerando"`, otherwise → `"estable"`.

#### Scenario: Happy path — enough data, widening trend

- GIVEN a track has 8 measurements of width_mm at days [0, 1, 3, 5, 7, 10, 12, 14] with strictly increasing widths
- WHEN `TrendPredictor.predict(track_id)` is called
- THEN the predictor returns slope > 0, direction `"acelerando"`, a numeric TTT, and R² > 0.8

#### Scenario: Insufficient data returns None

- GIVEN a track has only 3 measurements
- WHEN `predict()` is called
- THEN the predictor returns `None` and logs a warning

#### Scenario: Flat/negative slope

- GIVEN a track where width is decreasing over time (slope < -0.001)
- WHEN `predict()` is called
- THEN direction is `"desacelerando"`, TTT is capped at `PREDICTION_HORIZON_DAYS` (default 30), and the payload includes `"ttt_capped": true`

### Requirement: Time-to-Threshold (TTT) calculation

The system SHALL compute TTT as the number of days until the regression line reaches a configurable threshold width.

- **Threshold**: Uses `alert_velocity_rapida` × `PREDICTION_HORIZON_DAYS` as the width threshold, or a fixed threshold per crack if configured.
- **Formula**: `TTT = (threshold_width - intercept) / slope`, provided slope > 0.
- **Capping**: If TTT > `PREDICTION_HORIZON_DAYS` (default 30), TTT is capped and `ttt_capped` is set to `true`.
- **Infinite/slope-zero**: If slope <= 0, TTT is set to `None` and a `"no proyectable"` label is surfaced.

#### Scenario: TTT within horizon

- GIVEN slope = 0.15 mm/day, intercept = 3.0 mm, threshold = 7.5 mm
- WHEN TTT is computed
- THEN TTT = 30 days, `ttt_capped` = false

#### Scenario: TTT exceeds horizon

- GIVEN slope = 0.02 mm/day, intercept = 3.0 mm, threshold = 7.5 mm → TTT = 225 days
- WHEN TTT is computed
- THEN TTT is capped at 30, `ttt_capped` = true

### Requirement: R² goodness-of-fit

The predictor SHALL compute and return the coefficient of determination (R²) alongside every prediction.

- **Range**: 0.0 to 1.0. Values below 0.3 are flagged as `"low_confidence"`.
- **Output**: Included in the prediction payload as `r_squared`.

#### Scenario: Excellent fit

- GIVEN widths are nearly collinear with days_elapsed
- WHEN R² is computed
- THEN R² >= 0.95

#### Scenario: Noisy data

- GIVEN widths are scattered with low correlation to time
- WHEN R² is computed
- THEN R² < 0.3 and the payload includes `confidence: "low"`

### Requirement: Prediction output schema

The predictor SHALL return a dict with the following keys:

```python
{
    "track_id": int,
    "slope": float,           # mm/day (regression coefficient)
    "intercept": float,       # mm
    "r_squared": float,       # 0.0–1.0
    "direction": str,         # "acelerando" | "estable" | "desacelerando"
    "ttt_days": float | None, # days until threshold, capped
    "ttt_capped": bool,       # true if capped at horizon
    "confidence": str,        # "high" if R² ≥ 0.7, "medium" if ≥ 0.3, "low" otherwise
    "data_points": int,       # number of measurements used
}
```

#### Scenario: Complete prediction output

- GIVEN a valid regression
- WHEN `predict()` returns
- THEN the dict contains all keys listed above with correct types

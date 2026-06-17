# Tasks: Sprint 7 — Predictive Trend Alerts

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~750 (540 new + 210 modified) |
| 400-line budget risk | **High** |
| Chained PRs recommended | **Yes** |
| Suggested split | PR 1 (Edge Core) → PR 2 (Data Collection + Integration) → PR 3 (Backend + Frontend) |
| Delivery strategy | ask-on-risk |
| Chain strategy | stacked-to-main |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Edge core: config + AlertLevel + TrendPredictor + tests | PR 1 | Base = main; foundational types + prediction engine |
| 2 | Data collection + MQTT + main.py hooks + tests | PR 2 | Base = main; depends on config from PR 1 |
| 3 | Backend + Frontend | PR 3 | Base = main; depends on prediction schema from PR 1 |

### Task Dependencies

```
1.1 (Config) ─→ 2.2 (TrendPredictor) ─→ 3.1 (AlertEngine prediction) ─→ 4.1 (Publisher) ─→ 5.1 (main.py)
                                      │
                                      ├→ 6.1 (db_bridge) ─→ 6.2 (routes)
                                      │
                                      └→ 7.1 (api.js) ─→ 7.2 (PanelAlertas)

1.1 (Config) ─→ 3.2 (DataCollector) ─→ 5.1 (main.py)
```

Tests are paired with each implementation task (TDD RED→GREEN within same unit).

## Phase 1: Foundation — Config & Types

- [x] **1.1** Add `# Prediction` config block to `EdgeConfig` in `edge/edge/config.py` (3 new fields: `prediction_enabled`, `prediction_horizon_days`, `prediction_min_data_points`). Complexity: **small**
- [x] **1.2** Add `PREDICTED_WARNING=3`, `PREDICTED_CRITICAL=4` to `AlertLevel` enum in `edge/edge/temporal/alert_engine.py`; add `predicted_warning_enabled`/`predicted_critical_enabled` params to `__init__()`. Complexity: **small**
- [x] **1.3** Export `TrendPredictor` and `TrendPredictionResult` from `edge/edge/temporal/__init__.py`. Complexity: **small**

## Phase 2: TrendPredictor (TDD)

- [x] **2.1** Write tests in `edge/edge/tests/test_trend_predictor.py`: happy path (8 pts → slope>0, R²>0.8), insufficient data (3 pts → None), flat/negative slope, TTT within/capped horizon, excellent/noisy R², complete output schema. Complexity: **medium** (19 tests)
- [x] **2.2** Create `edge/edge/temporal/trend_predictor.py` with `TrendPredictionResult` dataclass + `TrendPredictor` class using numpy polyfit, R² computation, TTT formula, direction classification, confidence. All 2.1 tests pass. Complexity: **medium**

## Phase 3: AlertEngine Prediction (TDD)

- [x] **3.1** Write tests for AlertEngine prediction in `test_alert_engine.py`: enum ordering, prediction triggers PREDICTED_CRITICAL/WARNING, low-confidence stays IDLE, velocity takes precedence, suppression flags, payload fields, TTT=None guard. Complexity: **medium** (13 new tests)
- [x] **3.2** Implement `prediction` param (TrendPredictionResult type) in `AlertEngine.update()`; evaluate prediction when velocity < MODERADA; add `event=alerta_prediccion`, `category`, `ttt_days`, `trend_direction`, `r_squared`, `confidence` to `_build_payload()`. All 3.1 tests pass. Complexity: **medium**

## Phase 4: DataCollection + MQTT (TDD)

- [ ] **4.1** Write tests in `edge/edge/tests/test_data_collector.py`: frame saved on schedule, disabled saves nothing, date directory auto-created, retention purge (old dir deleted), dry-run (log only, no delete), storage MB tracking, storage threshold warning. Complexity: **medium**
- [ ] **4.2** Create `edge/edge/temporal/data_collector.py` with `RawFrameCollector` class: periodic JPEG capture, date-partitioned dirs, retention purge, storage tracking, dry-run mode. All 4.1 tests pass. Complexity: **medium**
- [ ] **4.3** Write test for `publish_prediction_alert()`: correct topic (`{prefix}/prediccion`), payload shape, return True/False. Complexity: **small**
- [ ] **4.4** Add `publish_prediction_alert(payload)` method to `edge/edge/mqtt/publisher.py` following same pattern as `publish_velocity_alert`. Test passes. Complexity: **small**

## Phase 5: Edge Integration

- [ ] **5.1** Wire everything in `edge/edge/main.py`: init `TrendPredictor` (after history_store), data_collector (after frame read), prediction call per track after velocity calc, prediction→alert_engine.update(), data_collector.maybe_capture() after frame read. All gated by config flags. Complexity: **medium**

## Phase 6: Backend API

- [ ] **6.1** Write test for `get_predicciones()` in `db_bridge` (or verify existing test infra): returns list with track_id/direction/ttt_days/r_squared/confidence/timestamp. Complexity: **small**
- [ ] **6.2** Add `get_predicciones()` to `edge/backend/db_bridge.py` that computes predictions from snapshots; add `"prediccion"` field to `get_fisura()` response. Complexity: **small**
- [ ] **6.3** Add `GET /api/predicciones` returning prediction list to `backend/routes.py`. Test endpoint returns correct schema. Complexity: **small**

## Phase 7: Frontend

- [ ] **7.1** Add `obtenerPredicciones()` function to `frontend/lib/api.js`. Complexity: **small**
- [ ] **7.2** Extend `frontend/components/PanelAlertas.tsx`: add `predicted_warning`/`predicted_critical` to `FiltroTipo`, trend arrow indicators (↑→↓), TTT countdown text, predictive alerts stats card, new badge colors for predictive categories. Complexity: **medium**

## Batch Recommendations

| Batch | Tasks | Rationale |
|-------|-------|-----------|
| **Batch A** (PR 1) | 1.1, 1.2, 1.3, 2.1, 2.2, 3.1, 3.2 | All core edge prediction. Config + types + predictor + alert engine. Standalone, testable. |
| **Batch B** (PR 2) | 4.1, 4.2, 4.3, 4.4, 5.1 | Data collection + MQTT + main.py wiring. Depends on config & types from PR 1. |
| **Batch C** (PR 3) | 6.1, 6.2, 6.3, 7.1, 7.2 | Backend API + frontend. Depends on prediction schema from PR 1. |

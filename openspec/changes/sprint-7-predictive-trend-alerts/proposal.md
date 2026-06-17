# Proposal: Sprint 7 — Predictive Trend Alerts

## Intent

Alert system reacts to current velocity (Sprint 5) but cannot forecast. Operators need early warning — trend direction and time-to-threshold — before cracks reach dangerous speeds. `crack_history.json` provides the time series.

## Scope

### In Scope
1. **TrendPredictor** — linear regression over last N measurements, TTT forecast, trend direction
2. **New alert categories** — PREDICTED_WARNING, PREDICTED_CRITICAL in AlertEngine FSM
3. **Prediction config** — PREDICTION_ENABLED, PREDICTION_HORIZON_DAYS, PREDICTION_MIN_DATA_POINTS
4. **Integration** — MQTT predictive alerts, FastAPI endpoints, frontend (trend arrows, TTT)
5. **Data collection** — periodic raw frame saving under `data/training/raw/`

### Out of Scope
- ML model training (needs dataset)
- ONNX inference switch, CVAT/LabelStudio, GPU training

## Capabilities

### New Capabilities
- `trend-prediction`: Linear regression + TTT forecasting per crack
- `predictive-alerting`: PREDICTED_WARNING / PREDICTED_CRITICAL in FSM
- `data-collection-raw`: Periodic raw frame capture for future ML dataset

### Modified Capabilities
- `velocity-alerting`: Extended with prediction-driven alert categories

## Approach

1. **TrendPredictor** (`edge/edge/temporal/trend_predictor.py`): numpy polyfit over (days_elapsed, width). Slope → trend direction (acelerando/estable/desacelerando). Solve for threshold crossing → TTT in days.
2. **AlertLevel** gains PREDICTED_WARNING=3, PREDICTED_CRITICAL=4. `update()` accepts optional prediction. Same IDLE→ALERTING→RESOLVED FSM.
3. **Config**: Prediction block in `config.py`.
4. **Edge loop**: After velocity calc, run TrendPredictor, feed into alert_engine.update().
5. **MQTT**: `publish_prediction_alert()` method.
6. **FastAPI**: `/api/predicciones`; predictions in `/api/fisuras/{id}`.
7. **Frontend**: `trendDirection` + `ttt_days` in alerts, new filter types, new `obtenerPredicciones()`.
8. **Data collection**: Every N frames, save JPEG to `data/training/raw/{date}/`.

## Affected Areas

| Area | Impact |
|------|--------|
| `edge/edge/temporal/trend_predictor.py` | New |
| `edge/edge/temporal/alert_engine.py` | Modified |
| `edge/edge/temporal/__init__.py` | Modified |
| `edge/edge/config.py` | Modified |
| `edge/edge/main.py` | Modified |
| `backend/routes.py` | Modified |
| `backend/db_bridge.py` | Modified |
| `frontend/components/PanelAlertas.tsx` | Modified |
| `frontend/lib/api.js` | Modified |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Regression on sparse data → garbage | Med | PREDICTION_MIN_DATA_POINTS guard (default 5) |
| TTT infinite when slope flat/negative | Low | Cap at horizon; show "no proyectable" |
| Raw frame storage growth | Low | 7-day max retention config |
| False confidence in noisy predictions | Med | Surface R² alongside prediction |

## Rollback Plan

Remove `trend_predictor.py`. Revert AlertLevel enum. Remove prediction config. Delete `data/training/raw/`. Revert `routes.py`, `db_bridge.py`, frontend changes.

## Dependencies

- Sprint 5 (AlertEngine FSM) + Sprint 6 (FastAPI + frontend)

## Success Criteria

- [ ] TrendPredictor returns correct direction + TTT on synthetic non-decreasing width series
- [ ] PREDICTED_WARNING / PREDICTED_CRITICAL alerts fire through FSM
- [ ] `/api/predicciones` returns per-track predictions
- [ ] Frontend renders trend arrow + TTT countdown in alert cards
- [ ] Raw frames saved to `data/training/raw/` when DATA_COLLECTION_ENABLED=true

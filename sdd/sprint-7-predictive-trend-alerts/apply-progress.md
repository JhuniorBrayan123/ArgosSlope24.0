# Apply Progress — Sprint 7 (Predictive Trend Alerts)

## PR 3 — Backend + Frontend — COMPLETED ✅

### Commits
1. `a8a2732` — **Backend**: db_bridge.py + routes.py + main.py (predictions endpoint + linear regression)
2. `64334bc` — **Frontend**: api.js + PanelAlertas.tsx (prediction cards + trend display)

### Changes

#### Backend (`backend/db_bridge.py`)
- Added `_linear_regression()` — pure Python linear regression (no numpy dependency)
- Added `_classify_trend_direction()` — classifies slope as acelerando/estable/desacelerando
- Added `_compute_ttt()` — Time-To-Threshold calculation
- Added `get_predicciones()` — computes predictions for all cracks with ≥3 data points
- Added `get_prediccion(track_id)` — single crack prediction
- Updated `get_resumen()` — now includes `count_predicciones_activas`

#### Backend (`backend/routes.py`)
- `GET /api/predicciones` — list all predictions
- `GET /api/predicciones/{crack_id}` — single prediction (404 if insufficient data)

#### Frontend (`frontend/lib/api.js`)
- `fetchPredicciones()` — GET `/api/predicciones` with error handling
- `fetchPrediccion(crackId)` — single prediction fetch

#### Frontend (`frontend/components/PanelAlertas.tsx`)
- Added prediction section below stats cards (conditionally shown when predictions exist)
- Grid of prediction cards: ROI ID, trend arrow (↗ acelerando / ↑ estable / ↘ desacelerando), TTT badge, slope, confidence
- Color coding: red border for acelerando, amber for desacelerando, green for estable
- TTT badge: red (≤3 days), amber (≤7 days), green (>7 days)

### Test Results
- All 149 existing edge tests PASS
- All 7 backend integration test groups PASS
- Empty data returns `[]` for predictions
- Non-existent crack returns 404
- Crack with insufficient data (<3 points) returns 404

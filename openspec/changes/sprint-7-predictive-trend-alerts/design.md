# Design: Sprint 7 — Predictive Trend Alerts

## Technical Approach

Add a `TrendPredictor` that runs linear regression (numpy `polyfit`) over historical crack widths from `JsonCrackHistoryStore.load_by_track()`, computing slope, intercept, R², trend direction (`acelerando`/`estable`/`desacelerando`), and Time-To-Threshold (TTT). Two new `AlertLevel` values (`PREDICTED_WARNING`, `PREDICTED_CRITICAL`) extend the existing IDLE→ALERTING→RESOLVED FSM. A `RawFrameCollector` periodically saves unannotated frames for future ML training. Integration hooks go into `main.py` after velocity calculation, into MQTT publisher, FastAPI routes, and frontend panels.

---

## Architecture Decisions

### Decision: TrendPredictor as stateless function object (not a class with internal state)

| Option | Tradeoff | Decision |
|--------|----------|----------|
| Stateful predictor with internal history buffer | Duplicates data already in JsonCrackHistoryStore | ❌ |
| **Stateless predictor reading from store** | Single source of truth; no sync issues | ✅ |

**Rationale**: `TrendPredictor` receives a `CrackHistoryStore` at init and calls `load_by_track()` on each `predict()` call. No internal measurement buffer — avoids duplication with `VelocityCalculator`'s `TrackHistory`. Keeps prediction stateless and trivially testable.

### Decision: numpy polyfit over scikit-learn LinearRegression

| Option | Tradeoff | Decision |
|--------|----------|----------|
| scikit-learn LinearRegression | Heavy dependency for edge device; slower import | ❌ |
| **numpy polyfit (degree=1)** | Already a project dependency via cv2 → numpy; fast; sufficient | ✅ |

**Rationale**: numpy is already a transitive dependency (via cv2). Polyfit with deg=1 gives slope, intercept, and we compute R² manually. No new dependency.

### Decision: Prediction passed as parameter to AlertEngine.update(), not stored in engine

| Option | Tradeoff | Decision |
|--------|----------|----------|
| AlertEngine stores predictions internally | Couples engine to prediction logic; needs update on every frame | ❌ |
| **Prediction passed as argument to update()** | Decoupled; engine stays generic | ✅ |

**Rationale**: Matches existing pattern where velocity is passed per-call. The engine does not need to persist predictions — it evaluates one signal per `update()`. Keeps FSM logic clean.

### Decision: RawFrameCollector as standalone module, not part of TrendPredictor

| Option | Tradeoff | Decision |
|--------|----------|----------|
| Inline frame capture in main.py | Clutters main loop with file I/O logic | ❌ |
| **Separate RawFrameCollector class** | Focused responsibility; easy to test and disable | ✅ |

**Rationale**: Data collection is orthogonal to prediction. A dedicated class manages directory creation, frame counting, retention purging, and storage tracking. main.py calls `collector.maybe_capture(frame, frame_count)`.

---

## Data Flow

```
┌─────────────────────────────────────────────────────────┐
│                   main.py loop                           │
│                                                          │
│  frame ─→ detector ─→ cracks list                        │
│                                                          │
│  [every temporal_interval_frames]                        │
│    │                                                     │
│    ├── registration + tracking ─→ tracked_cracks         │
│    │                                                     │
│    ├── velocity_calc.add_measurement() ─→ velocity       │
│    │                                                     │
│    ├── history_store.save_snapshot() ─→ crack_history    │
│    │                                                     │
│    ├── [NEW] trend_predictor.predict(track_id)           │
│    │       └── history_store.load_by_track(track_id)     │
│    │       └── numpy polyfit → prediction dict           │
│    │                                                     │
│    ├── alert_engine.update(velocity, prediction)         │
│    │       └── velocity ≥ MODERADA → velocity alert      │
│    │       └── velocity < MODERADA + prediction          │
│    │           → predictive alert or stay IDLE           │
│    │                                                     │
│    ├── publisher.publish_velocity_alert(payload)         │
│    │   [or] publisher.publish_prediction_alert(payload)  │
│    │                                                     │
│    └── [NEW every N frames]                              │
│        data_collector.maybe_capture(frame, frame_count)  │
│            └── data/training/raw/{YYYY-MM-DD}/           │
│                                                          │
└─────────────────────────────────────────────────────────┘

Backend (FastAPI)                        Frontend (Next.js)
┌─────────────────────┐               ┌────────────────────┐
│ GET /api/predicciones│ ←─── fetch ──│ obtenerPredicciones│
│   → prediction[]     │               │   → PanelAlertas   │
│                      │               │                    │
│ GET /api/fisuras/{id}│ ←─── fetch ──│ ModalDetalleFisura │
│   → {..., prediccion}│               │   → trend arrow    │
└─────────────────────┘               └────────────────────┘
```

---

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `edge/edge/temporal/trend_predictor.py` | **Create** | TrendPredictor class: polyfit, R², TTT, direction classification |
| `edge/edge/temporal/data_collector.py` | **Create** | RawFrameCollector: periodic JPEG capture, retention purge, storage tracking |
| `edge/edge/temporal/alert_engine.py` | **Modify** | New AlertLevel values (PREDICTED_WARNING=3, PREDICTED_CRITICAL=4); prediction param on update(); prediction suppression flags; predictive payload in _build_payload() |
| `edge/edge/temporal/__init__.py` | **Modify** | Export TrendPredictor, RawFrameCollector |
| `edge/edge/config.py` | **Modify** | Add Prediction config block and Data Collection config block |
| `edge/edge/main.py` | **Modify** | Init TrendPredictor; prediction loop after velocity; data collection hook |
| `edge/edge/mqtt/publisher.py` | **Modify** | Add publish_prediction_alert(payload) method to `{prefix}/prediccion` |
| `backend/routes.py` | **Modify** | Add GET /api/predicciones endpoint |
| `backend/db_bridge.py` | **Modify** | Add get_predicciones(); add "prediccion" field in get_fisura() |
| `frontend/lib/api.js` | **Modify** | Add obtenerPredicciones() function |
| `frontend/components/PanelAlertas.tsx` | **Modify** | Add trend arrows, TTT display, new filter types, predictive stats card |
| `edge/edge/tests/test_trend_predictor.py` | **Create** | Unit tests for TrendPredictor |
| `edge/edge/tests/test_data_collector.py` | **Create** | Unit tests for RawFrameCollector |

---

## Interfaces / Contracts

### TrendPredictor

```python
@dataclass
class PredictionResult:
    track_id: int
    slope: float              # mm/day
    intercept: float           # mm
    r_squared: float           # 0.0–1.0
    direction: str             # "acelerando" | "estable" | "desacelerando"
    ttt_days: float | None     # days until threshold (capped)
    ttt_capped: bool           # True if capped at horizon
    confidence: str            # "high" | "medium" | "low"
    data_points: int           # number of measurements used

class TrendPredictor:
    def __init__(
        self,
        store: CrackHistoryStore,
        min_data_points: int = 5,
        horizon_days: float = 30.0,
        threshold_width: float | None = None,  # None → auto from alert_velocity_rapida * horizon
        slope_threshold: float = 0.001,
    ) -> None: ...

    def predict(self, track_id: int) -> PredictionResult | None: ...
    def predict_all(self) -> dict[int, PredictionResult]: ...
```

### AlertEngine Changes

```python
class AlertLevel(IntEnum):
    NONE = 0
    MODERADA = 1
    RAPIDA = 2
    PREDICTED_WARNING = 3    # NEW
    PREDICTED_CRITICAL = 4   # NEW

class AlertEngine:
    def __init__(
        self,
        ...,
        predicted_warning_enabled: bool = True,   # NEW
        predicted_critical_enabled: bool = True,  # NEW
    ) -> None: ...

    def update(
        self,
        track_id: int,
        velocity_mm_day: float,
        roi_id: str = "",
        width_mm: float = 0.0,
        smoothed_velocity: Optional[float] = None,
        prediction: Optional[dict] = None,         # NEW
    ) -> Optional[dict]: ...
```

### RawFrameCollector

```python
class RawFrameCollector:
    def __init__(
        self,
        enabled: bool = False,
        interval_frames: int = 300,
        jpeg_quality: int = 80,
        max_days: int = 7,
        max_mb: int = 5000,
        dry_run: bool = False,
        base_dir: str = "data/training/raw",
    ) -> None: ...

    def maybe_capture(self, frame: np.ndarray, frame_count: int) -> None: ...
    def purge_old(self) -> None: ...
    def storage_mb(self) -> float: ...
```

### MQTT Publisher

```python
class MqttPublisher:
    def publish_prediction_alert(self, payload: dict) -> bool:
        """Publish to {topic_prefix}/prediccion"""
```

### FastAPI Endpoints

```
GET /api/predicciones → list[{
    track_id: int,
    direction: str,
    ttt_days: float | None,
    r_squared: float,
    confidence: str,
    timestamp: str,
}]

GET /api/fisuras/{track_id} → {..., prediccion: {...} | None}
```

---

## Config (New Blocks in `config.py`)

```python
@dataclass
class EdgeConfig:
    # ... existing fields ...

    # ── Prediction (Sprint 7) ──────────────────────────────
    prediction_enabled: bool = os.getenv("PREDICTION_ENABLED", "true").lower() == "true"
    prediction_min_data_points: int = int(os.getenv("PREDICTION_MIN_DATA_POINTS", "5"))
    prediction_horizon_days: int = int(os.getenv("PREDICTION_HORIZON_DAYS", "30"))
    # threshold_width: None = auto (alert_velocity_rapida * horizon_days)

    # ── Data Collection (Sprint 7) ──────────────────────────
    data_collection_enabled: bool = os.getenv("DATA_COLLECTION_ENABLED", "false").lower() == "true"
    data_collection_interval_frames: int = int(os.getenv("DATA_COLLECTION_INTERVAL_FRAMES", "300"))
    data_collection_jpeg_quality: int = int(os.getenv("DATA_COLLECTION_JPEG_QUALITY", "80"))
    data_collection_max_days: int = int(os.getenv("DATA_COLLECTION_MAX_DAYS", "7"))
    data_collection_max_mb: int = int(os.getenv("DATA_COLLECTION_MAX_MB", "5000"))
    data_collection_dry_run: bool = os.getenv("DATA_COLLECTION_DRY_RUN", "false").lower() == "true"
```

---

## Integration Points

### 1. main.py — After velocity calculation block (≈line 536)

```python
# After velocity calc and snapshot save for each track:

# ── Prediction ────────────────────────────────────────────
if prediction_enabled and trend_predictor is not None:
    prediction = trend_predictor.predict(track_id=tc.track_id)
else:
    prediction = None

# ── Alert engine (with optional prediction) ──────────────
if alert_engine is not None:
    alert_payload = alert_engine.update(
        track_id=tc.track_id,
        velocity_mm_day=v or 0.0,
        roi_id=tc.roi_id,
        width_mm=tc.width_mm,
        smoothed_velocity=velocity_calc.get_smoothed_velocity(tc.track_id),
        prediction=prediction,
    )
```

### 2. main.py — Data collection (after frame read, ≈line 438)

```python
# ── Raw frame data collection ────────────────────────────
if data_collector is not None:
    data_collector.maybe_capture(frame, frame_count)
```

### 3. AlertEngine._build_payload() — predictive category

When level is PREDICTED_WARNING or PREDICTED_CRITICAL, payload includes:
- `event: "alerta_prediccion"`
- `category: "predicted_warning"` or `"predicted_critical"`
- `ttt_days`, `trend_direction`, `r_squared`, `confidence`

### 4. Publisher — prediction topic

```python
def publish_prediction_alert(self, payload: dict) -> bool:
    topic = f"{self._topic_prefix}/prediccion"
    # ... same pattern as publish_velocity_alert ...
```

---

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| **Unit** | TrendPredictor.predict() with synthetic data | Direct polyfit results: slope, R², direction, TTT. Happy path (8 points), insufficient data (3 points), negative slope, flat slope, perfect fit, noisy data. |
| **Unit** | AlertLevel enum order | Assert PREDICTED_CRITICAL > PREDICTED_WARNING > RAPIDA > MODERADA > NONE |
| **Unit** | AlertEngine.update() with prediction | IDLE + prediction (TTT=5d) → PREDICTED_CRITICAL; IDLE + low confidence → stays IDLE; RAPIDA velocity + prediction → velocity takes precedence |
| **Unit** | AlertEngine suppression flags | predicted_critical_enabled=False → no alert even if TTT triggers |
| **Unit** | RawFrameCollector | File written on interval; disabled saves nothing; retention purge; storage tracking; dry-run mode |
| **Unit** | MQTT publish_prediction_alert | Correct topic, payload shape, return True/False |
| **Integration** | main.py prediction → alert → publish chain | Mock store/publisher, verify end-to-end with synthetic frame loop |
| **Integration** | FastAPI /api/predicciones | Fake crack_history.json, verify response schema |
| **Unit** | db_bridge.get_predicciones() | Verify prediction dict computed from snapshots |
| **Frontend** | PanelAlertas filters + display | Trend arrow renders; TTT text shows; new filter dropdown values |

### Test file additions:
- `edge/edge/tests/test_trend_predictor.py` — unittest.TestCase style matching `test_alert_engine.py`
- `edge/edge/tests/test_data_collector.py` — unittest.TestCase with temp directories

---

## Migration / Rollout

No data migration required. `PredictionResult` is computed on-the-fly from existing `crack_history.json`. Feature flags:
- `PREDICTION_ENABLED` (default `true`) — gates the entire prediction pipeline
- `DATA_COLLECTION_ENABLED` (default `false`) — opt-in for raw frame capture
- `predicted_warning_enabled` / `predicted_critical_enabled` in AlertEngine — null-risk if not configured (default `true`)

### Rollback
1. Delete `trend_predictor.py` and `data_collector.py`
2. Revert `AlertLevel` enum to 3 values
3. Remove `prediction` param from `AlertEngine.update()`
4. Revert prediction/data collection config
5. Remove `publish_prediction_alert()` from publisher
6. Remove `/api/predicciones` endpoint
7. Revert frontend changes
8. Delete `data/training/raw/` directory

---

## Open Questions

- None. All design decisions are resolved based on existing codebase patterns and spec requirements.

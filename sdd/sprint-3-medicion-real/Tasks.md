# Tasks: Sprint 3 — Medición Real con Calibración

**Change Name:** `sprint-3-medicion-real`
**Artifact Store:** `hybrid` (openspec_path: `data/documentacion-sdd`)
**Delivery Strategy:** `auto-chain` — si >400 líneas, dividir automáticamente; `chain_strategy`: `feature-branch-chain`

---

## Review Workload Forecast

| Metric | Estimate |
|--------|----------|
| Total lines changed | ~250–300 |
| Files modified | 3 (fisura_detector.py, config.py, +3 test files) |
| New files | 3 test files |
| PR count | Likely single PR |
| Review complexity | Low–Medium (focal changes, no new modules) |

---

## Phase 1: Core Measurement Implementation

### Task 1.1 — Modify `OpenCvDetector.__init__()` to load calibration data

**File:** `edge/edge/detector/fisura_detector.py`

**Changes:**
- Remove theoretical `pixel_to_mm` computation from `__init__` (lines 185–193)
- Load `fx` from `calibration.json` → store as `_fx_px`
- Load `pixels_per_mm` from `calibration.json` → store as `_pixels_per_mm`
- Set `_scale_available` based on whether both values are valid
- Keep `_load_calibration_scale()` but extend it to also load `fx_px` (camera_matrix[0][0])

**Acceptance Criteria:**
- `_fx_px` populated from `camera_matrix[0][0]` when calibration valid
- `_pixels_per_mm` populated from `pixels_per_mm` when valid
- `_scale_available` = `True` only when both are present and > 0
- Logger emits info level message with loaded values

---

### Task 1.2 — Modify `OpenCvDetector._measure_contour()` to use calibrated ratio

**File:** `edge/edge/detector/fisura_detector.py`

**Changes:**
- In `_measure_contour()` (lines 271–323), replace fixed `ratio = self._pixel_to_mm` with dynamic selection:
  ```python
  if self._scale_available and self._pixels_per_mm:
      ratio = 1.0 / self._pixels_per_mm  # calibrated px→mm
  else:
      ratio = self._pixel_to_mm          # theoretical (legacy fallback)
      logger.warning("Using theoretical pixel-to-mm ratio (calibration unavailable)")
  ```
- Update length_mm, area_mm2, width_mm calculations to use selected `ratio`
- Ensure `_pixel_to_mm` remains as fallback (computed from deprecated config params)

**Acceptance Criteria:**
- When calibration available: measurements use `1/ppm` from ArUco
- When calibration missing: measurements use theoretical + WARNING logged
- No change to `CrackResult` dataclass structure

---

### Task 1.3 — Modify `OnnxDetector.__init__()` to load calibration (same pattern)

**File:** `edge/edge/detector/fisura_detector.py`

**Changes:**
- In `OnnxDetector.__init__()` (lines 458–473), remove theoretical `pixel_to_mm` computation
- Add calibration loading identical to `OpenCvDetector`:
  - Load `fx_px` from `camera_matrix[0][0]`
  - Load `pixels_per_mm` from calibration
  - Set `_scale_available` flag
- Can reuse `_load_calibration_scale()` method or create shared utility

**Acceptance Criteria:**
- `OnnxDetector` has `_fx_px`, `_pixels_per_mm`, `_scale_available` attributes
- Calibration loading logic matches `OpenCvDetector`

---

### Task 1.4 — Modify `OnnxDetector.process()` to use calibrated ratio

**File:** `edge/edge/detector/fisura_detector.py`

**Changes:**
- In `OnnxDetector.process()` (lines 498–565), replace `ratio = self._pixel_to_mm` (line 535) with same dynamic selection as Task 1.2
- Apply calibrated ratio to length_mm, area_mm2, width_mm calculations
- Log WARNING when falling back to theoretical ratio

**Acceptance Criteria:**
- ONNX detections use calibrated scale when available
- Fallback to theoretical + WARNING when calibration missing
- Consistent behavior with `OpenCvDetector`

---

## Phase 2: Config Deprecation

### Task 2.1 — Add DEPRECATED comments to measurement config parameters

**File:** `edge/edge/config.py`

**Changes:**
- Lines 64, 66–68, 70: Add `# DEPRECATED` comment above each parameter:
  - `focal_length_mm` — explain: "DEPRECATED: used only as fallback when calibration unavailable. Use calibration procedure instead."
  - `sensor_distance_m` — same explanation
  - `sensor_pixel_um` — same explanation
- Keep default values and env-var overrides for backward compatibility
- Do NOT remove parameters — external deployments may still set them

**Acceptance Criteria:**
- Three parameters marked with clear DEPRECATED comments
- Comments explain fallback-only usage
- No functional change — defaults preserved

---

## Phase 3: Tests & Validation

### Task 3.1 — Create `test_calibrated_measurement.py`

**File:** `edge/edge/tests/test_calibrated_measurement.py` (new)

**Test Cases:**
1. **Mock calibration with ppmm=10**: Create `OpenCvDetector` with `_pixels_per_mm=10.0`, `_scale_available=True`
2. **Verify width_mm**: Known contour area_px=1000, length_px=50 → expected width_mm = (1000/100) / (50/10) = 2.0 mm
3. **Verify length_mm**: Known contour perimeter_px=100 → expected length_mm = (100/2) / 10 = 5.0 mm
4. **Verify area_mm2**: Known contour area_px=1000 → expected area_mm2 = 1000 / 100 = 10.0 mm²
5. **Test with synthetic contour**: Use `_make_rect_contour` helper, verify all three metrics

**Acceptance Criteria:**
- All assertions pass with < 1% floating-point tolerance
- Test runs without camera/hardware
- Clear test names describing what is validated

---

### Task 3.2 — Create `test_fallback_measurement.py`

**File:** `edge/edge/tests/test_fallback_measurement.py` (new)

**Test Cases:**
1. **Detector without calibration**: `OpenCvDetector()` with `_scale_available=False`
2. **Verify fallback ratio used**: Check `_pixel_to_mm` matches theoretical calculation from config defaults
3. **Verify WARNING logged**: Capture log output, assert "Using theoretical pixel-to-mm ratio" appears
4. **Verify measurements computed**: Ensure length_mm, width_mm, area_mm2 are non-zero using fallback

**Acceptance Criteria:**
- WARNING log emitted exactly once per measurement call (or per frame)
- Measurements use theoretical formula from config params
- Test passes without calibration.json present

---

### Task 3.3 — Create `test_onnx_calibrated.py`

**File:** `edge/edge/tests/test_onnx_calibrated.py` (new)

**Test Cases:**
1. **Mock ONNX detector with calibration**: Create `OnnxDetector` with `_pixels_per_mm=10.0`, `_scale_available=True` (mock ONNX session)
2. **Verify calibrated ratio used**: Process synthetic frame, check detections use 1/ppm ratio
3. **Test fallback path**: Set `_scale_available=False`, verify WARNING logged, theoretical ratio used
4. **Consistency check**: Same contour measured by both detectors → same mm results (within tolerance)

**Acceptance Criteria:**
- ONNX path uses same calibration logic as OpenCV
- Fallback + WARNING works identically
- Cross-detector consistency verified

---

### Task 3.4 — Regression: Run all existing detector tests

**Command:** `python -m pytest edge/edge/tests/ -v`

**Tests to pass:**
- `test_scale_filtering.py` — both `TestScaleFilterFallbackPx` and `TestScaleFilterWithMockCalibration`
- `test_geometric_filters.py` — all filter test classes
- `test_preprocessing.py` — preprocessing pipeline tests
- `test_debug_drawer.py` — debug visualization tests

**Acceptance Criteria:**
- Zero test failures
- Zero new warnings (except expected fallback WARNING in new tests)
- All existing behavior preserved

---

## Definition of Done

- [ ] All 4 Phase 1 tasks implemented and verified
- [ ] Phase 2 config deprecation complete
- [ ] All 4 Phase 3 test files created and passing
- [ ] Full test suite (`edge/edge/tests/`) passes with zero regressions
- [ ] No lint/type errors (`ruff check`, `mypy` if configured)
- [ ] Code review ready — changes focused, well-commented, minimal diff

---

## Notes for Implementer

1. **Calibration loading**: The existing `_load_calibration_scale()` already loads `pixels_per_mm`. Extend it to also extract `fx_px` from `camera_matrix[0][0]`. Handle `camera_matrix: null` gracefully.

2. **Log level**: Use `logger.warning()` for fallback (visible in production), `logger.info()` for successful calibration load.

3. **Shared utility**: Consider extracting calibration loading to a private module function `_load_calibration()` used by both detectors to avoid duplication.

4. **Test helpers**: Reuse `_make_rect_contour` from `test_scale_filtering.py` — import it or duplicate the helper.

5. **ONNX mocking**: For `test_onnx_calibrated.py`, mock `onnxruntime.InferenceSession` to return synthetic detections without needing a real model file.

6. **Floating-point comparisons**: Use `math.isclose()` or `pytest.approx()` with `rel=1e-2` for mm measurements.
# Design: Sprint 3 — Medición Real con Calibración

## Technical Approach

Replace the theoretical pixel-to-mm conversion (based on camera optics: focal length, sensor distance, pixel pitch) with a calibrated scale (`pixels_per_mm`) loaded from `calibration.json`. The detector will use the calibrated ratio when available, falling back to the theoretical calculation with a WARNING log when calibration is missing. This enables real-world measurements without requiring precise camera parameters.

The change affects two detectors: `OpenCvDetector` (primary) and `OnnxDetector` (fallback). Both currently compute `self._pixel_to_mm` from `focal_length_mm`, `sensor_distance_m`, `sensor_pixel_um`. We remove this computation from `__init__` and instead use the calibration scale in `_measure_contour()`.

Config parameters `focal_length_mm`, `sensor_distance_m`, `sensor_pixel_um` are marked DEPRECATED but retained for backward compatibility.

## Architecture Decisions

### Decision: Calibration-First Measurement

| Choice | Use `pixels_per_mm` from calibration.json as primary ratio; fallback to theoretical with WARNING |
|--------|-------------------------------------------------------------------------------------------------|
| Alternatives | Remove theoretical entirely; require calibration always | Keep theoretical as primary; calibration as optional refinement |
| Rationale | Calibration provides actual ground-truth scale. Theoretical depends on 3 imperfectly-known parameters. Fallback ensures system works uncalibrated while alerting operators. |

### Decision: DEPRECATED Config Parameters Retained

| Choice | Keep `focal_length_mm`, `sensor_distance_m`, `sensor_pixel_um` in config.py with DEPRECATED comments |
|--------|-----------------------------------------------------------------------------------------------------|
| Alternatives | Remove them entirely | Move to separate "legacy" config section |
| Rationale | External systems (env vars, deployment scripts) may still set these. Removal would break existing deployments. Comments guide new users to calibration. |

### Decision: Update Both OpenCvDetector and OnnxDetector

| Choice | Apply same calibration logic to both detectors |
|--------|------------------------------------------------|
| Alternatives | Only update OpenCvDetector (primary) | Keep OnnxDetector using theoretical |
| Rationale | Consistency — both produce mm measurements consumed by same downstream pipeline. OnnxDetector falls back to OpenCvDetector, so mismatch would cause inconsistent output. |

## Data Flow

```
┌──────────────────┐     ┌──────────────────┐     ┌──────────────────┐
│ calibration.json │────▶│ OpenCvDetector   │────▶│ _measure_contour │
│ (pixels_per_mm)  │     │ .__init__()      │     │ (ratio selection)│
└──────────────────┘     └──────────────────┘     └────────┬─────────┘
                                                            │
                              ┌─────────────────────────────┘
                              ▼
                    ┌──────────────────┐
                    │ _pixel_to_mm =   │
                    │   1/ppm (calib)  │
                    │   OR             │
                    │   theoretical+WARN│
                    └────────┬─────────┘
                             │
                             ▼
                    ┌──────────────────┐
                    │ length_mm,       │
                    │ width_mm,        │
                    │ area_mm2         │
                    └──────────────────┘
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `edge/edge/detector/fisura_detector.py` | Modify | `OpenCvDetector.__init__`: remove theoretical pixel_to_mm calc; `OpenCvDetector._measure_contour`: select ratio from calibration or fallback+WARN. `OnnxDetector.__init__`: same changes. |
| `edge/edge/config.py` | Modify | Add DEPRECATED comments to `focal_length_mm`, `sensor_distance_m`, `sensor_pixel_um`. Keep defaults for backward compat. |
| `edge/edge/calibration/calibration.json` | No change | Already contains `pixels_per_mm` field (null by default). |

## Interfaces / Contracts

No public API changes. `CrackResult` dataclass unchanged. `BaseDetector.process()` signature unchanged.

Internal contract for `_measure_contour`:
```python
def _measure_contour(self, contour: np.ndarray) -> CrackResult:
    # Ratio selection:
    if self._scale_available and self._pixels_per_mm:
        ratio = 1.0 / self._pixels_per_mm  # calibrated px→mm
    else:
        ratio = self._pixel_to_mm          # theoretical (legacy)
        logger.warning("Using theoretical pixel-to-mm ratio (calibration unavailable)")
```

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit | `OpenCvDetector._measure_contour` with calibrated ratio | Mock `self._pixels_per_mm=10.0`, verify `length_mm = length_px * 0.1` |
| Unit | `OpenCvDetector._measure_contour` fallback + WARNING | Set `_scale_available=False`, verify WARNING logged, ratio = theoretical |
| Unit | `OnnxDetector._measure_contour` same logic | Same tests as OpenCvDetector |
| Integration | Full pipeline with calibration.json present | Write test calibration.json, run detector, verify mm values match expected scale |
| Integration | Full pipeline without calibration | Remove calibration.json, verify WARNING, measurements use theoretical |

## Migration / Rollout

No migration required. Existing deployments without calibration.json continue working (fallback + WARNING). Operators can run calibration procedure to populate `pixels_per_mm` and eliminate WARNING.

## Open Questions

- [ ] Should we add a config flag to suppress the fallback WARNING for intentionally-uncalibrated deployments?
- [ ] Do we need to validate `pixels_per_mm` range (e.g., reject obviously wrong values like 0.001 or 10000)?
- [ ] Should `OnnxDetector` also load calibration directly, or rely on its `OpenCvDetector` fallback instance? (Current design: both load independently for consistency)
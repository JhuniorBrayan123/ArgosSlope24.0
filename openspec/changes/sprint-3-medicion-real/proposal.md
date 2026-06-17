# Proposal: Sprint 3 — Medición Real con Calibración

## Intent

Reemplazar la medición hardcodeada en `OpenCvDetector._measure_contour()` (fórmula con `focal_length_mm=50`, `sensor_distance_m=10`, `sensor_pixel_um=3` estimados) por medición basada en calibración real: `fx` calibrado (píxeles) + `pixels_per_mm` desde ArUco. Eliminar dependencia de parámetros estimados para conversión píxeles→mm.

## Scope

### In Scope
- Modificar `OpenCvDetector.__init__` y `_measure_contour` para usar calibración real
- Deprecar/remover `focal_length_mm`, `sensor_distance_m`, `sensor_pixel_um` de config de medición
- Fallback a valores actuales si no hay calibración (con warning log)
- Tests de validación con patrones de referencia conocidos

### Out of Scope
- Cambios en `CameraCalibrator` o `ArucoScaleDetector` (ya completados Sprint 1)
- Cambios en `EdgePreprocessor` o `DebugDrawer`
- Nueva UI o APIs de calibración

## Capabilities

### New Capabilities
- `real-calibration-measurement`: Medición de fisuras en mm usando `fx` calibrado + `pixels_per_mm` ArUco

### Modified Capabilities
- `fissure-detection`: Requisito de medición cambia de fórmula estimada a calibración real

## Approach

1. En `__init__`: cargar `fx` (matrix[0][0]) y `pixels_per_mm` desde `calibration.json` ya disponible
2. En `_measure_contour`: si `self._scale_available` → usar `self._pixels_per_mm` para área/longitud/ancho; sino → fallback actual + log warning
3. Conversiones: área_mm2 = area_px / (pixels_per_mm²); length_mm = convex_hull_perimeter_px / (2 * pixels_per_mm); width_mm = area_mm2 / length_mm
4. Eliminar `_pixel_to_mm` calculado con valores hardcodeados

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `edge/edge/detector/fisura_detector.py` | Modified | `__init__`, `_measure_contour` — usar calibración real |
| `edge/edge/config.py` | Modified | Deprecar params medición hardcodeados |
| `tests/test_measurement_calibration.py` | New | Tests validación precisión con patrones conocidos |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Calibración no disponible en producción | Med | Fallback + warning explícito; validar en CI |
| `pixels_per_mm` ArUco inexacto por distancia | Med | Validar con múltiples distancias en tests |
| Regresión en mediciones existentes | Low | Tests de regresión con snapshots previos |

## Rollback Plan

Revertir cambios en `fisura_detector.py` y `config.py` a versión pre-Sprint 3. `calibration.json` intacto. Tests nuevos se desactivan.

## Dependencies

- Sprint 1 completado: `calibration.json` con `camera_matrix` y `pixels_per_mm` válidos
- `OpenCvDetector` ya carga `_pixels_per_mm` y `_scale_available`

## Success Criteria

- [ ] Medición usa `fx` calibrado + `pixels_per_mm` ArUco (no valores hardcodeados)
- [ ] Fallback funcional con warning cuando no hay calibración
- [ ] Tests pasan: error < 5% vs patrones referencia a 5m/10m/15m
- [ ] Sin regresión en detector (mismos contornos, distinta conversión)
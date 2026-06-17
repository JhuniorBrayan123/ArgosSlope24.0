# Proposal: Sprint 2 — Preprocesamiento y Detección Robusta

## Intent

El detector actual (`fisura_detector.py`) produce altos falsos positivos en textura de roca y sombras porque:
1. No hay preprocesamiento de imagen (undistort, CLAHE)
2. No hay filtros geométricos (aspect ratio, solidez, convexidad)
3. No usa la calibración existente ni escala de ArUco

Este cambio reduce drásticamente los falsos positivos y habilita mediciones físicas reales.

## Scope

### In Scope
- Módulo `edge/edge/preprocessing/` con pipeline configurable (undistort, CLAHE, orden)
- Filtros geométricos en `OpenCvDetector`: aspect ratio, solidez (area/conv hull), convexidad
- Filtro por tamaño mínimo en mm usando `pixels_per_mm` de calibración
- Pipeline en `main.py`: frame → preprocesamiento → detección robusta → MQTT
- Modo debug/supervisión con imágenes anotadas por etapa de filtro
- Tests con patrones sintéticos (`generate_test_patterns.py`)

### Out of Scope
- Modelos ML o segmentación semántica (no corren en RPi 4)
- Filtros temporales multi-frame (tracking)
- UI de dashboard para parámetros de filtros

## Capabilities

### New Capabilities
- `image-preprocessing`: Pipeline de undistort + CLAHE configurable por pasos
- `geometric-filtering`: Filtros de aspect ratio, solidez y convexidad por contorno
- `scale-aware-filtering`: Filtro de tamaño mínimo en mm usando escala de ArUco
- `debug-supervision-mode`: Guardado de imágenes con anotaciones por etapa de filtro

### Modified Capabilities
- Ninguna — no hay `openspec/specs/` existentes

## Approach

1. Crear `EdgePreprocessor` en `edge/edge/preprocessing/` con steps configurables (dict con enable/disable + params). `CameraCalibrator.undistort_image()` reutilizado.
2. Agregar `GeometricFilterConfig` a `OpenCvDetector.__init__()`: `max_aspect_ratio`, `min_solidity`, `require_convex`. Los filtros se aplican en `_measure_contour()`.
3. `process()` en detector recibe `pixels_per_mm` opcional para filtrar por mm.
4. `main.py` orquesta: calibración (lazy load) → preprocessor → detector robusto.
5. Debug: guardar `frame_preprocessed.jpg`, `frame_filter_stage_N.jpg` según config.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `edge/edge/preprocessing/` | New | Módulo con preprocessor y pipeline steps |
| `edge/edge/detector/fisura_detector.py` | Modified | Filtros geométricos + scale-aware en OpenCvDetector |
| `edge/edge/config.py` | Modified | Nuevos params: preprocessor steps, filtros geométricos, debug |
| `edge/edge/main.py` | Modified | Pipeline integra preprocessor + detector robusto |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| CLAHE aumenta latencia en RPi 4 | Med | Steps configurables — CLAHE desactivable, benchmark incluido |
| Calibración no disponible (sin ArUco) | Baja | Fallback a pixel_to_mm actual, sin filtro mm |
| Alto acoplamiento main.py | Media | EdgePreprocessor y detector inyectados; test unitarios aislados |

## Rollback Plan

Revert commits del cambio. Los parámetros nuevos en `config.py` tienen defaults compatibles (filtros desactivados, preprocessor en modo passthrough). Basta resetear `OPENCV_PREPROCESS_STEPS=""` y `OPENCV_GEOMETRIC_FILTERS=false`.

## Dependencies

- Sprint 1: `calibration.json` con `pixels_per_mm` (opcional — funciona sin él)
- OpenCV (ya presente)
- Python 3.10+ (ya presente)
- `pytest` para tests unitarios

## Success Criteria

- [ ] Falsos positivos reducidos ≥60% en imágenes de talud con textura de roca
- [ ] Preprocessor pipeline configurable: cualquier combinación de pasos funciona
- [ ] Filtro por mm funciona con ArUco presente; detector no crashea sin calibración
- [ ] Debug mode genera imágenes anotadas por etapa de filtro
- [ ] Tests existentes de calibración no se rompen; nuevos tests ≥80% cobertura en preprocessing

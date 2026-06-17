# Proposal: Sprint 4 — Comparación Temporal y Velocidad de Deformación

## Intent

El sistema detecta fisuras y mide en mm reales (Sprint 3), pero **no compara imágenes entre días**. No hay registro histórico, alineación de imágenes (image registration), tracking de fisuras, ni cálculo de velocidad de apertura (mm/día). Este sprint añade el motor de velocidad de deformación para convertir mediciones puntuales en serie temporal.

## Scope

### In Scope
- `image-registration`: Alineación automática frame actual vs referencia (ORB + RANSAC homografía)
- `crack-tracking`: Asociación temporal de fisuras por centroide + IoU tras registro
- `velocity-calculation`: Δancho_mm / Δdías por fisura trackeada
- `new-crack-detection`: Identificar fisuras nuevas no presentes en referencia
- `temporal-persistence`: Tabla histórica `crack_history` en BD

### Out of Scope
- Alertas por umbral de velocidad (Sprint 5)
- UI/Dashboard histórico (Sprint 6)
- Modelo ML predicción (Sprint 7+)

## Capabilities

### New Capabilities
- `image-registration`: Alineación de frames usando feature matching ORB + homografía RANSAC
- `crack-tracking`: Matching temporal de fisuras por posición relativa e IoU tras registro
- `deformation-velocity`: Cálculo velocidad mm/día = (ancho_hoy - ancho_ayer) / días_transcurridos
- `new-crack-detection`: Detección de fisuras nuevas vs crecimiento de existentes
- `temporal-persistence`: Guardado histórico en BD (tabla `crack_history`)

### Modified Capabilities
- `fissure-detection`: Output incluir `tracking_id` consistente entre frames para tracking temporal

## Approach

1. **Nuevo módulo `edge/edge/temporal/`** con `registration.py`, `tracking.py`, `velocity.py`, `persistence.py`
2. **Image Registration**: ORB features → BFMatcher + Lowe's ratio test → `cv2.findHomography` RANSAC → `warpPerspective` para alinear frame actual a referencia
3. **Crack Tracking**: Transformar centroides detectados hoy con homografía inversa → matching por distancia euclidiana + IoU bbox (≥0.5 configurable) → asignar `tracking_id` existente o crear nuevo
4. **Velocity Calculation**: Para cada `tracking_id` con ≥2 mediciones: `velocity_mm_day = (width_mm_today - width_mm_prev) / days_elapsed`
5. **New Crack Detection**: Fisuras sin match en referencia → flag `is_new=True`
6. **Persistence**: Extender modelos BD o crear tabla `crack_history(tracking_id, timestamp, width_mm, length_mm, classification, is_new, velocity_mm_day)`

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `edge/edge/temporal/registration.py` | New | ORB + RANSAC homography registration |
| `edge/edge/temporal/tracking.py` | New | Centroid matching + IoU tracking |
| `edge/edge/temporal/velocity.py` | New | Velocity calculation mm/day |
| `edge/edge/temporal/persistence.py` | New | BD historical persistence |
| `edge/edge/detector/fisura_detector.py` | Modified | Output `tracking_id` field in `CrackResult` |
| `edge/edge/config.py` | New config | IoU threshold, min_days_velocity, reference_frame_path |
| BD backend | New table | `crack_history` migration |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Registration falla por pocos features (pared lisa) | Med | Fallback: usar frame previo sin registro + log warning; validar en tests con texturas reales |
| Tracking id swap (cruce fisuras) | Med | Usar IoU + distancia centroide combinado; max distance threshold configurable |
| Velocidad ruidosa por ruido medición | Med | Requerir ≥2 días para primera velocidad; smoothing opcional EMA |
| BD crecimiento histórico sin límite | Baja | Política retención (ej. 2 años) + particionado mensual en migración |

## Rollback Plan

Eliminar directorio `edge/edge/temporal/`. Revertir `fisura_detector.py` a versión sin `tracking_id`. Dropear tabla `crack_history` (migración reversible). Configuración temporal removida de `config.py`.

## Dependencies

- Sprint 3 completado: medición real calibrada (`pixels_per_mm`, `fx`) funcional
- `calibration.json` disponible y válido
- OpenCV 4.x con módulos `features2d`, `calib3d` (ORB, RANSAC)
- BD PostgreSQL accesible desde edge (o buffer local + sync batch)

## Success Criteria

- [ ] Registration alinea frames con error < 2 px en features clave (validado con pares reales)
- [ ] Tracking mantiene `tracking_id` consistente ≥90% frames consecutivos (test con video sintético)
- [ ] Velocidad calculada coincide con Δancho conocido en simulador (±0.1 mm/día)
- [ ] Fisuras nuevas detectadas: 0 falsos positivos en frames de referencia
- [ ] Persistencia: histórico queryable por `tracking_id`, `timestamp`, `velocity_mm_day`
- [ ] Tests unitarios ≥80% coverage en módulo `temporal/`
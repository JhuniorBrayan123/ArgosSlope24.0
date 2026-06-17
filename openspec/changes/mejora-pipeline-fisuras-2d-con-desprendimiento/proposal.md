# Proposal: Mejora Pipeline Fisuras 2D con Detección de Desprendimientos

## Intent

Current pipeline classifies per-skeleton-component (wrong), lacks detachment detection, uses naive 0-90/90-180 split, and outputs inconsistent files. Rewrite to: extract segments → merge by 4 criteria → classify merged fissures by angle → detect detachments morphologically → improved visualization.

## Scope

### In Scope
- Segment extraction + merging: angle≤12°, centroid≤25px, endpoint≤35px, colinearity gap≤45px
- Family classification: F1(15-85°), F2(95-165°), FV(85-95° optional), IGNORE(rest)
- Horizontal divider removal: angle<10°/>170°, width>65%, height<30px
- Detachment detection: close(15,15) → dilate → CC → filter(area>1200,w>60,h>40,density>0.12,aspect<5.5) → orange overlay → D1,D2
- Remove detachments from mask before fissure detection
- Visualization: green skeleton, red F1, blue F2, labels F1-01/F2-01+cm length, table(ID|Family|Angle(deg)|Len(px)|Len(cm))
- New params: MIN_AREA=80, MIN_LENGTH_PX=35, MIN_LENGTH_CM=2.0, MIN_ASPECT=1.8, etc.
- Output: 4 images (01_imagen_calibrada, 02_mask, 03_skeleton, 04_familias_overlay+detachment), CSV, JSON(desprendimientos section)
- Summary: totals per family, detachments count+area cm²

### Out of Scope
3D reconstruction, temporal/velocity/trend analysis, YOLO/ML, web/MQTT changes, multi-camera.

## Capabilities

### New Capabilities
- `detachment-detection`: Morphological detection of spalls with D-labeling and orange overlay

### Modified Capabilities
- `fissure-detection-2d`: Rewrite — angle-based families, segment merging, output formats, visualization

## Approach

```
mask = binary → clean → skeleton
segments = extract_segments(skeleton)
merged = merge(segments)  # 4 criteria
detachments = detect_desprendimientos(mask)  # morph filter
mask -= detachments
classify each merged fissure by angle
draw: green skeleton + red F1 + blue F2 + orange detach + table
save 4 images + CSV + JSON
```

Single-file rewrite of `pipeline_maqueta.py`.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `edge/diagnostics/pipeline_maqueta.py` | Rewrite | Algorithm, merging, detachment, visualization, output |
| `edge/diagnostics/output/` | Modified | New filenames, JSON schema |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Over-merging real fissures | Medium | Tune thresholds; add visual debug |
| False detachments | Medium | Conservative thresholds; real-image test |
| "°" encoding | Low | Use "deg" per spec |

## Rollback Plan

`git checkout -- edge/diagnostics/pipeline_maqueta.py` + remove change folder.

## Dependencies

OpenCV (ximgproc optional, manual fallback exists), NumPy.

## Success Criteria

- [ ] Runs error-free on Imagen1.jpeg + 2 test images
- [ ] F1(15-85°) / F2(95-165°) ranges match spec
- [ ] Merging reduces fragment count vs unmerged skeleton
- [ ] Detachments detected, removed from mask, in JSON output
- [ ] All 4 images + CSV + JSON generated correctly
- [ ] "deg" used (no "°"); labels F1-01, F2-01 format

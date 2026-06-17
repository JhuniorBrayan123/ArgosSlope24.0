# Proposal: Sprint 8 — ML Training + Synthetic Data Pipeline

## Intent

`OnnxDetector` + `train_yolov8.py` exist but have zero data, labels, or models — always fallback to OpenCV. Need synthetic dataset → first YOLOv8n training → ONNX export → verify edge pipeline with ML inference.

## Scope

### In Scope
1. **Synthetic crack gen** (`edge/ml/generate_synthetic.py`) — OpenCV Bézier curves, branching, variable width. 3 classes. ~1000 YOLO images, 80/20 split.
2. **ML deps install** — ultralytics, onnx, onnxruntime
3. **First model** — yolov8n.pt, 50 epochs, imgsz=416, batch=4, CPU. Auto ONNX export.
4. **Edge integration test** — `create_detector("onnx")` loads ONNX, returns CrackResult, falls back on invalid model.
5. **Pipeline e2e** — synth frame → ONNX → tracking → velocity → alerts

### Out of Scope
RPi deploy (S9), real-data labeling, GPU training, TFLite, model refinement.

## Capabilities

### New Capabilities
- `synthetic-data-generation`: OpenCV crack texture generator with YOLO annotations
- `ml-crack-detection`: YOLOv8 training + ONNX inference in edge pipeline

### Modified Capabilities
- None

## Approach

1. **Generator**: OpenCV polylines on noise/background textures. Bézier branches, width per class: fina 1-2px, media 3-5px, gruesa 6-12px. YOLO bbox from contour extremes.
2. **Split**: `prepare_dataset.py split` reuses existing tooling.
3. **Training**: `train_yolov8.py --epochs 50 --imgsz 416 --batch 4`. Auto-ONNX via existing `export_to_onnx()`.
4. **Integration**: `DETECTOR_METHOD=onnx`, `MODEL_PATH=...best.onnx`. Test `OnnxDetector.process()`.
5. **E2E**: Feed image through edge main loop; verify CrackResult → tracking → velocity → alerts.

## Affected Areas

| Area | Impact |
|------|--------|
| `edge/ml/generate_synthetic.py` | New |
| `edge/ml/dataset/` | Populated |
| `edge/ml/models/` | New (trained .pt + .onnx) |
| `edge/edge/detector/fisura_detector.py` | Tested |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Synthetic→real transfer poor | High | Accepted; real data in S9+ |
| CPU training slow | Med | yolov8n + 416 + batch=4: ~2 min/epoch |
| ONNX format mismatch | Low | `export_to_onnx()` uses opset=12 |
| Missing deps | Low | `requirements.txt` exists |

## Rollback Plan

Delete `generate_synthetic.py`, `ml/dataset/train+val`, `ml/models/`. Uninstall ultralytics/onnx/onnxruntime. Reset `DETECTOR_METHOD` to opencv.

## Dependencies

- Sprint 7: background frames source
- Sprint 2: `OnnxDetector`, `create_detector()`, `train_yolov8.py`, `prepare_dataset.py` — all exist

## Success Criteria

- [ ] Generator outputs 800 train + 200 val .jpg + .txt (valid YOLO, 3 classes)
- [ ] yolov8n trains 50 epochs on CPU, exports best.onnx
- [ ] `OnnxDetector(best.onnx).process(frame)` returns CrackResult
- [ ] `create_detector("onnx")` falls back to OpenCV on bad model
- [ ] Synth crack frame completes full pipeline end-to-end

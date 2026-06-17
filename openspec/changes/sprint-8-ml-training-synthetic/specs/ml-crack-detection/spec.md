# ML Crack Detection Specification

## Purpose

Train a YOLOv8n model on synthetic crack data, export to ONNX, and integrate into the edge pipeline. Covers dependency installation, model training, ONNX export, detector integration tests, and end-to-end pipeline verification.

## Requirements

### Requirement: ML dependency installation

The system SHALL support installing ML dependencies via `pip install ultralytics onnx onnxruntime`. After installation, `python -c "import ultralytics; import onnx; import onnxruntime"` SHALL succeed without ImportError.

#### Scenario: Dependencies importable

- GIVEN `ultralytics`, `onnx`, `onnxruntime` are installed
- WHEN `python -c "import ultralytics; import onnx; import onnxruntime"` runs
- THEN exit code is 0, no ImportError raised

### Requirement: First model training

The system MUST train a YOLOv8n model via `train_yolov8.py --data ml/dataset/data.yaml --epochs 50 --batch 4 --imgsz 416 --model yolov8n.pt`. Training runs on CPU. The trained model SHALL be saved to `ml/models/argos-crack-detector/weights/best.pt`.

#### Scenario: Training completes on CPU

- GIVEN synthetic dataset exists at `ml/dataset/` with train + val splits
- WHEN `train_yolov8.py --epochs 50 --batch 4 --imgsz 416` runs
- THEN training completes within 3 hours
- AND `ml/models/argos-crack-detector/weights/best.pt` exists
- AND training logs show no NaN losses

### Requirement: ONNX auto-export

After training, the system SHALL auto-export `best.pt` to ONNX format via `export_to_onnx()`. The ONNX file SHALL be saved alongside the .pt as `best.onnx`. Export uses opset=12, FP16 half-float, and simplified graph.

#### Scenario: ONNX file created and loadable

- GIVEN training completed successfully
- WHEN `export_to_onnx()` runs
- THEN `ml/models/argos-crack-detector/weights/best.onnx` exists
- AND `onnxruntime.InferenceSession(best.onnx)` loads without error

#### Scenario: Export failure is non-fatal

- GIVEN training completed but ONNX export fails
- WHEN the script finishes
- THEN exit code is 0
- AND an ERROR log describes the failure

### Requirement: ONNX detector integration

The system SHALL support `create_detector("onnx")` returning an `OnnxDetector`. `OnnxDetector.process(frame)` SHALL return `list[CrackResult]` with `x, y, width, height, width_mm, classification, confidence` populated.

#### Scenario: OnnxDetector returns CrackResult

- GIVEN `DETECTOR_METHOD=onnx`, `MODEL_PATH=best.onnx`
- WHEN `detector = create_detector("onnx")`
- THEN `isinstance(detector, OnnxDetector)` is true
- AND `detector.process(synth_crack_frame)` returns a non-empty list of CrackResult

#### Scenario: Calibration scale applied

- GIVEN `calibration.json` with `pixels_per_mm=10.0`
- WHEN `OnnxDetector.process()` computes `width_mm`
- THEN width uses the calibrated ratio (px / 10.0), not the theoretical fallback
- AND no calibration-warning log is emitted

#### Scenario: Invalid model falls back to OpenCV

- GIVEN `MODEL_PATH=/nonexistent/model.onnx`
- WHEN `create_detector("onnx")` is called
- THEN `OnnxDetector._session` is None
- AND `process(frame)` returns CrackResult from OpenCV fallback
- AND a WARNING log is emitted

### Requirement: Pipeline end-to-end with ONNX

The edge main loop SHALL support running the full pipeline with ONNX: synthetic frame → ONNX detection → crack tracking → velocity computation → alert check.

#### Scenario: Full pipeline end-to-end

- GIVEN `DETECTOR_METHOD=onnx`, `MODEL_PATH=best.onnx`
- AND a synthetic crack frame is fed to the main loop
- WHEN the pipeline processes the frame
- THEN detection produces CrackResult list
- AND tracking assigns a `track_id`
- AND `smoothed_velocity` is computed
- AND the alert engine evaluates velocity against thresholds
- AND zero fallbacks to OpenCV occur (logged fallback count = 0)

#### Scenario: No-crack image skips tracking

- GIVEN a synthetic frame with no crack (background only)
- WHEN the pipeline processes it
- THEN detection returns empty list
- AND no tracking or velocity computation occurs
- AND the frame is silently skipped

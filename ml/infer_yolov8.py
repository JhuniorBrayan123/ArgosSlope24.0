#!/usr/bin/env python3
"""
ARGOS SLOPE 4.0 — YOLOv8/ONNX Inference Script.

Ejecuta inferencia con modelo entrenado sobre imágenes o video.
Compatible con modelos .pt (PyTorch), .onnx (ONNX Runtime) y .tflite.

Uso:
    # Inferencia sobre una imagen:
    python ml/infer_yolov8.py --model ml/models/argos-crack-detector/weights/best.onnx --source test.jpg

    # Inferencia sobre video:
    python ml/infer_yolov8.py --model best.pt --source video.mp4 --conf 0.5

    # Inferencia en vivo con cámara:
    python ml/infer_yolov8.py --model best.onnx --source 0
"""

from __future__ import annotations

import argparse
import logging
import sys
from pathlib import Path

import cv2
import numpy as np

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    stream=sys.stdout,
)
logger = logging.getLogger("infer_yolov8")

# Colores BGR para visualización
COLORS = {
    "fisura_fina": (0, 212, 170),    # teal
    "fisura_media": (245, 158, 11),  # amber
    "fisura_gruesa": (239, 68, 68),  # red
}


def infer_ultralytics(
    model_path: str,
    source: str,
    conf_threshold: float = 0.5,
    imgsz: int = 640,
    save_output: bool = True,
) -> None:
    """
    Inferencia usando Ultralytics YOLO (modelos .pt).

    Args:
        model_path: Ruta al modelo .pt.
        source: Fuente (ruta de imagen, video, o "0" para cámara).
        conf_threshold: Umbral de confianza.
        imgsz: Tamaño de entrada.
        save_output: Guardar resultado anotado.
    """
    from ultralytics import YOLO

    logger.info("Loading Ultralytics model: %s", model_path)
    model = YOLO(model_path)

    logger.info("Running inference on: %s", source)
    results = model(
        source=source,
        conf=conf_threshold,
        imgsz=imgsz,
        save=save_output,
        project="ml/outputs",
        name="inference",
        show=True,
    )

    logger.info("Inference complete. %d detecciones.", len(results))


def infer_onnx(
    model_path: str,
    source: str,
    conf_threshold: float = 0.5,
    imgsz: int = 640,
) -> None:
    """
    Inferencia usando ONNX Runtime (modelos .onnx).

    Args:
        model_path: Ruta al modelo .onnx.
        source: Fuente (ruta de imagen, video, o "0" para cámara).
        conf_threshold: Umbral de confianza.
        imgsz: Tamaño de entrada.
    """
    try:
        import onnxruntime as ort
    except ImportError:
        logger.error("onnxruntime not installed. Run: pip install onnxruntime")
        sys.exit(1)

    logger.info("Loading ONNX model: %s", model_path)
    session = ort.InferenceSession(
        model_path,
        providers=["CPUExecutionProvider"],
    )
    input_name = session.get_inputs()[0].name
    input_shape = session.get_inputs()[0].shape
    _, _, model_h, model_w = input_shape

    logger.info("Model input: %dx%d", model_w, model_h)

    # Abrir fuente
    if source.isdigit():
        cap = cv2.VideoCapture(int(source))
    else:
        cap = cv2.VideoCapture(source)

    if not cap.isOpened():
        logger.error("Cannot open source: %s", source)
        return

    while True:
        ret, frame = cap.read()
        if not ret:
            break

        # Preprocesar
        orig_h, orig_w = frame.shape[:2]
        input_blob = cv2.dnn.blobFromImage(
            frame, 1.0 / 255.0, (model_w, model_h), swapRB=True, crop=False
        ).astype(np.float32)

        # Inferir
        outputs = session.run(None, {input_name: input_blob})
        detections = outputs[0][0]  # (num_detections, 6)

        # Dibujar detecciones
        for det in detections:
            conf = float(det[4])
            if conf < conf_threshold:
                continue

            class_id = int(det[5])
            x1, y1, x2, y2 = det[:4]

            # Escalar a la imagen original
            x1 = int(x1 * orig_w / model_w)
            y1 = int(y1 * orig_h / model_h)
            x2 = int(x2 * orig_w / model_w)
            y2 = int(y2 * orig_h / model_h)

            # Color por clase
            color = list(COLORS.values())[class_id % len(COLORS)]
            label = f"{list(COLORS.keys())[class_id]} {conf:.2f}"

            cv2.rectangle(frame, (x1, y1), (x2, y2), color, 2)
            cv2.putText(
                frame, label, (x1, y1 - 8),
                cv2.FONT_HERSHEY_SIMPLEX, 0.5, color, 2,
            )

        # Mostrar
        cv2.imshow("ARGOS SLOPE — ONNX Inference", frame)
        if cv2.waitKey(1) & 0xFF == ord("q"):
            break

    cap.release()
    cv2.destroyAllWindows()
    logger.info("Inference stopped.")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="ARGOS SLOPE 4.0 — YOLOv8/ONNX Inference"
    )
    parser.add_argument("--model", type=str, required=True,
                        help="Path to model (.pt, .onnx, or .tflite)")
    parser.add_argument("--source", type=str, default="0",
                        help="Source: image path, video path, or camera index (default: 0)")
    parser.add_argument("--conf", type=float, default=0.5,
                        help="Confidence threshold (default: 0.5)")
    parser.add_argument("--imgsz", type=int, default=640,
                        help="Input size (default: 640)")
    parser.add_argument("--backend", type=str, default="auto",
                        choices=["auto", "ultralytics", "onnx"],
                        help="Inference backend (default: auto-detect)")

    args = parser.parse_args()

    model_path = args.model
    if not Path(model_path).exists():
        logger.error("Model not found: %s", model_path)
        sys.exit(1)

    # Detectar backend automáticamente
    backend = args.backend
    if backend == "auto":
        if model_path.endswith(".onnx"):
            backend = "onnx"
        elif model_path.endswith((".pt", ".pth")):
            backend = "ultralytics"
        else:
            logger.error("Cannot auto-detect backend for: %s", model_path)
            logger.info("Use --backend to specify: ultralytics or onnx")
            sys.exit(1)

    logger.info("Backend: %s", backend)

    if backend == "ultralytics":
        infer_ultralytics(
            model_path=model_path,
            source=args.source,
            conf_threshold=args.conf,
            imgsz=args.imgsz,
        )
    elif backend == "onnx":
        infer_onnx(
            model_path=model_path,
            source=args.source,
            conf_threshold=args.conf,
            imgsz=args.imgsz,
        )


if __name__ == "__main__":
    main()

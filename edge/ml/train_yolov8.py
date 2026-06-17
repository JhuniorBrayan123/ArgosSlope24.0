#!/usr/bin/env python3
"""
ARGOS SLOPE 4.0 — YOLOv8 Training Script for Crack Detection.

Entrena un modelo YOLOv8 para detectar fisuras en taludes mineros.
Exporta automáticamente a ONNX para inferencia en edge (Raspberry Pi).

Requisitos:
    pip install ultralytics opencv-python numpy pyyaml

Uso:
    # Entrenar desde cero:
    python ml/train_yolov8.py --data ml/dataset/data.yaml --epochs 100

    # Continuar entrenamiento desde checkpoint:
    python ml/train_yolov8.py --resume ml/models/weights/last.pt --epochs 50

    # Solo exportar modelo existente a ONNX:
    python ml/train_yolov8.py --export ml/models/weights/best.pt
"""

from __future__ import annotations

import argparse
import logging
import sys
from pathlib import Path

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    stream=sys.stdout,
)
logger = logging.getLogger("train_yolov8")


def create_default_data_yaml(output_path: Path) -> Path:
    """
    Crea un archivo data.yaml por defecto para el dataset de fisuras.

    Estructura esperada del dataset::

        ml/dataset/
        ├── data.yaml
        ├── train/
        │   ├── images/    # imágenes de entrenamiento
        │   └── labels/    # etiquetas YOLO .txt
        └── val/
            ├── images/    # imágenes de validación
            └── labels/    # etiquetas YOLO .txt

    Returns:
        Ruta al archivo data.yaml.
    """
    content = """
# ARGOS SLOPE 4.0 — Crack Detection Dataset
# Formato YOLOv8

path: {dataset_path}  # raíz del dataset
train: train/images   # imágenes de entrenamiento
val: val/images       # imágenes de validación

# Clases de fisuras
nc: 3
names:
  0: fisura_fina       # < 0.3 mm
  1: fisura_media      # 0.3 – 1.0 mm
  2: fisura_gruesa     # > 1.0 mm
"""
    output_path.write_text(content.format(dataset_path=output_path.parent.resolve()))
    logger.info("Created default data.yaml at %s", output_path)
    return output_path


def train_yolov8(
    data_yaml: str,
    epochs: int = 100,
    imgsz: int = 640,
    batch: int = 16,
    model: str = "yolov8n.pt",
    project: str = "ml/models",
    name: str = "argos-crack-detector",
    resume: bool = False,
    device: str = "cpu",
) -> str:
    """
    Entrena un modelo YOLOv8 para detección de fisuras.

    Args:
        data_yaml: Ruta al archivo data.yaml del dataset.
        epochs: Número de épocas de entrenamiento.
        imgsz: Tamaño de imagen de entrada (pixels).
        batch: Tamaño del batch.
        model: Modelo base (yolov8n.pt, yolov8s.pt, etc.).
        project: Directorio del proyecto (donde se guardan los pesos).
        name: Nombre del experimento.
        resume: Continuar entrenamiento desde checkpoint.
        device: Dispositivo ("cpu", "0", "0,1", etc.).

    Returns:
        Ruta al modelo entrenado (best.pt).
    """
    from ultralytics import YOLO

    # Cargar modelo
    if Path(model).exists():
        logger.info("Resuming from checkpoint: %s", model)
        yolo = YOLO(model)
    else:
        logger.info("Loading pretrained model: %s", model)
        yolo = YOLO(model)

    # Entrenar
    logger.info(
        "Starting training: epochs=%d, imgsz=%d, batch=%d, device=%s",
        epochs,
        imgsz,
        batch,
        device,
    )
    results = yolo.train(
        data=data_yaml,
        epochs=epochs,
        imgsz=imgsz,
        batch=batch,
        project=project,
        name=name,
        resume=resume,
        device=device,
        workers=4,
        patience=20,  # early stopping
        save=True,
        save_period=10,
        val=True,
        amp=True,  # mixed precision
    )

    best_model = str(Path(project) / name / "weights" / "best.pt")
    logger.info("Training complete. Best model: %s", best_model)
    return best_model


def export_to_onnx(model_path: str, imgsz: int = 640) -> str:
    """
    Exporta un modelo YOLOv8 entrenado a formato ONNX.

    Args:
        model_path: Ruta al modelo .pt entrenado.
        imgsz: Tamaño de imagen de entrada.

    Returns:
        Ruta al modelo ONNX exportado.
    """
    from ultralytics import YOLO

    logger.info("Exporting %s to ONNX...", model_path)
    yolo = YOLO(model_path)

    onnx_path = yolo.export(
        format="onnx",
        imgsz=imgsz,
        half=True,          # FP16 para mejor rendimiento en RPi
        simplify=True,      # ONNX simplificado
        opset=12,           # compatibilidad con onnxruntime
    )

    logger.info("ONNX export complete: %s", onnx_path)
    return str(onnx_path)


def export_to_tflite(model_path: str, imgsz: int = 640) -> str:
    """
    Exporta a TFLite (para Raspberry Pi con Edge TPU).

    Args:
        model_path: Ruta al modelo .pt entrenado.
        imgsz: Tamaño de imagen de entrada.

    Returns:
        Ruta al modelo TFLite exportado.
    """
    from ultralytics import YOLO

    logger.info("Exporting %s to TFLite...", model_path)
    yolo = YOLO(model_path)

    tflite_path = yolo.export(
        format="tflite",
        imgsz=imgsz,
        half=True,
        int8=True,  # cuantización int8 para Edge TPU
    )

    logger.info("TFLite export complete: %s", tflite_path)
    return str(tflite_path)


def main() -> None:
    parser = argparse.ArgumentParser(
        description="ARGOS SLOPE 4.0 — YOLOv8 Training for Crack Detection"
    )
    parser.add_argument("--data", type=str, default="ml/dataset/data.yaml",
                        help="Path to dataset YAML (default: ml/dataset/data.yaml)")
    parser.add_argument("--model", type=str, default="yolov8n.pt",
                        help="Base model or checkpoint (default: yolov8n.pt)")
    parser.add_argument("--epochs", type=int, default=100,
                        help="Number of epochs (default: 100)")
    parser.add_argument("--imgsz", type=int, default=640,
                        help="Input image size (default: 640)")
    parser.add_argument("--batch", type=int, default=16,
                        help="Batch size (default: 16)")
    parser.add_argument("--device", type=str, default="cpu",
                        help="Device: cpu, 0, 0,1 (default: cpu)")
    parser.add_argument("--project", type=str, default="ml/models",
                        help="Project directory (default: ml/models)")
    parser.add_argument("--name", type=str, default="argos-crack-detector",
                        help="Experiment name (default: argos-crack-detector)")
    parser.add_argument("--resume", action="store_true",
                        help="Resume training from checkpoint")
    parser.add_argument("--export", type=str, default=None,
                        help="Export model to ONNX (provide path to .pt)")
    parser.add_argument("--export-tflite", type=str, default=None,
                        help="Export model to TFLite (provide path to .pt)")
    parser.add_argument("--init-data", action="store_true",
                        help="Create default data.yaml")

    args = parser.parse_args()

    # ── Init data.yaml ──
    if args.init_data:
        data_path = Path(args.data)
        data_path.parent.mkdir(parents=True, exist_ok=True)
        create_default_data_yaml(data_path)
        logger.info("data.yaml created. Populate the dataset and re-run without --init-data.")
        return

    # ── Export only ──
    if args.export:
        onnx_path = export_to_onnx(args.export, args.imgsz)
        print(f"\n✅ ONNX model: {onnx_path}")
        return

    if args.export_tflite:
        tflite_path = export_to_tflite(args.export_tflite, args.imgsz)
        print(f"\n✅ TFLite model: {tflite_path}")
        return

    # ── Train ──
    data_path = Path(args.data)
    if not data_path.exists():
        logger.warning("data.yaml not found. Creating default...")
        create_default_data_yaml(data_path)
        logger.info(
            "Populate the dataset at %s and re-run the script.",
            data_path.parent,
        )
        return

    best = train_yolov8(
        data_yaml=args.data,
        epochs=args.epochs,
        imgsz=args.imgsz,
        batch=args.batch,
        model=args.model,
        project=args.project,
        name=args.name,
        resume=args.resume,
        device=args.device,
    )

    # Auto-export a ONNX
    onnx = export_to_onnx(best, args.imgsz)

    print(f"\n{'═' * 60}")
    print(f"  ✅ Entrenamiento completo")
    print(f"  📦 Modelo PyTorch: {best}")
    print(f"  📦 Modelo ONNX:    {onnx}")
    print(f"{'═' * 60}")


if __name__ == "__main__":
    main()

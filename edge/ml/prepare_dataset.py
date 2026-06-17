#!/usr/bin/env python3
"""
ARGOS SLOPE 4.0 — Dataset Preparation Helper.

Utilidades para preparar el dataset de fisuras:
  1. Dividir imágenes en train/val
  2. Convertir anotaciones de COCO JSON a formato YOLO
  3. Validar el dataset antes de entrenar
  4. Aumentar dataset con data augmentation básico

Uso:
    # Dividir dataset:
    python ml/prepare_dataset.py split --input raw_images/ --output ml/dataset/ --val-ratio 0.2

    # Convertir COCO a YOLO:
    python ml/prepare_dataset.py coco2yolo --coco annotations.json --images images/ --output ml/dataset/

    # Validar dataset:
    python ml/prepare_dataset.py validate --data ml/dataset/data.yaml
"""

from __future__ import annotations

import argparse
import json
import logging
import random
import shutil
import sys
from pathlib import Path

import cv2
import numpy as np

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    stream=sys.stdout,
)
logger = logging.getLogger("prepare_dataset")


# ── Split dataset ────────────────────────────────────────────────────


def split_dataset(input_dir: str, output_dir: str, val_ratio: float = 0.2) -> None:
    """
    Divide imágenes en train/val según la proporción indicada.

    Args:
        input_dir: Directorio con imágenes y etiquetas YOLO (.txt).
        output_dir: Directorio de salida (se crea estructura YOLO).
        val_ratio: Proporción de validación (0.0–1.0).
    """
    input_path = Path(input_dir)
    images = sorted(input_path.glob("*.jpg")) + sorted(input_path.glob("*.png"))

    if not images:
        logger.error("No images found in %s", input_dir)
        return

    random.shuffle(images)
    split_idx = int(len(images) * (1 - val_ratio))
    train_images = images[:split_idx]
    val_images = images[split_idx:]

    output = Path(output_dir)
    for subset_name, subset_images in [("train", train_images), ("val", val_images)]:
        img_dir = output / subset_name / "images"
        lbl_dir = output / subset_name / "labels"
        img_dir.mkdir(parents=True, exist_ok=True)
        lbl_dir.mkdir(parents=True, exist_ok=True)

        for img_path in subset_images:
            # Copiar imagen
            shutil.copy2(img_path, img_dir / img_path.name)

            # Copiar label si existe
            label_path = img_path.with_suffix(".txt")
            if label_path.exists():
                shutil.copy2(label_path, lbl_dir / label_path.name)

    logger.info(
        "Split complete: %d train, %d val images → %s",
        len(train_images),
        len(val_images),
        output,
    )


# ── COCO to YOLO converter ──────────────────────────────────────────


def coco2yolo(coco_json: str, images_dir: str, output_dir: str) -> None:
    """
    Convierte anotaciones COCO JSON a formato YOLO .txt.

    Args:
        coco_json: Ruta al archivo COCO JSON.
        images_dir: Directorio con las imágenes.
        output_dir: Directorio de salida YOLO.
    """
    with open(coco_json) as f:
        coco = json.load(f)

    # Mapa de categorías
    cat_map = {cat["id"]: idx for idx, cat in enumerate(coco["categories"])}

    # Mapa de nombre de archivo → id de imagen
    img_map = {}
    for img in coco["images"]:
        img_map[img["id"]] = img["file_name"]

    # Agrupar anotaciones por imagen
    anns_by_img: dict[int, list] = {}
    for ann in coco["annotations"]:
        img_id = ann["image_id"]
        anns_by_img.setdefault(img_id, []).append(ann)

    output = Path(output_dir)
    labels_dir = output / "labels"
    labels_dir.mkdir(parents=True, exist_ok=True)

    images_path = Path(images_dir)
    for img_id, anns in anns_by_img.items():
        file_name = img_map[img_id]
        img_path = images_path / file_name

        # Obtener dimensiones de la imagen
        img = cv2.imread(str(img_path))
        if img is None:
            logger.warning("Cannot read %s, skipping", img_path)
            continue
        h, w = img.shape[:2]

        # Escribir label en formato YOLO
        label_path = labels_dir / Path(file_name).with_suffix(".txt").name
        with open(label_path, "w") as f:
            for ann in anns:
                cat_id = ann["category_id"]
                if cat_id not in cat_map:
                    continue
                class_id = cat_map[cat_id]
                bbox = ann["bbox"]  # [x, y, width, height]
                x_center = (bbox[0] + bbox[2] / 2) / w
                y_center = (bbox[1] + bbox[3] / 2) / h
                bw = bbox[2] / w
                bh = bbox[3] / h
                f.write(f"{class_id} {x_center:.6f} {y_center:.6f} {bw:.6f} {bh:.6f}\n")

        # Copiar imagen
        img_output = output / "images" / file_name
        img_output.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(img_path, img_output)

    logger.info(
        "COCO→YOLO conversion complete: %d images → %s",
        len(anns_by_img),
        output,
    )


# ── Dataset validation ──────────────────────────────────────────────


def validate_dataset(data_yaml: str) -> None:
    """
    Valida la estructura del dataset YOLO.

    Args:
        data_yaml: Ruta al archivo data.yaml.
    """
    import yaml

    data_path = Path(data_yaml)
    if not data_path.exists():
        logger.error("data.yaml not found: %s", data_yaml)
        return

    with open(data_path) as f:
        data = yaml.safe_load(f)

    base = data_path.parent
    errors: list[str] = []

    for split_name in ["train", "val"]:
        img_dir = base / data.get(split_name, f"{split_name}/images")
        lbl_dir = base / f"{split_name}/labels"

        if not img_dir.exists():
            errors.append(f"Missing {split_name}/images directory")
            continue

        images = list(img_dir.glob("*.*"))
        logger.info("%s: %d images", split_name, len(images))

        # Verificar etiquetas
        missing_labels = 0
        empty_labels = 0
        for img_path in images:
            label_path = lbl_dir / img_path.with_suffix(".txt").name
            if not label_path.exists():
                missing_labels += 1
            elif label_path.stat().st_size == 0:
                empty_labels += 1

        if missing_labels:
            errors.append(f"{split_name}: {missing_labels} images without labels")
        if empty_labels:
            errors.append(f"{split_name}: {empty_labels} empty label files")

        # Verificar formato de etiquetas
        for lbl_path in sorted(lbl_dir.glob("*.txt"))[:5]:  # sample 5
            with open(lbl_path) as f:
                for line in f:
                    parts = line.strip().split()
                    if len(parts) != 5:
                        errors.append(f"Invalid label format: {lbl_path}")
                        break
                    try:
                        vals = [float(v) for v in parts]
                        if not (0 <= vals[0] < data.get("nc", 3)):
                            errors.append(f"Class ID out of range: {lbl_path}")
                    except ValueError:
                        errors.append(f"Non-numeric values: {lbl_path}")

    if errors:
        logger.error("Validation found %d issues:", len(errors))
        for e in errors:
            logger.error("  ✗ %s", e)
    else:
        logger.info("✅ Dataset validation passed!")


# ── CLI ─────────────────────────────────────────────────────────────


def main() -> None:
    parser = argparse.ArgumentParser(
        description="ARGOS SLOPE 4.0 — Dataset Preparation"
    )
    sub = parser.add_subparsers(dest="command", required=True)

    # split
    split_p = sub.add_parser("split", help="Split images into train/val")
    split_p.add_argument("--input", required=True, help="Input directory with images")
    split_p.add_argument("--output", default="ml/dataset", help="Output directory")
    split_p.add_argument("--val-ratio", type=float, default=0.2, help="Validation ratio")

    # coco2yolo
    coco_p = sub.add_parser("coco2yolo", help="Convert COCO JSON to YOLO format")
    coco_p.add_argument("--coco", required=True, help="COCO JSON file")
    coco_p.add_argument("--images", required=True, help="Images directory")
    coco_p.add_argument("--output", default="ml/dataset", help="Output directory")

    # validate
    val_p = sub.add_parser("validate", help="Validate YOLO dataset")
    val_p.add_argument("--data", default="ml/dataset/data.yaml", help="data.yaml path")

    args = parser.parse_args()

    if args.command == "split":
        split_dataset(args.input, args.output, args.val_ratio)
    elif args.command == "coco2yolo":
        coco2yolo(args.coco, args.images, args.output)
    elif args.command == "validate":
        validate_dataset(args.data)


if __name__ == "__main__":
    main()

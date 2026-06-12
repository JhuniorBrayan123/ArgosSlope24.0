#!/usr/bin/env python3
"""
ARGOS SLOPE 4.0 — Synthetic Crack Generator for ML Training.

Generates realistic synthetic crack textures with YOLO-format annotations
using OpenCV drawing primitives (Bézier curves, variable-width strokes,
branching). Produces ``fisura_fina`` (<3px), ``fisura_media`` (3–8px),
and ``fisura_gruesa`` (>8px) classes at 640px reference width.

Output structure::

    output_dir/
    ├── train/
    │   ├── images/  (img_000001.jpg, …)
    │   └── labels/  (img_000001.txt, …)
    └── val/
        ├── images/
        └── labels/

Usage::

    python edge/ml/generate_synthetic.py --output ml/dataset --num-images 1000
"""

from __future__ import annotations

import argparse
import logging
import math
import shutil
import sys
from dataclasses import dataclass, field
from pathlib import Path

import cv2
import numpy as np

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    stream=sys.stdout,
)
logger = logging.getLogger("generate_synthetic")

# ── Constants ─────────────────────────────────────────────────────────────────

CLASS_NAMES = ["fisura_fina", "fisura_media", "fisura_gruesa"]
"""Class names ordered by class_id (0, 1, 2)."""

# Width thresholds at 640px reference (pixels)
FINA_THRESHOLD_PX = 3     # < 3px → fina (class 0)
MEDIA_THRESHOLD_PX = 8    # 3–8px → media (class 1)
                          # > 8px → gruesa (class 2)

# Dilation iterations to achieve target widths
_WIDTH_ITER_FINA = (1, 2)      # 1-2 iterations → ~1-2px width
_WIDTH_ITER_MEDIA = (3, 7)     # 3-7 iterations → ~3-7px width
_WIDTH_ITER_GRUESA = (9, 12)   # 9-12 iterations → ~9-12px width


# ── Data types ───────────────────────────────────────────────────────────────


@dataclass
class CrackSpec:
    """Describes one synthetic crack to render.

    Attributes:
        control_points: Bézier control points (image coordinates).
        target_width_px: Width in pixels after dilation iterations.
        class_id: 0=fina, 1=media, 2=gruesa.
    """

    control_points: list[tuple[int, int]] = field(default_factory=list)
    target_width_px: int = 2
    class_id: int = 0


# ── Main generator class ────────────────────────────────────────────────────


class SyntheticCrackGenerator:
    """Generates synthetic crack images with YOLO-format labels.

    Args:
        output_dir: Root output directory.
        num_images: Total images to generate.
        imgsz: Image size in pixels (square).
        crack_count: (min, max) cracks per image. 0 for background-only.
        noise_level: Standard deviation of additive Gaussian noise (0.0–1.0).
        background: Background style (``solid``, ``gradient``, ``texture``).
        val_ratio: Fraction of images for validation split.
        seed: Random seed for reproducibility.
    """

    def __init__(
        self,
        output_dir: str = "ml/dataset",
        num_images: int = 1000,
        imgsz: int = 640,
        crack_count: tuple[int, int] = (1, 5),
        noise_level: float = 0.1,
        background: str = "gradient",
        val_ratio: float = 0.2,
        seed: int | None = None,
    ) -> None:
        self._output_dir = Path(output_dir)
        self._num_images = num_images
        self._imgsz = imgsz
        self._crack_min, self._crack_max = crack_count
        self._noise_level = noise_level
        self._background = background
        self._val_ratio = val_ratio
        self._seed = seed

        logger.info(
            "SyntheticCrackGenerator: %d images, %dx%d, %d–%d cracks/image, "
            "background=%s, noise=%.2f, val_ratio=%.2f",
            self._num_images,
            self._imgsz,
            self._imgsz,
            self._crack_min,
            self._crack_max,
            self._background,
            self._noise_level,
            self._val_ratio,
        )

    # ── Public API ──────────────────────────────────────────────────────────

    def generate(self) -> tuple[int, int]:
        """Generate synthetic crack images and split into train/val.

        Returns:
            ``(train_count, val_count)`` — number of images in each split.
        """
        if self._num_images == 0:
            logger.info("num_images=0 — nothing to generate.")
            return (0, 0)

        # Create staging directory
        staging = self._output_dir / "_staging"
        staging.mkdir(parents=True, exist_ok=True)

        # Set up RNG
        rng = np.random.default_rng(self._seed)

        total_to_generate = self._num_images

        for idx in range(1, total_to_generate + 1):
            # Determine how many cracks for this image
            if self._crack_max == 0:
                num_cracks = 0
            else:
                num_cracks = int(rng.integers(self._crack_min, self._crack_max + 1))

            # Create background
            canvas = self._make_background(rng)

            # Generate and render cracks
            labels: list[tuple[int, float, float, float, float]] = []
            for _ in range(num_cracks):
                spec = self._generate_crack(self._imgsz, rng)
                if spec is None:
                    continue
                mask = self._render_crack(canvas, spec, rng)
                bbox = self._compute_yolo_bbox(mask, self._imgsz)
                labels.append((spec.class_id, *bbox))

            # Write image
            img_filename = f"img_{idx:06d}.jpg"
            img_path = staging / img_filename
            success = cv2.imwrite(str(img_path), canvas,
                                  [cv2.IMWRITE_JPEG_QUALITY, 95])
            if not success:
                logger.error("Failed to write %s", img_path)

            # Write label (only if cracks present)
            if labels:
                label_path = staging / f"img_{idx:06d}.txt"
                for class_id, xc, yc, w, h in labels:
                    self._write_label(label_path, class_id, (xc, yc, w, h))

            if idx % 100 == 0:
                logger.info("Generated %d / %d images...", idx, total_to_generate)

        # Split into train/val
        train_count, val_count = self._split_train_val(staging)

        # Write data.yaml
        self._write_data_yaml()

        # Remove staging
        shutil.rmtree(staging, ignore_errors=True)

        logger.info(
            "Generation complete: %d train + %d val → %s",
            train_count,
            val_count,
            self._output_dir,
        )
        return (train_count, val_count)

    # ── Background generation ───────────────────────────────────────────────

    def _make_background(self, rng: np.random.Generator) -> np.ndarray:
        """Create a BGR background image (HxWx3, uint8).

        Args:
            rng: NumPy random generator for reproducibility.

        Returns:
            Background image as a BGR numpy array.
        """
        s = self._imgsz

        if self._background == "solid":
            # Random solid colour (gravel tones: 80–160)
            base = int(rng.integers(80, 160))
            bg = np.full((s, s, 3), base, dtype=np.uint8)

        elif self._background == "gradient":
            # Vertical gradient from dark to light
            base = int(rng.integers(80, 140))
            gradient = np.linspace(base - 20, base + 20, s, dtype=np.uint8)
            bg = np.zeros((s, s, 3), dtype=np.uint8)
            for c in range(3):
                bg[:, :, c] = np.tile(gradient[:, np.newaxis], (1, s))

        elif self._background == "texture":
            # Noise-based texture with gravel-like pattern
            bg = rng.integers(60, 180, (s, s, 3), dtype=np.uint8)

        else:
            bg = np.full((s, s, 3), 120, dtype=np.uint8)

        # Add Gaussian noise for realism
        if self._noise_level > 0:
            noise = rng.normal(
                0, self._noise_level * 255, (s, s, 3)
            ).astype(np.float32)
            bg = np.clip(bg.astype(np.float32) + noise, 0, 255).astype(np.uint8)

        return bg

    # ── Crack generation ────────────────────────────────────────────────────

    def _generate_crack(
        self, imgsz: int, rng: np.random.Generator,
    ) -> CrackSpec | None:
        """Generate random Bézier control points with target width.

        Args:
            imgsz: Image size in pixels.
            rng: NumPy random generator.

        Returns:
            A ``CrackSpec``, or ``None`` if generation fails.
        """
        # Random start point near centre with spread
        margin = imgsz // 6
        x0 = int(rng.integers(margin, imgsz - margin))
        y0 = int(rng.integers(margin, imgsz - margin))

        # Bézier curve direction angle
        angle = rng.uniform(0, 2 * math.pi)
        length = rng.integers(imgsz // 8, imgsz // 3)

        # Generate 4 control points along a curve with some randomness
        cp: list[tuple[int, int]] = [(x0, y0)]
        for i in range(1, 4):
            t = i / 3.0
            # Base position along angle
            bx = int(x0 + length * t * math.cos(angle))
            by = int(y0 + length * t * math.sin(angle))
            # Add perpendicular offset for curvature
            perp = rng.uniform(-length * 0.15, length * 0.15)
            px = int(bx + perp * math.cos(angle + math.pi / 2))
            py = int(by + perp * math.sin(angle + math.pi / 2))
            # Clamp to image bounds
            px = max(2, min(imgsz - 3, px))
            py = max(2, min(imgsz - 3, py))
            cp.append((px, py))

        # Target width → class mapping using defined thresholds
        class_roll = rng.random()
        if class_roll < 0.33:
            target_width = int(rng.integers(_WIDTH_ITER_FINA[0], _WIDTH_ITER_FINA[1] + 1))
            class_id = 0  # fina
        elif class_roll < 0.66:
            target_width = int(rng.integers(_WIDTH_ITER_MEDIA[0], _WIDTH_ITER_MEDIA[1] + 1))
            class_id = 1  # media
        else:
            target_width = int(rng.integers(_WIDTH_ITER_GRUESA[0], _WIDTH_ITER_GRUESA[1] + 1))
            class_id = 2  # gruesa

        return CrackSpec(
            control_points=cp,
            target_width_px=target_width,
            class_id=class_id,
        )

    # ── Crack rendering ─────────────────────────────────────────────────────

    def _render_crack(self, canvas: np.ndarray, spec: CrackSpec,
                      rng: np.random.Generator) -> np.ndarray:
        """Draw a crack on the canvas and return a binary mask.

        Draws a smooth polyline through Bézier control points, then dilates
        to achieve the target width. Also adds a branching sub-crack from
        the midpoint.

        Args:
            canvas: Base image (will be modified in-place).
            spec: The crack specification.
            rng: NumPy random generator (for reproducibility).

        Returns:
            Binary mask of the drawn crack (same size as canvas, uint8 0/255).
        """
        mask = np.zeros(canvas.shape[:2], dtype=np.uint8)
        imgsz = canvas.shape[0]
        pts = np.array(spec.control_points, dtype=np.int32).reshape((-1, 1, 2))

        # Draw smooth polyline on mask
        cv2.polylines(mask, [pts], isClosed=False, color=255, thickness=1)

        # Add branching from midpoint
        if len(spec.control_points) >= 3:
            mid_idx = len(spec.control_points) // 2
            mid_pt = spec.control_points[mid_idx]
            # Branch in a different direction
            branch_angle = rng.uniform(0, 2 * math.pi)
            branch_len = imgsz // 12
            branch_end = (
                int(mid_pt[0] + branch_len * math.cos(branch_angle)),
                int(mid_pt[1] + branch_len * math.sin(branch_angle)),
            )
            branch_end = (
                max(2, min(imgsz - 3, branch_end[0])),
                max(2, min(imgsz - 3, branch_end[1])),
            )
            branch_pts = np.array(
                [mid_pt, branch_end], dtype=np.int32,
            ).reshape((-1, 1, 2))
            cv2.polylines(mask, [branch_pts], isClosed=False, color=255, thickness=1)

        # Dilate to achieve target width
        kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
        for _ in range(spec.target_width_px):
            mask = cv2.dilate(mask, kernel, iterations=1)

        # Gaussian blur for realistic soft edges
        blur_ksize = max(3, spec.target_width_px * 2 + 1)
        if blur_ksize % 2 == 0:
            blur_ksize += 1
        mask = cv2.GaussianBlur(mask, (blur_ksize, blur_ksize), 0)

        # Threshold back to binary
        _, mask = cv2.threshold(mask, 50, 255, cv2.THRESH_BINARY)

        # Draw crack as dark pixels on canvas (cracks are dark on light rock)
        crack_color = int(rng.integers(20, 61))  # dark grey to near-black
        canvas[mask > 0] = (crack_color, crack_color, crack_color)

        return mask

    # ── YOLO bounding box computation ───────────────────────────────────────

    @staticmethod
    def _compute_yolo_bbox(
        mask: np.ndarray, imgsz: int,
    ) -> tuple[float, float, float, float]:
        """Compute YOLO-format bounding box from a binary crack mask.

        Args:
            mask: Binary mask (HxW, uint8) with crack pixels > 0.
            imgsz: Image size in pixels.

        Returns:
            ``(x_center, y_center, width, height)`` all normalized to [0, 1].
        """
        # Find contour extremes
        ys, xs = np.where(mask > 0)
        if len(xs) == 0 or len(ys) == 0:
            return (0.0, 0.0, 0.0, 0.0)

        x_min = float(xs.min())
        x_max = float(xs.max() + 1)  # +1 for inclusive range → pixel width
        y_min = float(ys.min())
        y_max = float(ys.max() + 1)

        box_w = x_max - x_min
        box_h = y_max - y_min
        x_center = x_min + box_w / 2.0
        y_center = y_min + box_h / 2.0

        # Normalize
        return (
            x_center / imgsz,
            y_center / imgsz,
            box_w / imgsz,
            box_h / imgsz,
        )

    # ── Label writing ───────────────────────────────────────────────────────

    @staticmethod
    def _write_label(
        label_path: Path,
        class_id: int,
        bbox: tuple[float, float, float, float],
    ) -> None:
        """Append one YOLO-format line to the label file.

        Format: ``<class_id> <x_center> <y_center> <width> <height>``
        All values normalized to [0, 1].

        Args:
            label_path: Path to the .txt label file.
            class_id: Crack class ID (0, 1, or 2).
            bbox: ``(x_center, y_center, width, height)`` normalized.
        """
        xc, yc, w, h = bbox
        line = f"{class_id} {xc:.6f} {yc:.6f} {w:.6f} {h:.6f}\n"
        with open(label_path, "a") as f:
            f.write(line)

    # ── Train/val split ─────────────────────────────────────────────────────

    def _split_train_val(self, staging: Path) -> tuple[int, int]:
        """Split staged files into train/val directories.

        Args:
            staging: Directory with all generated .jpg and .txt files.

        Returns:
            ``(train_count, val_count)``.
        """
        rng = np.random.default_rng(self._seed)
        images = sorted(staging.glob("*.jpg"))
        rng.shuffle(images)

        split_idx = int(len(images) * (1.0 - self._val_ratio))
        train_images = images[:split_idx]
        val_images = images[split_idx:]

        for split_name, split_images in [
            ("train", train_images),
            ("val", val_images),
        ]:
            img_dir = self._output_dir / split_name / "images"
            lbl_dir = self._output_dir / split_name / "labels"
            img_dir.mkdir(parents=True, exist_ok=True)
            lbl_dir.mkdir(parents=True, exist_ok=True)

            for img_path in split_images:
                # Move image
                shutil.move(str(img_path), str(img_dir / img_path.name))
                # Move label if exists
                label_path = staging / img_path.with_suffix(".txt").name
                if label_path.exists():
                    shutil.move(str(label_path), str(lbl_dir / label_path.name))

        logger.info(
            "Split: %d train, %d val",
            len(train_images),
            len(val_images),
        )
        return (len(train_images), len(val_images))

    # ── data.yaml writer ────────────────────────────────────────────────────

    def _write_data_yaml(self) -> None:
        """Create ``data.yaml`` at the output root compatible with YOLOv8."""
        yaml_path = self._output_dir / "data.yaml"
        content = f"""# ARGOS SLOPE 4.0 — Crack Detection Dataset (synthetic)
# Formato YOLOv8

path: {self._output_dir.resolve()}  # raíz del dataset
train: train/images
val: val/images

# Clases de fisuras según espesor
nc: 3
names:
  0: fisura_fina       # < 3px at 640px (synthetic)
  1: fisura_media      # 3–8px at 640px (synthetic)
  2: fisura_gruesa     # > 8px at 640px (synthetic)
"""
        yaml_path.write_text(content)
        logger.info("Created data.yaml at %s", yaml_path)


# ── CLI entry point ──────────────────────────────────────────────────────────


def cli_main() -> None:
    """Command-line entry point for ``generate_synthetic.py``."""
    parser = argparse.ArgumentParser(
        description="ARGOS SLOPE 4.0 — Generate Synthetic Crack Dataset",
    )
    parser.add_argument(
        "--output", type=str, default="ml/dataset",
        help="Output directory (default: ml/dataset)",
    )
    parser.add_argument(
        "--num-images", type=int, default=1000,
        help="Total images to generate (default: 1000)",
    )
    parser.add_argument(
        "--imgsz", type=int, default=640,
        help="Image size in pixels, square (default: 640)",
    )
    parser.add_argument(
        "--crack-count", type=int, nargs=2, default=(1, 5),
        metavar=("MIN", "MAX"),
        help="Crack count range per image (default: 1 5). 0 for background only.",
    )
    parser.add_argument(
        "--noise-level", type=float, default=0.1,
        help="Background Gaussian noise stddev 0.0–1.0 (default: 0.1)",
    )
    parser.add_argument(
        "--background", type=str, default="gradient",
        choices=["solid", "gradient", "texture"],
        help="Background style (default: gradient)",
    )
    parser.add_argument(
        "--val-ratio", type=float, default=0.2,
        help="Validation split ratio (default: 0.2)",
    )
    parser.add_argument(
        "--seed", type=int, default=None,
        help="Random seed for reproducibility (default: None)",
    )

    args = parser.parse_args()

    gen = SyntheticCrackGenerator(
        output_dir=args.output,
        num_images=args.num_images,
        imgsz=args.imgsz,
        crack_count=(args.crack_count[0], args.crack_count[1]),
        noise_level=args.noise_level,
        background=args.background,
        val_ratio=args.val_ratio,
        seed=args.seed,
    )
    train_count, val_count = gen.generate()
    print(f"\n{'═' * 50}")
    print(f"  ✅ Generated {train_count + val_count} images")
    print(f"  📁 Train: {train_count} images")
    print(f"  📁 Val:   {val_count} images")
    print(f"  📂 Output: {Path(args.output).resolve()}")
    print(f"{'═' * 50}")


if __name__ == "__main__":
    cli_main()

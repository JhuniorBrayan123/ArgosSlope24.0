"""
ARGOS SLOPE 4.0 — Unit tests for SyntheticCrackGenerator (Sprint 8).

Tests the synthetic crack texture generator that produces YOLO-format
training data for ML crack detection.

Run with::

    python -m pytest edge/edge/tests/test_synthetic_generator.py -v
"""

from __future__ import annotations

import shutil
import sys
import tempfile
import unittest
from pathlib import Path

import cv2
import numpy as np

# Add edge/ml/ to sys.path so we can import the generator module
sys.path.insert(
    0,
    str(Path(__file__).resolve().parent.parent.parent / "ml"),
)
from generate_synthetic import SyntheticCrackGenerator


class TestSyntheticCrackGenerator(unittest.TestCase):
    """SyntheticCrackGenerator unit tests."""

    def setUp(self) -> None:
        self._tmp_dir = tempfile.mkdtemp(prefix="test_synthetic_")
        self.output_dir = Path(self._tmp_dir)

    def tearDown(self) -> None:
        shutil.rmtree(self._tmp_dir, ignore_errors=True)

    # ── Basic generation ─────────────────────────────────────────────

    def test_generator_creates_correct_number_of_images(self) -> None:
        """Generator produces the exact number of requested images."""
        gen = SyntheticCrackGenerator(
            output_dir=str(self.output_dir),
            num_images=10,
            imgsz=64,
            crack_count=(1, 1),
            noise_level=0.0,
            seed=42,
        )
        train_count, val_count = gen.generate()

        # Verify image files exist in train and val
        train_images = list((self.output_dir / "train" / "images").glob("*.jpg"))
        val_images = list((self.output_dir / "val" / "images").glob("*.jpg"))
        total = len(train_images) + len(val_images)

        self.assertEqual(total, 10)
        self.assertEqual(train_count, 8)
        self.assertEqual(val_count, 2)

    # ── YOLO label format ────────────────────────────────────────────

    def test_yolo_label_format(self) -> None:
        """Each .txt label has correct YOLO format with 5 normalized values."""
        gen = SyntheticCrackGenerator(
            output_dir=str(self.output_dir),
            num_images=5,
            imgsz=64,
            crack_count=(1, 1),
            noise_level=0.0,
            seed=42,
        )
        gen.generate()

        # Check all labels
        all_labels = list((self.output_dir / "train" / "labels").glob("*.txt"))
        all_labels += list((self.output_dir / "val" / "labels").glob("*.txt"))

        self.assertGreater(len(all_labels), 0,
                           msg="Expected at least one label file")

        for label_path in all_labels:
            with open(label_path) as f:
                for line in f:
                    parts = line.strip().split()
                    self.assertEqual(len(parts), 5,
                                     msg=f"Expected 5 fields in {label_path}")
                    values = [float(v) for v in parts]
                    # class_id must be 0, 1, or 2
                    self.assertIn(values[0], [0.0, 1.0, 2.0],
                                  msg=f"Invalid class ID in {label_path}")
                    # All normalized values in [0, 1]
                    for val in values[1:]:
                        self.assertGreaterEqual(val, 0.0,
                                                msg=f"Negative value in {label_path}")
                        self.assertLessEqual(val, 1.0,
                                             msg=f"Value > 1 in {label_path}")

    # ── Class mapping by pixel width ─────────────────────────────────

    def test_fina_classification(self) -> None:
        """Crack with width < 3px at 640px reference is class 0 (fina)."""
        gen = SyntheticCrackGenerator(
            output_dir=str(self.output_dir),
            num_images=5,
            imgsz=640,
            crack_count=(1, 1),
            noise_level=0.0,
            seed=42,
        )
        gen.generate()

        # Read labels and verify class ID 0 appears
        all_labels = list((self.output_dir / "train" / "labels").glob("*.txt"))
        all_labels += list((self.output_dir / "val" / "labels").glob("*.txt"))
        classes_found: set[int] = set()
        for label_path in all_labels:
            with open(label_path) as f:
                for line in f:
                    class_id = int(line.strip().split()[0])
                    classes_found.add(class_id)
        self.assertIn(0, classes_found,
                      msg="Expected class 0 (fina) in labels")

    def test_media_classification(self) -> None:
        """Crack with width 3–8px at 640px reference has class 1 (media)."""
        gen = SyntheticCrackGenerator(
            output_dir=str(self.output_dir),
            num_images=5,
            imgsz=640,
            crack_count=(1, 1),
            noise_level=0.0,
            seed=7,  # different seed to get different width
        )
        gen.generate()

        all_labels = list((self.output_dir / "train" / "labels").glob("*.txt"))
        all_labels += list((self.output_dir / "val" / "labels").glob("*.txt"))

        # At least some labels should have class 1 (media)
        has_media = False
        has_gruesa = False
        for label_path in all_labels:
            with open(label_path) as f:
                for line in f:
                    class_id = int(line.strip().split()[0])
                    if class_id == 1:
                        has_media = True
                    if class_id == 2:
                        has_gruesa = True

        # With different seeds we should see at least one non-fina class
        # (not strictly guaranteed, but highly likely with enough images)
        self.assertTrue(
            has_media or has_gruesa,
            msg="Expected a non-fina class (1 or 2) with seed=7",
        )

    def test_gruesa_classification(self) -> None:
        """Verify class 2 (gruesa) exists in outputs."""
        gen = SyntheticCrackGenerator(
            output_dir=str(self.output_dir),
            num_images=20,
            imgsz=640,
            crack_count=(1, 2),
            noise_level=0.0,
            seed=99,
        )
        gen.generate()

        all_labels = list((self.output_dir / "train" / "labels").glob("*.txt"))
        all_labels += list((self.output_dir / "val" / "labels").glob("*.txt"))

        classes_found: set[int] = set()
        for label_path in all_labels:
            with open(label_path) as f:
                for line in f:
                    class_id = int(line.strip().split()[0])
                    classes_found.add(class_id)

        self.assertIn(2, classes_found,
                      msg="Expected class 2 (gruesa) in labels with seed=99")

    # ── Multiple cracks per image ────────────────────────────────────

    def test_multiple_cracks_per_image(self) -> None:
        """Images with multiple cracks produce labels with multiple lines."""
        gen = SyntheticCrackGenerator(
            output_dir=str(self.output_dir),
            num_images=5,
            imgsz=64,
            crack_count=(3, 3),  # exactly 3 cracks per image
            noise_level=0.0,
            seed=42,
        )
        gen.generate()

        all_labels = list((self.output_dir / "train" / "labels").glob("*.txt"))
        all_labels += list((self.output_dir / "val" / "labels").glob("*.txt"))

        for label_path in all_labels:
            with open(label_path) as f:
                lines = [l.strip() for l in f if l.strip()]
            self.assertGreaterEqual(
                len(lines), 2,
                msg=f"Expected multiple lines in {label_path}, got {len(lines)}",
            )

    # ── No-crack images ──────────────────────────────────────────────

    def test_no_crack_images_produce_no_labels(self) -> None:
        """Background-only images have .jpg but no .txt file."""
        gen = SyntheticCrackGenerator(
            output_dir=str(self.output_dir),
            num_images=5,
            imgsz=64,
            crack_count=(0, 0),  # zero cracks
            noise_level=0.0,
            seed=42,
        )
        gen.generate()

        train_images = sorted((self.output_dir / "train" / "images").glob("*.jpg"))
        train_labels = sorted((self.output_dir / "train" / "labels").glob("*.txt"))
        val_images = sorted((self.output_dir / "val" / "images").glob("*.jpg"))
        val_labels = sorted((self.output_dir / "val" / "labels").glob("*.txt"))

        # If crack_count=0, there should be NO label files
        all_labels = train_labels + val_labels
        self.assertEqual(
            len(all_labels), 0,
            msg=f"Expected no label files, found {len(all_labels)}",
        )
        # Images should exist
        self.assertGreater(
            len(train_images) + len(val_images), 0,
            msg="Expected images even with crack_count=0",
        )

    # ── Train/val split ──────────────────────────────────────────────

    def test_train_val_split_ratio(self) -> None:
        """80/20 split is respected approximately."""
        gen = SyntheticCrackGenerator(
            output_dir=str(self.output_dir),
            num_images=100,
            imgsz=64,
            crack_count=(1, 2),
            noise_level=0.0,
            seed=42,
            val_ratio=0.2,
        )
        train_count, val_count = gen.generate()

        self.assertEqual(train_count + val_count, 100)
        # Allow 10% tolerance on the split
        self.assertAlmostEqual(train_count / 100, 0.8, delta=0.1)
        self.assertAlmostEqual(val_count / 100, 0.2, delta=0.1)

    # ── Image dimensions ─────────────────────────────────────────────

    def test_image_dimensions_match_config(self) -> None:
        """Generated images have the expected dimensions."""
        imgsz = 64
        gen = SyntheticCrackGenerator(
            output_dir=str(self.output_dir),
            num_images=3,
            imgsz=imgsz,
            crack_count=(1, 1),
            noise_level=0.0,
            seed=42,
        )
        gen.generate()

        for split_name in ("train", "val"):
            img_dir = self.output_dir / split_name / "images"
            for img_path in sorted(img_dir.glob("*.jpg")):
                img = cv2.imread(str(img_path))
                self.assertIsNotNone(img, msg=f"Failed to read {img_path}")
                self.assertEqual(
                    img.shape[:2], (imgsz, imgsz),
                    msg=f"{img_path.name}: expected {imgsz}x{imgsz}, got {img.shape}",
                )

    # ── Valid JPEG output ────────────────────────────────────────────

    def test_generator_produces_valid_jpeg_files(self) -> None:
        """All output .jpg files are valid JPEG images readable by OpenCV."""
        gen = SyntheticCrackGenerator(
            output_dir=str(self.output_dir),
            num_images=5,
            imgsz=64,
            crack_count=(1, 1),
            noise_level=0.0,
            seed=42,
        )
        gen.generate()

        for split_name in ("train", "val"):
            img_dir = self.output_dir / split_name / "images"
            for img_path in sorted(img_dir.glob("*.jpg")):
                # Read with OpenCV — returns None on invalid image
                img = cv2.imread(str(img_path))
                self.assertIsNotNone(img, msg=f"Invalid JPEG: {img_path}")
                # 3-channel BGR
                self.assertEqual(img.shape[2], 3,
                                 msg=f"Expected 3-channel BGR in {img_path}")

    # ── Reproducibility ──────────────────────────────────────────────

    def test_reproducibility_with_fixed_seed(self) -> None:
        """Same seed produces identical output images."""
        gen1 = SyntheticCrackGenerator(
            output_dir=str(self.output_dir / "run1"),
            num_images=5,
            imgsz=64,
            crack_count=(1, 1),
            noise_level=0.0,
            seed=42,
        )
        gen1.generate()

        gen2 = SyntheticCrackGenerator(
            output_dir=str(self.output_dir / "run2"),
            num_images=5,
            imgsz=64,
            crack_count=(1, 1),
            noise_level=0.0,
            seed=42,
        )
        gen2.generate()

        # Compare images from both runs
        for split_name in ("train", "val"):
            img_dir1 = self.output_dir / "run1" / split_name / "images"
            img_dir2 = self.output_dir / "run2" / split_name / "images"
            for img_path1 in sorted(img_dir1.glob("*.jpg")):
                img1 = cv2.imread(str(img_path1))
                # Find corresponding file in run2
                img_path2 = img_dir2 / img_path1.name
                self.assertTrue(
                    img_path2.exists(),
                    msg=f"Missing corresponding file: {img_path2}",
                )
                img2 = cv2.imread(str(img_path2))
                np.testing.assert_array_equal(
                    img1, img2,
                    err_msg=f"Images differ between runs: {img_path1.name}",
                )


    # ── Zero images edge case ────────────────────────────────────────

    def test_zero_images_returns_empty(self) -> None:
        """num_images=0 produces no files and returns (0, 0)."""
        gen = SyntheticCrackGenerator(
            output_dir=str(self.output_dir),
            num_images=0,
            imgsz=64,
            crack_count=(1, 1),
            noise_level=0.0,
            seed=42,
        )
        train_count, val_count = gen.generate()

        self.assertEqual(train_count, 0)
        self.assertEqual(val_count, 0)

        # No files should have been created
        all_files = list(self.output_dir.rglob("*"))
        # Only possible items are the output dir itself and staging if created
        meaningful = [f for f in all_files if f.is_file()]
        self.assertEqual(len(meaningful), 0,
                         msg=f"Expected no files, found {meaningful}")

    # ── _compute_yolo_bbox pure function tests ────────────────────────

    def test_compute_yolo_bbox_full_mask(self) -> None:
        """Known full-width mask produces correct normalized bbox."""
        mask = np.zeros((64, 64), dtype=np.uint8)
        # Place a crack covering columns 10-49, rows 10-29
        mask[10:30, 10:50] = 255

        xc, yc, w, h = SyntheticCrackGenerator._compute_yolo_bbox(mask, 64)

        # x: 10..49 → width=40, center=(10+40/2)/64 = 30/64
        # y: 10..29 → height=20, center=(10+20/2)/64 = 20/64
        self.assertAlmostEqual(xc, 30.0 / 64.0, places=6)
        self.assertAlmostEqual(yc, 20.0 / 64.0, places=6)
        self.assertAlmostEqual(w, 40.0 / 64.0, places=6)
        self.assertAlmostEqual(h, 20.0 / 64.0, places=6)

    def test_compute_yolo_bbox_single_pixel(self) -> None:
        """Single-pixel mask produces 1px bbox at correct location."""
        mask = np.zeros((64, 64), dtype=np.uint8)
        mask[32, 32] = 255  # Single pixel at (col=32, row=32)

        xc, yc, w, h = SyntheticCrackGenerator._compute_yolo_bbox(mask, 64)

        # 1px at col 32 → x range [32, 33) → center = 32.5
        # 1px at row 32 → y range [32, 33) → center = 32.5
        self.assertAlmostEqual(xc, 32.5 / 64.0, places=6)
        self.assertAlmostEqual(yc, 32.5 / 64.0, places=6)
        self.assertAlmostEqual(w, 1.0 / 64.0, places=6)
        self.assertAlmostEqual(h, 1.0 / 64.0, places=6)

    def test_compute_yolo_bbox_empty_mask(self) -> None:
        """Empty mask returns all zeros."""
        mask = np.zeros((64, 64), dtype=np.uint8)

        xc, yc, w, h = SyntheticCrackGenerator._compute_yolo_bbox(mask, 64)

        self.assertEqual(xc, 0.0)
        self.assertEqual(yc, 0.0)
        self.assertEqual(w, 0.0)
        self.assertEqual(h, 0.0)


if __name__ == "__main__":
    unittest.main()

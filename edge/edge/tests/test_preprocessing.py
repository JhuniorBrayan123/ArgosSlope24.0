"""
ARGOS SLOPE 4.0 — Unit tests for the EdgePreprocessor.

Tests synthetic images (no real camera required).
Run with::

    python -m pytest edge/edge/tests/test_preprocessing.py -v
"""

from __future__ import annotations

import unittest
from dataclasses import dataclass
from typing import Any

import cv2
import numpy as np

from edge.preprocessing.preprocessor import EdgePreprocessor


@dataclass
class FakeConfig:
    """Minimal config stub that satisfies EdgePreprocessor's needs."""

    preprocessing_enabled: bool = True
    preprocessing_steps: str = '["undistort","clahe"]'
    clahe_clip_limit: float = 2.0
    clahe_tile_grid_size: int = 8
    # Not used by preprocessor but required by EdgeConfig type hint
    geometric_filtering_enabled: bool = False
    filter_min_aspect_ratio: float = 0.1
    filter_max_aspect_ratio: float = 10.0
    filter_min_solidity: float = 0.2
    filter_min_convexity: float = 0.5
    filter_min_length_mm: float = 10.0
    filter_min_width_mm: float = 0.5
    filter_min_length_px: int = 30
    filter_min_width_px: int = 3
    debug_save_frames: bool = False
    debug_output_dir: str = "debug_output"


class TestPreprocessorDefaultPipeline(unittest.TestCase):
    """Test that the preprocessor builds a correct default pipeline."""

    def setUp(self) -> None:
        self.config = FakeConfig()
        self.preprocessor = EdgePreprocessor(self.config)  # type: ignore[arg-type]

    def test_pipeline_description_includes_undistort(self) -> None:
        """Default pipeline should include ``undistort``."""
        desc = self.preprocessor.pipeline_description
        self.assertIn("undistort", desc)

    def test_pipeline_description_includes_clahe(self) -> None:
        """Default pipeline should include ``clahe``."""
        desc = self.preprocessor.pipeline_description
        self.assertIn("clahe", desc)

    def test_pipeline_description_ordering(self) -> None:
        """Default steps should be in order: undistort → clahe."""
        self.assertEqual(
            self.preprocessor.pipeline_description,
            "undistort → clahe",
        )


class TestPreprocessorEmptySteps(unittest.TestCase):
    """Test behaviour when PREPROCESSING_STEPS is empty."""

    def test_empty_steps_returns_image_unchanged(self) -> None:
        """With no steps, ``process()`` must return a copy of the input."""
        config = FakeConfig()
        config.preprocessing_steps = "[]"
        preprocessor = EdgePreprocessor(config)  # type: ignore[arg-type]

        image = np.random.randint(0, 256, (100, 200, 3), dtype=np.uint8)
        result = preprocessor.process(image)

        np.testing.assert_array_equal(result, image)

    def test_pipeline_description_passthrough(self) -> None:
        """Empty pipeline should report ``<passthrough>``."""
        config = FakeConfig()
        config.preprocessing_steps = "[]"
        preprocessor = EdgePreprocessor(config)  # type: ignore[arg-type]
        self.assertEqual(preprocessor.pipeline_description, "<passthrough>")


class TestPreprocessorClaheGray(unittest.TestCase):
    """CLAHE on grayscale images should preserve shape and dtype."""

    def setUp(self) -> None:
        config = FakeConfig()
        config.preprocessing_steps = '["clahe"]'
        self.preprocessor = EdgePreprocessor(config)  # type: ignore[arg-type]
        self.input_shape = (120, 160)
        self.image = np.random.randint(
            0, 256, self.input_shape, dtype=np.uint8
        )

    def test_clahe_gray_preserves_shape(self) -> None:
        """CLAHE output should have the same shape as input."""
        result = self.preprocessor.process(self.image)
        self.assertEqual(result.shape, self.input_shape)

    def test_clahe_gray_preserves_dtype(self) -> None:
        """CLAHE output should have uint8 dtype."""
        result = self.preprocessor.process(self.image)
        self.assertEqual(result.dtype, np.uint8)

    def test_clahe_gray_enhances_contrast(self) -> None:
        """CLAHE should increase the standard deviation of pixel values."""
        result = self.preprocessor.process(self.image)
        original_std = float(self.image.std())
        result_std = float(result.std())
        # CLAHE typically increases contrast → higher std dev
        self.assertGreaterEqual(result_std, original_std * 0.5)


class TestPreprocessorClaheColor(unittest.TestCase):
    """CLAHE on colour images should preserve 3 channels."""

    def setUp(self) -> None:
        config = FakeConfig()
        config.preprocessing_steps = '["clahe"]'
        self.preprocessor = EdgePreprocessor(config)  # type: ignore[arg-type]
        self.input_shape = (100, 160, 3)
        self.image = np.random.randint(
            0, 256, self.input_shape, dtype=np.uint8
        )

    def test_clahe_color_preserves_three_channels(self) -> None:
        """CLAHE on BGR should return a 3-channel image."""
        result = self.preprocessor.process(self.image)
        self.assertEqual(result.shape[2], 3)

    def test_clahe_color_preserves_dtype(self) -> None:
        """CLAHE on BGR should preserve uint8."""
        result = self.preprocessor.process(self.image)
        self.assertEqual(result.dtype, np.uint8)

    def test_clahe_color_preserves_shape(self) -> None:
        """CLAHE on BGR should preserve spatial dimensions."""
        result = self.preprocessor.process(self.image)
        self.assertEqual(result.shape, self.input_shape)


if __name__ == "__main__":
    unittest.main()

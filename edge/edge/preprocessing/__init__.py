"""
ARGOS SLOPE 4.0 — Image preprocessing module.

Provides configurable preprocessing pipeline for rock-face images:
- Lens undistortion via camera calibration data
- CLAHE contrast enhancement
"""

from edge.edge.preprocessing.preprocessor import EdgePreprocessor

__all__ = ["EdgePreprocessor"]

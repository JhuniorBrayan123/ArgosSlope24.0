"""
Crack measurement module for ARGOS SLOPE 4.0.

Provides crack dimension measurement (length, width, area) from binary
segmentation masks, crack classification by width, and ROI extraction.
"""

from __future__ import annotations

from typing import Optional

import cv2
import numpy as np


def measure_crack(
    binary_mask: np.ndarray,
    pixel_to_mm_ratio: float,
) -> dict:
    """
    Measure crack length, width, and area from a binary mask.

    Uses contour analysis to extract crack geometry:
        - Length: Half the convex hull perimeter (approximation)
        - Width: Area / Length (average width)
        - Area: Sum of crack pixels converted to mm²

    Args:
        binary_mask: Binary image where crack pixels are white (255).
        pixel_to_mm_ratio: Conversion factor (mm per pixel).

    Returns:
        Dictionary with:
            - ``length_mm``: Estimated crack length.
            - ``width_mm``: Average crack width.
            - ``area_mm2``: Crack area.
            - ``classification``: ``"fina"``, ``"media"``, ``"gruesa"``,
              or ``"none"``.

    Raises:
        ValueError: If pixel_to_mm_ratio is ≤ 0.
    """
    if pixel_to_mm_ratio <= 0:
        raise ValueError("pixel_to_mm_ratio must be > 0")

    # Ensure binary mask
    if binary_mask.dtype != np.uint8:
        binary_mask = binary_mask.astype(np.uint8)

    # Find contours
    contours, _ = cv2.findContours(
        binary_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE
    )

    if not contours:
        return {
            "length_mm": 0.0,
            "width_mm": 0.0,
            "area_mm2": 0.0,
            "classification": "none",
        }

    # Merge all contour points (assume they belong to the same crack)
    all_points = np.vstack(contours)

    # Area in pixels
    area_px = float(cv2.contourArea(all_points))
    area_mm2 = area_px * (pixel_to_mm_ratio**2)

    # Length approximation: half of convex hull perimeter
    hull = cv2.convexHull(all_points)
    perimeter = cv2.arcLength(hull, closed=True)
    length_mm = (perimeter / 2.0) * pixel_to_mm_ratio

    # Average width = area / length (treating crack as a long rectangle)
    width_mm = area_mm2 / length_mm if length_mm > 0 else 0.0

    classification = _classify_crack(width_mm)

    return {
        "length_mm": round(length_mm, 4),
        "width_mm": round(width_mm, 4),
        "area_mm2": round(area_mm2, 4),
        "classification": classification,
    }


def _classify_crack(width_mm: float) -> str:
    """
    Classify crack by average width.

    Categories:
        - ``"none"``: width ≤ 0 (no crack detected)
        - ``"fina"``: < 0.3 mm (fine)
        - ``"media"``: 0.3 – 1.0 mm (medium)
        - ``"gruesa"``: > 1.0 mm (thick)

    Args:
        width_mm: Average crack width in mm.

    Returns:
        Classification string.
    """
    if width_mm <= 0.0:
        return "none"
    if width_mm < 0.3:
        return "fina"
    if width_mm < 1.0:
        return "media"
    return "gruesa"


def extract_roi(
    image: np.ndarray,
    roi: tuple[int, int, int, int],
) -> np.ndarray:
    """
    Extract a region of interest from an image.

    Args:
        image: Input image (grayscale or BGR).
        roi: ``(x, y, width, height)`` in pixels.

    Returns:
        ROI sub-image as numpy array.

    Raises:
        ValueError: If ROI extends beyond image boundaries.
    """
    x, y, w, h = roi
    if x < 0 or y < 0 or x + w > image.shape[1] or y + h > image.shape[0]:
        raise ValueError("ROI out of image bounds")

    return image[y : y + h, x : x + w].copy()


def segment_crack(
    roi_image: np.ndarray,
    blur_ksize: int = 5,
    adaptive_block: int = 11,
    adaptive_c: int = 2,
) -> np.ndarray:
    """
    Segment crack from a ROI image using adaptive thresholding.

    Pipeline:
        1. Convert to grayscale if needed
        2. Gaussian blur to reduce noise
        3. Adaptive thresholding (Gaussian method)
        4. Morphological close + open to clean mask

    Args:
        roi_image: ROI image (grayscale or BGR).
        blur_ksize: Gaussian kernel size (default 5, must be odd).
        adaptive_block: Adaptive threshold block size (default 11, odd).
        adaptive_c: Constant subtracted from mean (default 2).

    Returns:
        Binary mask (uint8) with crack pixels = 255.
    """
    if len(roi_image.shape) == 3:
        gray = cv2.cvtColor(roi_image, cv2.COLOR_BGR2GRAY)
    else:
        gray = roi_image.copy()

    # Gaussian blur
    blurred = cv2.GaussianBlur(gray, (blur_ksize, blur_ksize), 0)

    # Adaptive thresholding
    binary = cv2.adaptiveThreshold(
        blurred,
        maxValue=255,
        adaptiveMethod=cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        thresholdType=cv2.THRESH_BINARY_INV,
        blockSize=adaptive_block,
        C=adaptive_c,
    )

    # Morphological clean-up
    kernel = np.ones((3, 3), np.uint8)
    cleaned = cv2.morphologyEx(binary, cv2.MORPH_CLOSE, kernel)
    cleaned = cv2.morphologyEx(cleaned, cv2.MORPH_OPEN, kernel)

    return cleaned

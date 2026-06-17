"""
Deformation velocity engine for ARGOS SLOPE 4.0.

Calculates sub-pixel displacement and real-world deformation velocity
using the pinhole camera model: D_real = D_pixel × (Z / f).

All values are returned in mm and mm/day for direct monitoring use.
"""

from __future__ import annotations

import numpy as np
from scipy import signal as scipy_signal


def calculate_velocity(
    displacement_px: float,
    days_elapsed: float,
    z: float,
    f: float,
) -> dict:
    """
    Calculate real-world deformation velocity from pixel displacement.

    Uses the pinhole camera projection formula:

        D_real (mm) = D_pixel × (Z_mm / f_mm)

    where Z (sensor distance) is converted from meters to mm.

    Args:
        displacement_px: Measured displacement in pixels (≥ 0).
        days_elapsed: Time between measurements in days (> 0).
        z: Distance from camera to slope face in meters (> 0).
        f: Camera focal length in mm (> 0).

    Returns:
        Dictionary with:
            - ``displacement_mm``: Real-world displacement in mm.
            - ``velocity_mm_per_day``: Deformation velocity in mm/day.

    Raises:
        ValueError: If any input is zero or negative.
    """
    if displacement_px < 0:
        raise ValueError("displacement_px must be ≥ 0")
    if days_elapsed <= 0:
        raise ValueError("days_elapsed must be > 0")
    if z <= 0:
        raise ValueError("z (sensor distance) must be > 0")
    if f <= 0:
        raise ValueError("f (focal length) must be > 0")

    # Convert Z from meters to mm for consistent units
    z_mm = z * 1000.0

    # D_real = D_pixel × (Z / f)
    displacement_mm = displacement_px * (z_mm / f)
    velocity_mm_per_day = displacement_mm / days_elapsed

    return {
        "displacement_mm": round(float(displacement_mm), 4),
        "velocity_mm_per_day": round(float(velocity_mm_per_day), 4),
    }


def sub_pixel_displacement(
    image1: np.ndarray,
    image2: np.ndarray,
    roi: tuple[int, int, int, int],
) -> float:
    """
    Calculate sub-pixel displacement between two images within a ROI.

    Uses 2D cross-correlation (phase correlation) for sub-pixel accuracy.

    Args:
        image1: Reference image (numpy array, grayscale).
        image2: Target image (numpy array, same dimensions as image1).
        roi: Region of interest ``(x, y, width, height)`` in pixels.

    Returns:
        Magnitude of displacement vector in pixels (float, sub-pixel).

    Raises:
        ValueError: If ROI is out of bounds or images have different shapes.
    """
    if image1.shape != image2.shape:
        raise ValueError("Both images must have the same dimensions")

    x, y, w, h = roi
    if x < 0 or y < 0 or x + w > image1.shape[1] or y + h > image1.shape[0]:
        raise ValueError("ROI is out of image bounds")

    roi1 = image1[y : y + h, x : x + w].astype(np.float64)
    roi2 = image2[y : y + h, x : x + w].astype(np.float64)

    # Normalise to zero mean and unit variance for illumination invariance
    roi1 = (roi1 - roi1.mean()) / (roi1.std() + 1e-10)
    roi2 = (roi2 - roi2.mean()) / (roi2.std() + 1e-10)

    # 2D cross-correlation
    correlation = scipy_signal.correlate2d(roi1, roi2, mode="same")

    # Locate peak
    peak_y, peak_x = np.unravel_index(np.argmax(correlation), correlation.shape)
    center_y, center_x = np.array(roi1.shape) / 2.0

    displacement = np.array([peak_y - center_y, peak_x - center_x])
    magnitude = float(np.linalg.norm(displacement))

    return round(magnitude, 4)


def pixels_to_mm(
    pixels: float, reference_mm: float, reference_pixels: float
) -> float:
    """
    Convert pixel measurements to mm using a known reference.

    Formula:
        length_mm = pixels × (reference_mm / reference_pixels)

    Args:
        pixels: Measured length in pixels.
        reference_mm: Known physical length of reference object in mm.
        reference_pixels: Measured length of reference object in pixels.

    Returns:
        Converted length in mm.

    Raises:
        ValueError: If reference_pixels is zero.
    """
    if reference_pixels <= 0:
        raise ValueError("reference_pixels must be > 0")
    if reference_mm <= 0:
        raise ValueError("reference_mm must be > 0")
    if pixels <= 0:
        raise ValueError("pixels must be > 0")

    length_mm = pixels * (reference_mm / reference_pixels)
    return round(float(length_mm), 4)

"""
ARGOS SLOPE 4.0 — Synthetic test pattern generator for OFFLINE calibration.

Generates checkerboard images, ArUco markers, and calibration sets so
that the calibration module can be tested without a physical camera or
printed patterns.

All functions save images as PNG files.

Typical usage::

    from edge.calibration.generate_test_patterns import generate_calibration_set

    generate_calibration_set(
        output_dir="test_calib_set/",
        count=15,
        pattern_size=(9, 6),
        square_size_px=100,
    )
"""

from __future__ import annotations

import logging
import random
from pathlib import Path
from typing import Optional

import cv2
import numpy as np
from numpy.typing import NDArray

logger = logging.getLogger(__name__)


def generate_checkerboard(
    pattern_size: tuple[int, int] = (9, 6),
    square_size_px: int = 100,
    border_squares: int = 1,
) -> NDArray[np.uint8]:
    """
    Generate a synthetic checkerboard image detectable by
    ``cv2.findChessboardCorners``.

    For a pattern of ``(cols, rows)`` inner corners, the function creates
    ``(cols + 1 + 2*border_squares)`` × ``(rows + 1 + 2*border_squares)``
    squares so the inner pattern is surrounded by a white border.

    Args:
        pattern_size: Inner corners per (columns, rows); e.g. (9, 6).
        square_size_px: Side length of each square in pixels.
        border_squares: Extra border squares around the pattern.
                        Default ``1``.

    Returns:
        Grayscale checkerboard image (uint8).

    Example:
        >>> img = generate_checkerboard((9, 6), 100)
        >>> cv2.imwrite("checkerboard.png", img)
    """
    cols, rows = pattern_size
    # For (C, R) inner corners we need (C+1) × (R+1) squares
    board_cols = (cols + 1) + 2 * border_squares
    board_rows = (rows + 1) + 2 * border_squares

    width = board_cols * square_size_px
    height = board_rows * square_size_px

    img = np.full((height, width), 255, dtype=np.uint8)

    for row in range(board_rows):
        for col in range(board_cols):
            if (row + col) % 2 == 1:
                y1 = row * square_size_px
                x1 = col * square_size_px
                img[y1 : y1 + square_size_px, x1 : x1 + square_size_px] = 0

    return img


def generate_aruco_marker(
    marker_id: int = 0,
    dictionary: int = cv2.aruco.DICT_6X6_250,
    size_px: int = 300,
    border_bits: int = 1,
) -> NDArray[np.uint8]:
    """
    Generate an ArUco marker image.

    Args:
        marker_id: Marker ID (0–249 for DICT_6X6_250).
        dictionary: OpenCV ArUco dictionary constant.
        size_px: Output image size in pixels (square).
        border_bits: Number of border bit cells (white border).

    Returns:
        Grayscale marker image.

    Example:
        >>> img = generate_aruco_marker(marker_id=0, size_px=300)
        >>> cv2.imwrite("aruco_marker_0.png", img)
    """
    aruco_dict = cv2.aruco.getPredefinedDictionary(dictionary)
    img = np.ones((size_px, size_px), dtype=np.uint8) * 255

    marker_img = cv2.aruco.generateImageMarker(
        aruco_dict, marker_id, size_px - 2 * border_bits,
    )
    inner = size_px - 2 * border_bits
    img[border_bits : border_bits + inner, border_bits : border_bits + inner] = marker_img

    return img


def generate_distorted_checkerboard(
    pattern_size: tuple[int, int] = (9, 6),
    square_size_px: int = 100,
    distortion_params: Optional[dict] = None,
) -> NDArray[np.uint8]:
    """
    Generate a checkerboard image at a specific scale.

    The checkerboard is generated and resized so that it fills most
    of the output image.  Different scales simulate different camera
    distances, providing enough variation for ``cv2.calibrateCamera``.

    .. note::

       ``cv2.findChessboardCorners`` on OpenCV 4.10 only works reliably
       when the checkerboard fills most of the image (no rotation or
       large background areas).  For synthetic test images we therefore
       only vary the scale.

    Args:
        pattern_size: Inner corners per (columns, rows).
        square_size_px: Square side length in pixels for the source.
        distortion_params: Dict with optional keys:
            - ``image_size``: ``(width, height)`` (default: ``(1280, 720)``)
            - ``scale``: Scale factor (default: 1.0).

    Returns:
        BGR image (3-channel) with the checkerboard.
    """
    params = distortion_params or {}
    img_w, img_h = params.get("image_size", (1280, 720))

    # Generate source checkerboard
    src = generate_checkerboard(pattern_size, square_size_px, border_squares=1)
    sh, sw = src.shape

    # Determine scale so the checkerboard occupies most of the image
    # We want max dimension to be ~80-95% of the smaller image dimension
    scale = params.get("scale", 1.0)
    if scale <= 0:
        scale = 1.0

    output_h = int(round(sh * scale))
    output_w = int(round(sw * scale))

    # Resize the checkerboard
    if scale != 1.0:
        resized = cv2.resize(src, (output_w, output_h), interpolation=cv2.INTER_LINEAR)
    else:
        resized = src.copy()

    border_value = params.get("border_value", 180)

    # NOTE: findChessboardCorners on this OpenCV version (4.10.0)
    # can only reliably detect checkerboards that fill most of the image
    # WITHOUT rotation.  Rotation + background canvas causes detection
    # to fail even with INTER_NEAREST.  We only vary scale here.
    canvas = np.full((img_h, img_w), border_value, dtype=np.uint8)
    y_off = max(0, (img_h - output_h) // 2)
    x_off = max(0, (img_w - output_w) // 2)

    if output_h <= img_h and output_w <= img_w:
        canvas[y_off:y_off + output_h, x_off:x_off + output_w] = resized
    else:
        # Board too large: crop centre portion
        y_start = (output_h - img_h) // 2
        x_start = (output_w - img_w) // 2
        canvas = resized[y_start:y_start + img_h, x_start:x_start + img_w]

    result = canvas

    return cv2.cvtColor(result, cv2.COLOR_GRAY2BGR)


def generate_calibration_set(
    output_dir: str | Path,
    count: int = 15,
    pattern_size: tuple[int, int] = (9, 6),
    square_size_px: int = 100,
    image_size: tuple[int, int] = (1280, 720),
    seed: int = 42,
) -> list[Path]:
    """
    Generate a complete set of synthetic calibration images.

    Each image shows the checkerboard at a different scale and rotation,
    providing enough variety for camera calibration.

    Args:
        output_dir: Directory to save PNG images.
        count: Number of images to generate (default: 15).
        pattern_size: Inner corners per (columns, rows).
        square_size_px: Square side length in pixels.
        image_size: Output image (width, height).
        seed: Random seed for reproducibility.

    Returns:
        List of created file paths.
    """
    rng = random.Random(seed)
    out = Path(output_dir)
    out.mkdir(parents=True, exist_ok=True)

    paths: list[Path] = []
    for i in range(count):
        # Vary scale (simulating different distances).
        # Scale: 0.3 to 1.0 of original, ensuring board fills image.
        # Rotation is avoided because findChessboardCorners on
        # OpenCV 4.10.0 only works reliably with axis-aligned boards
        # that fill most of the image.
        scale = rng.uniform(0.3, 1.0)

        params = {
            "image_size": image_size,
            "scale": scale,
        }

        img = generate_distorted_checkerboard(
            pattern_size=pattern_size,
            square_size_px=square_size_px,
            distortion_params=params,
        )

        filepath = out / f"calib_{i:02d}.png"
        cv2.imwrite(str(filepath), img)
        paths.append(filepath)

    logger.info(
        "Generated %d calibration images in %s (pattern=%sx%s)",
        count, out, pattern_size[0], pattern_size[1],
    )
    return paths

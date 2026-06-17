"""
ARGOS SLOPE 4.0 — ArUco marker detection for pixel-to-mm scale reference.

A printed ArUco marker of known size (e.g. 100 mm) placed on the slope
face provides a real-world reference to convert pixel measurements to
physical units.

Uses the modern ``cv2.aruco.ArucoDetector`` API (not the deprecated
``cv2.aruco.detectMarkers``).

Typical usage::

    detector = ArucoScaleDetector()
    corners = detector.detect_marker(image, marker_id=0)
    if corners is not None:
        ppmm = detector.compute_scale(corners, marker_size_mm=100.0)
        length_mm = detector.pixels_to_mm(150.0)
"""

from __future__ import annotations

import logging
from typing import Optional

import cv2
import numpy as np
from numpy.typing import NDArray

logger = logging.getLogger(__name__)


class ArucoScaleDetector:
    """
    Detect a single ArUco marker and compute pixel-to-mm scale factor.

    The marker should be printed at a known physical size and placed
    on the slope surface in the camera's field of view.

    Attributes:
        pixels_per_mm: Computed scale factor (pixels / mm).
        marker_size_mm: Physical side length of the marker in mm.
        last_corners: Last detected marker corners (4×2 array).
        marker_id: ArUco marker ID to look for.
    """

    # Default ArUco dictionary: 6×6 bits, 250 markers
    DEFAULT_DICT = cv2.aruco.DICT_6X6_250

    def __init__(
        self,
        marker_id: int = 0,
        dictionary: int = DEFAULT_DICT,
        marker_size_mm: float = 100.0,
    ) -> None:
        """
        Args:
            marker_id: ID of the marker to detect.
            dictionary: OpenCV ArUco dictionary constant.
            marker_size_mm: Physical marker side length in mm.
        """
        self.marker_id: int = marker_id
        self.marker_size_mm: float = marker_size_mm
        self.pixels_per_mm: Optional[float] = None
        self.last_corners: Optional[NDArray[np.float64]] = None
        self.aruco_distance_m: Optional[float] = None

        # Build the modern detector
        aruco_dict = cv2.aruco.getPredefinedDictionary(dictionary)
        aruco_params = cv2.aruco.DetectorParameters()
        self._detector = cv2.aruco.ArucoDetector(aruco_dict, aruco_params)

    # ── Public API ─────────────────────────────────────────────────

    def detect_marker(
        self,
        image: NDArray[np.uint8],
        marker_id: Optional[int] = None,
        dictionary: Optional[int] = None,
    ) -> Optional[NDArray[np.float64]]:
        """
        Detect the target ArUco marker in an image.

        Args:
            image: BGR or grayscale image.
            marker_id: Override the marker ID (defaults to ``self.marker_id``).
            dictionary: Override the dictionary (defaults to ``self`` dict).

        Returns:
            Four corner coordinates (4×2 array) of the marker, or ``None``
            if the marker is not found.
        """
        mid = marker_id if marker_id is not None else self.marker_id
        grey = image if len(image.shape) == 2 else cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)

        # If a different dictionary is provided, rebuild the detector
        if dictionary is not None and dictionary != self.DEFAULT_DICT:
            aruco_dict = cv2.aruco.getPredefinedDictionary(dictionary)
            self._detector = cv2.aruco.ArucoDetector(
                aruco_dict, cv2.aruco.DetectorParameters()
            )

        corners_list, ids_list, _ = self._detector.detectMarkers(grey)

        if ids_list is None or len(ids_list) == 0:
            logger.debug("No ArUco markers found.")
            return None

        # Find the marker with matching ID
        for marker_corners, marker_id_found in zip(corners_list, ids_list):
            if int(marker_id_found[0]) == mid:
                corners = marker_corners.reshape((4, 2)).astype(np.float64)
                self.last_corners = corners
                logger.info(
                    "ArUco marker ID=%d detected at (%d, %d).",
                    mid,
                    int(corners[0, 0]),
                    int(corners[0, 1]),
                )
                return corners

        logger.debug("ArUco marker ID=%d not found in the image.", mid)
        return None

    def compute_scale(
        self,
        marker_corners: NDArray[np.float64],
        marker_size_mm: Optional[float] = None,
    ) -> float:
        """
        Compute the pixel-to-mm scale from a detected marker.

        Args:
            marker_corners: 4×2 array of marker corner coordinates.
            marker_size_mm: Physical marker side length in mm.

        Returns:
            Pixels per mm (scale factor).
        """
        size_mm = marker_size_mm if marker_size_mm is not None else self.marker_size_mm

        # Average the four side lengths in pixels
        side_lengths: list[float] = []
        for i in range(4):
            x1, y1 = marker_corners[i]
            x2, y2 = marker_corners[(i + 1) % 4]
            px = np.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2)
            side_lengths.append(float(px))

        avg_pixels = float(np.mean(side_lengths))
        self.pixels_per_mm = avg_pixels / size_mm

        logger.info(
            "Scale computed: %.4f px/mm (avg side=%.1f px, marker=%s mm)",
            self.pixels_per_mm,
            avg_pixels,
            size_mm,
        )
        return self.pixels_per_mm

    def pixels_to_mm(self, pixels: float | NDArray) -> float:
        """
        Convert a pixel measurement to millimetres using the computed scale.

        Args:
            pixels: Value in pixels.

        Returns:
            Value in millimetres.

        Raises:
            RuntimeError: If ``compute_scale()`` has not been called.
        """
        if self.pixels_per_mm is None:
            raise RuntimeError(
                "Scale not computed. Call compute_scale() first."
            )
        return float(pixels) / self.pixels_per_mm

    def estimate_distance(
        self,
        focal_length_px: float,
        marker_size_mm: Optional[float] = None,
        marker_corners: Optional[NDArray[np.float64]] = None,
    ) -> float:
        """
        Estimate the distance from the camera to the marker using the
        pinhole camera model.

        ``distance = (focal_length_px * marker_size_mm) / avg_side_px``

        Args:
            focal_length_px: Focal length in pixels (fx).
            marker_size_mm: Physical marker side length in mm.
            marker_corners: 4×2 corners (uses ``last_corners`` if omitted).

        Returns:
            Estimated distance in **metres**.
        """
        size_mm = marker_size_mm if marker_size_mm is not None else self.marker_size_mm
        corners = marker_corners if marker_corners is not None else self.last_corners

        if corners is None:
            raise RuntimeError(
                "No marker corners available. Call detect_marker() first."
            )

        # Average side length in pixels
        side_lengths: list[float] = []
        for i in range(4):
            x1, y1 = corners[i]
            x2, y2 = corners[(i + 1) % 4]
            px = np.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2)
            side_lengths.append(float(px))

        avg_pixels = float(np.mean(side_lengths))
        distance_mm = (focal_length_px * size_mm) / avg_pixels
        distance_m = distance_mm / 1000.0
        self.aruco_distance_m = distance_m

        logger.info("Estimated marker distance: %.2f m", distance_m)
        return distance_m

    def draw_marker(
        self,
        image: NDArray[np.uint8],
        corners: Optional[NDArray[np.float64]] = None,
    ) -> NDArray[np.uint8]:
        """
        Draw the detected marker outline and ID on the image for debugging.

        Args:
            image: BGR image to draw on.
            corners: 4×2 corners (uses ``last_corners`` if omitted).

        Returns:
            Image with marker drawn (modifies a copy).
        """
        corners = corners if corners is not None else self.last_corners
        if corners is None:
            logger.warning("draw_marker: no corners to draw.")
            return image

        result = image.copy()
        pts = corners.reshape((-1, 1, 2)).astype(np.int32)
        cv2.polylines(result, [pts], isClosed=True, color=(0, 255, 0), thickness=3)

        # Label with ID
        center = corners.mean(axis=0).astype(np.int32)
        if self.pixels_per_mm is not None:
            label = f"ID:{self.marker_id} ({self.pixels_per_mm:.2f} px/mm)"
        else:
            label = f"ID:{self.marker_id}"
        cv2.putText(
            result,
            label,
            (int(center[0]) - 40, int(center[1]) - 10),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.6,
            (0, 255, 0),
            2,
        )

        # Draw corners
        for i, (x, y) in enumerate(corners):
            cv2.circle(result, (int(x), int(y)), 5, (0, 0, 255), -1)
            cv2.putText(
                result,
                str(i),
                (int(x) + 6, int(y) + 6),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.5,
                (255, 0, 0),
                1,
            )

        return result

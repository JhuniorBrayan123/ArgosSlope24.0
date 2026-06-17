"""
ARGOS SLOPE 4.0 — Point Cloud Generator.

Converts an RGB frame + depth map into a 3D point cloud in camera space.

Each pixel (u, v) with depth d is projected to camera coordinates:

    z = d                          (depth along camera axis)
    x = (u - cx) * d / fx
    y = (v - cy) * d / fy

Points are sampled every N-th pixel (configurable via ``pointcloud_sample``)
and capped at ``pointcloud_max_points``.

Usage:
    generator = PointCloudGenerator(frame_width=1280, frame_height=720)
    result = generator.generate(rgb_frame, depth_map)
    # result.points  →  (N, 6) float32 [[x, y, z, r, g, b], ...]
"""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass, field
from typing import Optional

import numpy as np

import open3d as o3d

from edge.config import config

logger = logging.getLogger(__name__)


@dataclass
class PointCloudResult:
    """Result of a point cloud generation cycle."""

    points: np.ndarray = field(default_factory=lambda: np.empty((0, 6), dtype=np.float32))
    """Point cloud array (N, 6) — columns: x, y, z, r, g, b."""

    timestamp: float = 0.0
    """Unix timestamp when the cloud was generated."""

    frame_count: int = 0
    """Frame number that produced this cloud."""


class PointCloudGenerator:
    """
    Generates a coloured 3D point cloud from an RGB frame and depth map.

    Camera intrinsics are computed from the configured FOV, sensor width,
    and frame resolution.

    Args:
        frame_width: Width of the camera frame in pixels.
        frame_height: Height of the camera frame in pixels.
        fov_degrees: Horizontal field of view (default from config).
        sensor_width_mm: Sensor width in mm (default from config).
        step: Sample every N-th pixel (default from config).
        max_points: Maximum number of output points (default from config).
    """

    def __init__(
        self,
        frame_width: int | None = None,
        frame_height: int | None = None,
        fov_degrees: float | None = None,
        sensor_width_mm: float | None = None,
        step: int | None = None,
        max_points: int | None = None,
        intrinsics: dict | None = None,
    ) -> None:
        self._width = frame_width or config.frame_width
        self._height = frame_height or config.frame_height
        self._fov = fov_degrees or config.fov_degrees
        self._sensor_width = sensor_width_mm or config.sensor_width_mm
        self._step = step or config.pointcloud_sample
        self._max_points = max_points or config.pointcloud_max_points

        # Camera intrinsics — prefer calibration, fallback to heuristic
        if intrinsics:
            self._fx = float(intrinsics.get("fx", self._width * 1.1))
            self._fy = float(intrinsics.get("fy", self._fx))
            self._cx = float(intrinsics.get("cx", self._width / 2.0))
            self._cy = float(intrinsics.get("cy", self._height / 2.0))
        else:
            self._fx = float(self._width * 1.1)
            self._fy = self._fx
            self._cx = float(self._width) / 2.0
            self._cy = float(self._height) / 2.0
        self._max_depth_m = 5.0

        logger.debug(
            "PointCloudGenerator: %dx%d, fx=%.2f, fy=%.2f, cx=%.2f, cy=%.2f, "
            "step=%d, max_points=%d",
            self._width,
            self._height,
            self._fx,
            self._fy,
            self._cx,
            self._cy,
            self._step,
            self._max_points,
        )

    # ── Public API ───────────────────────────────────────────────────

    def generate(
        self,
        rgb: np.ndarray,
        depth: np.ndarray,
        frame_count: int = 0,
    ) -> PointCloudResult:
        """
        Generate a point cloud from an RGB frame and depth map.

        Args:
            rgb: RGB frame ``(H, W, 3)`` uint8.
            depth: Depth map ``(H, W)`` float32, normalized [0, 1].
            frame_count: Optional frame counter for provenance.

        Returns:
            ``PointCloudResult`` with points ``(N, 6)`` float32.
            Returns an empty result if inputs are invalid.
        """
        # ── Input validation ─────────────────────────────────────────
        if rgb is None or depth is None:
            logger.warning("RGB or depth is None — returning empty cloud.")
            return PointCloudResult(frame_count=frame_count)

        if rgb.size == 0 or depth.size == 0:
            logger.warning("RGB or depth is empty — returning empty cloud.")
            return PointCloudResult(frame_count=frame_count)

        if len(rgb.shape) != 3 or rgb.shape[2] < 3:
            logger.warning(
                "Expected RGB with 3 channels, got shape %s.", rgb.shape
            )
            return PointCloudResult(frame_count=frame_count)

        if depth.shape[:2] != rgb.shape[:2]:
            logger.warning(
                "Depth shape %s does not match RGB shape %s — resizing depth.",
                depth.shape,
                rgb.shape,
            )
            import cv2

            depth = cv2.resize(
                depth,
                (rgb.shape[1], rgb.shape[0]),
                interpolation=cv2.INTER_LINEAR,
            )

        # ── Generate point cloud ─────────────────────────────────────
        try:
            points = self._project(rgb, depth)

            # FIX 3: Statistical outlier removal via Open3D
            # Elimina puntos aislados que crean "nubes fantasma"
            if len(points) > 200:
                pcd = o3d.geometry.PointCloud()
                pcd.points = o3d.utility.Vector3dVector(points[:, :3])
                pcd.colors = o3d.utility.Vector3dVector(points[:, 3:6] / 255.0)
                pcd_filtered, _ = pcd.remove_statistical_outlier(
                    nb_neighbors=20, std_ratio=2.0
                )
                pts_filtered = np.asarray(pcd_filtered.points)
                cols_filtered = np.asarray(pcd_filtered.colors) * 255.0
                # Reconstruir array (N, 6)
                points = np.column_stack([pts_filtered, cols_filtered]).astype(np.float32)

            # Cap at max_points (FIX 4: subsample aleatorio, no primeros N)
            if len(points) > self._max_points:
                idx = np.random.choice(len(points), self._max_points, replace=False)
                idx.sort()
                points = points[idx]

            return PointCloudResult(
                points=points,
                timestamp=time.time(),
                frame_count=frame_count,
            )

        except Exception:
            logger.exception("Point cloud generation failed.")
            return PointCloudResult(frame_count=frame_count)

    # ── Internal ─────────────────────────────────────────────────────

    def _project(self, rgb: np.ndarray, depth: np.ndarray) -> np.ndarray:
        """
        Project sampled pixels into 3D camera coordinates.

        Returns:
            ``(N, 6)`` float32 array [x, y, z, r, g, b].
        """
        h, w = rgb.shape[:2]

        # Sample every N-th pixel
        rows = np.arange(0, h, self._step)
        cols = np.arange(0, w, self._step)
        grid_c, grid_r = np.meshgrid(cols, rows)

        # Flatten
        u = grid_c.ravel().astype(np.float32)
        v = grid_r.ravel().astype(np.float32)

        # Depth at sampled positions
        z = depth[grid_r, grid_c].ravel().astype(np.float32)

        # Filter out invalid / zero-depth / too-far pixels
        valid = (z > 1e-6) & (z < self._max_depth_m)
        u = u[valid]
        v = v[valid]
        z = z[valid]

        if len(z) == 0:
            return np.empty((0, 6), dtype=np.float32)

        # Project to camera coordinates (FIX 3: intrínsecos corregidos)
        x = (u - self._cx) * z / self._fx
        y = (v - self._cy) * z / self._fy

        # Colours at sampled positions (RGB)
        sampled = rgb[grid_r, grid_c]  # shape: (len(r_range), len(c_range), 3)
        sampled_flat = sampled.reshape(-1, 3)  # shape: (H*W, 3)
        r_vals = sampled_flat[valid, 0].astype(np.float32)
        g_vals = sampled_flat[valid, 1].astype(np.float32)
        b_vals = sampled_flat[valid, 2].astype(np.float32)

        # Stack into N×6
        cloud = np.column_stack([x, y, z, r_vals, g_vals, b_vals])
        return cloud.astype(np.float32)

    def update_intrinsics(self, intrinsics: dict) -> None:
        """Update camera intrinsics from calibration dict."""
        self._fx = float(intrinsics.get("fx", self._fx))
        self._fy = float(intrinsics.get("fy", self._fy))
        self._cx = float(intrinsics.get("cx", self._cx))
        self._cy = float(intrinsics.get("cy", self._cy))

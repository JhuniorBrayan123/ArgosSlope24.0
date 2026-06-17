"""
ARGOS SLOPE 4.0 — Depth Post-Processor.

Applies a sequential quality-improvement pipeline to the raw MiDaS depth map
(in metres) before mesh generation.  Steps:

1. Clip to [depth_min_m, depth_max_m]
2. Median 3×3 → bilateral filter (edge-preserving denoising)
3. Outlier mask: pixels outside 2nd–98th percentile of the ROI
4. Gradient mask: |∇depth| > max_depth_gradient → invalid pixel
5. Dominant-plane displacement:
     - Fit dominant inclined plane via RANSAC / least-squares on 3-D points
     - Replace Z_absolute with plane_z + displacement × scale
     - Produces a stable, realistic talud surface instead of MiDaS cone/fold

Returns ProcessedDepth with the filtered depth, validity mask, and quality
metrics used by SceneValidator.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Optional

import cv2
import numpy as np

from edge.config import config

logger = logging.getLogger(__name__)


# ── Result dataclass ─────────────────────────────────────────────────


@dataclass
class ProcessedDepth:
    """Output of the depth post-processing pipeline."""

    depth: np.ndarray
    """Post-processed depth map (H, W) float32 in metres.
    Values at invalid mask positions are set to 0."""

    mask: np.ndarray
    """Boolean mask (H, W): True = valid pixel."""

    quality_score: float = 0.0
    """Overall quality score [0, 1].  >0.35 is considered usable for 3D."""

    valid_coverage: float = 0.0
    """Fraction of pixels that passed all filters."""

    depth_variance: float = 0.0
    """Variance of depth values in the valid region (m²)."""

    has_dominant_plane: bool = False
    """Whether a stable dominant plane was found via RANSAC."""

    plane_normal: np.ndarray = field(
        default_factory=lambda: np.array([0.0, 0.0, 1.0], dtype=np.float32)
    )
    """Normal vector of the dominant plane."""

    plane_offset: float = 0.0
    """Plane equation: normal · p = offset."""


# ── Processor ───────────────────────────────────────────────────────


class DepthProcessor:
    """
    Apply the full depth post-processing pipeline.

    Parameters are read from ``edge.config.config`` at construction time so
    they can be overridden via environment variables without code changes.
    """

    def __init__(
        self,
        *,
        depth_min_m: float | None = None,
        depth_max_m: float | None = None,
        smooth_sigma: float | None = None,
        max_gradient: float | None = None,
        plane_displacement_scale: float | None = None,
    ) -> None:
        self._min = depth_min_m if depth_min_m is not None else config.depth_min_m
        self._max = depth_max_m if depth_max_m is not None else config.depth_max_m
        self._sigma = smooth_sigma if smooth_sigma is not None else config.depth_smooth_sigma
        self._max_grad = max_gradient if max_gradient is not None else config.max_depth_gradient
        self._plane_scale = (
            plane_displacement_scale
            if plane_displacement_scale is not None
            else config.plane_displacement_scale
        )

    # ── Public API ───────────────────────────────────────────────────

    def process(
        self,
        depth_raw: np.ndarray,
        fx: float | None = None,
        fy: float | None = None,
        cx: float | None = None,
        cy: float | None = None,
    ) -> ProcessedDepth:
        """
        Run the full depth post-processing pipeline.

        Args:
            depth_raw: Raw MiDaS output (H, W) float32, already in metres.
            fx, fy, cx, cy: Camera intrinsics needed for 3D point lift.
                If None, uses defaults from config (wide-angle approximation).

        Returns:
            ProcessedDepth with filtered depth, mask, and quality metrics.
        """
        if depth_raw is None or depth_raw.size == 0:
            logger.warning("[DepthProcessor] Empty input depth map.")
            h, w = 1, 1
            return ProcessedDepth(
                depth=np.zeros((h, w), dtype=np.float32),
                mask=np.zeros((h, w), dtype=bool),
            )

        h, w = depth_raw.shape[:2]

        # Use config intrinsics as fallback
        _fx = fx or float(config.frame_width * 1.1)
        _fy = fy or _fx
        _cx = cx or float(config.frame_width) / 2.0
        _cy = cy or float(config.frame_height) / 2.0

        # ── Step 1: Clip to metric range ─────────────────────────────
        depth = np.clip(depth_raw.astype(np.float32), self._min, self._max)

        # ── Step 2: Smoothing ─────────────────────────────────────────
        if self._sigma > 0:
            # Bilateral: preserves depth edges (crack boundaries)
            sigma_s = max(1, int(self._sigma * 3) | 1)  # must be odd
            depth = cv2.bilateralFilter(
                depth, d=sigma_s, sigmaColor=0.3, sigmaSpace=self._sigma
            )

        # ── Step 3: Outlier mask (percentile-based) ──────────────────
        p2 = float(np.percentile(depth, 2))
        p98 = float(np.percentile(depth, 98))
        mask_range = (depth >= p2) & (depth <= p98)

        # ── Step 4: Gradient mask ─────────────────────────────────────
        if self._max_grad > 0:
            grad_x = np.abs(np.diff(depth, axis=1, prepend=depth[:, :1]))
            grad_y = np.abs(np.diff(depth, axis=0, prepend=depth[:1, :]))
            mask_grad = (grad_x < self._max_grad) & (grad_y < self._max_grad)
        else:
            mask_grad = np.ones((h, w), dtype=bool)

        combined_mask = mask_range & mask_grad
        depth[~combined_mask] = 0.0

        # ── Step 5: Dominant-plane displacement ──────────────────────
        plane_normal = np.array([0.0, 0.0, 1.0], dtype=np.float32)
        plane_offset = float(np.median(depth[combined_mask])) if combined_mask.any() else 1.0
        has_plane = False

        if combined_mask.sum() > 500:  # Need enough points for RANSAC
            try:
                plane_normal, plane_offset, has_plane, depth = self._apply_plane_displacement(
                    depth, combined_mask, _fx, _fy, _cx, _cy
                )
            except Exception:
                logger.debug("[DepthProcessor] Plane displacement failed — skipping.", exc_info=True)

        # ── Quality metrics ───────────────────────────────────────────
        n_valid = int(combined_mask.sum())
        n_total = h * w
        valid_coverage = n_valid / n_total if n_total > 0 else 0.0
        valid_depths = depth[combined_mask]
        depth_variance = float(np.var(valid_depths)) if len(valid_depths) > 0 else 0.0

        quality_score = self._compute_quality(
            valid_coverage, depth_variance, has_plane
        )

        logger.debug(
            "[DepthProcessor] coverage=%.2f variance=%.4f has_plane=%s score=%.3f",
            valid_coverage, depth_variance, has_plane, quality_score,
        )

        return ProcessedDepth(
            depth=depth,
            mask=combined_mask,
            quality_score=quality_score,
            valid_coverage=valid_coverage,
            depth_variance=depth_variance,
            has_dominant_plane=has_plane,
            plane_normal=plane_normal,
            plane_offset=plane_offset,
        )

    # ── Internal helpers ─────────────────────────────────────────────

    def _apply_plane_displacement(
        self,
        depth: np.ndarray,
        mask: np.ndarray,
        fx: float,
        fy: float,
        cx: float,
        cy: float,
    ) -> tuple[np.ndarray, float, bool, np.ndarray]:
        """
        Fit a dominant plane to the valid 3D points, then replace the depth map
        with: plane_z(u,v) + displacement(u,v) * scale.

        Returns (plane_normal, plane_offset, success, updated_depth).
        """
        h, w = depth.shape[:2]

        # Lift masked pixels to 3D
        ys, xs = np.where(mask)
        zs = depth[ys, xs]
        # Sub-sample for speed (max 4000 points for RANSAC)
        if len(zs) > 4000:
            idx = np.random.choice(len(zs), 4000, replace=False)
            ys_s, xs_s, zs_s = ys[idx], xs[idx], zs[idx]
        else:
            ys_s, xs_s, zs_s = ys, xs, zs

        X3d = (xs_s - cx) * zs_s / fx
        Y3d = (ys_s - cy) * zs_s / fy
        pts = np.column_stack([X3d, Y3d, zs_s])  # (N, 3)

        # Fit plane via SVD (least-squares)
        centroid = pts.mean(axis=0)
        pts_c = pts - centroid
        _, _, Vt = np.linalg.svd(pts_c, full_matrices=False)
        normal = Vt[-1]  # normal of the best-fit plane
        normal = normal / (np.linalg.norm(normal) + 1e-9)
        # Ensure normal points towards camera (+Z)
        if normal[2] < 0:
            normal = -normal
        offset = float(np.dot(normal, centroid))

        # Check plausibility: plane normal must be roughly facing camera
        facing = abs(normal[2])
        if facing < 0.3:
            # Very tilted plane — likely noise; skip displacement
            return normal.astype(np.float32), offset, False, depth

        # Build full-grid plane-Z map
        u_grid = np.arange(w, dtype=np.float32)
        v_grid = np.arange(h, dtype=np.float32)
        ug, vg = np.meshgrid(u_grid, v_grid)

        # For each pixel, compute Z on the dominant plane
        # normal[0]*X + normal[1]*Y + normal[2]*Z = offset
        # X = (u - cx)*Z/fx, Y = (v - cy)*Z/fy
        # → Z * (normal[2] + normal[0]*(u-cx)/fx + normal[1]*(v-cy)/fy) = offset
        A_grid = (
            normal[2]
            + normal[0] * (ug - cx) / fx
            + normal[1] * (vg - cy) / fy
        )
        with np.errstate(divide="ignore", invalid="ignore"):
            plane_z = np.where(np.abs(A_grid) > 1e-6, offset / A_grid, depth)

        # Displacement = actual_depth - plane_z
        displacement = depth - plane_z
        # New depth = plane_z + displacement * scale
        new_depth = plane_z + displacement * self._plane_scale
        new_depth = np.where(mask, new_depth.astype(np.float32), 0.0)
        new_depth = np.clip(new_depth, self._min, self._max)

        return normal.astype(np.float32), offset, True, new_depth

    @staticmethod
    def _compute_quality(
        valid_coverage: float,
        depth_variance: float,
        has_plane: bool,
    ) -> float:
        """
        Heuristic quality score [0, 1].

        Component weights:
          - valid_coverage (40%): more valid pixels → better
          - depth_variance (30%): moderate variance = good (not flat-wall noise,
            not chaotic cluttered scene)
          - has_plane (30%): stable dominant plane found
        """
        # Coverage score: saturates at 0.8 coverage
        cov_score = min(valid_coverage / 0.8, 1.0)

        # Variance score: best in [0.01, 0.5] m² range
        # Below 0.005 → likely a plain flat wall → low quality
        # Above 1.0  → chaotic cluttered scene → low quality
        if depth_variance < 0.001:
            var_score = 0.05
        elif depth_variance < 0.01:
            var_score = 0.3 + (depth_variance - 0.001) / 0.009 * 0.4
        elif depth_variance <= 0.5:
            var_score = 0.7 + (depth_variance - 0.01) / 0.49 * 0.3
        elif depth_variance <= 1.0:
            var_score = 1.0 - (depth_variance - 0.5) / 0.5 * 0.5
        else:
            var_score = max(0.0, 0.5 - (depth_variance - 1.0) * 0.2)

        plane_score = 1.0 if has_plane else 0.3

        return round(0.40 * cov_score + 0.30 * var_score + 0.30 * plane_score, 4)

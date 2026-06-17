"""
ARGOS SLOPE 4.0 — Depth Map → Textured Mesh Generator (v2).

Converts a post-processed MiDaS depth map into a triangle mesh suitable
for MQTT/frontend rendering.  Each sampled depth pixel becomes a vertex;
neighbouring pixels are connected into two triangles per quad.

Improvements over v1:
    - Depth-delta gate: quads whose corner Z-values span more than
      MAX_TRIANGLE_DEPTH_DELTA are discarded (no bridging triangles).
    - Laplacian smooth: optional vertex-position smoothing to reduce
      MiDaS high-frequency noise (configurable iterations).
    - MeshQualityResult: exposes valid_face_ratio and is_stable for the
      snapshot quality gate.
    - ProcessedDepth mask integration: only valid pixels become vertices.

The mesh is centred and uniformly scaled to a consistent viewing volume
(controlled by config.mesh_target_extent).
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Optional

import numpy as np

from edge.config import config

logger = logging.getLogger(__name__)


# ── Result dataclasses ────────────────────────────────────────────────


@dataclass
class MeshResult:
    """Triangle mesh derived from a depth map."""

    vertices: np.ndarray = field(
        default_factory=lambda: np.empty((0, 3), dtype=np.float32)
    )
    """Vertex positions (N, 3) in camera space (metres)."""

    indices: np.ndarray = field(
        default_factory=lambda: np.empty((0, 3), dtype=np.int32)
    )
    """Triangle face indices (M, 3)."""

    uvs: np.ndarray = field(
        default_factory=lambda: np.empty((0, 2), dtype=np.float32)
    )
    """Texture coordinates (N, 2) in [0, 1]."""

    vertex_count: int = 0
    face_count: int = 0

    centroid: np.ndarray = field(
        default_factory=lambda: np.zeros(3, dtype=np.float32)
    )
    """Centroid subtracted from vertices (for crack alignment)."""

    scale: float = 1.0
    """Scale factor applied after centering."""

    # Quality metrics (new in v2)
    valid_face_ratio: float = 0.0
    """valid_faces / candidate_quads — used by MeshQualityGate."""

    is_stable: bool = False
    """True when valid_face_ratio ≥ 0.5 and face_count > 50."""


@dataclass
class MeshQualityResult:
    """Gate result from mesh_quality_check()."""

    is_stable: bool
    valid_face_ratio: float
    face_count: int
    reject_reason: str = ""


# ── Generator ─────────────────────────────────────────────────────────


class DepthMeshGenerator:
    """
    Build a regular-grid mesh from a depth map.

    Args:
        fx, fy, cx, cy: Camera intrinsics (pixels).
        step: Sample every N-th pixel to control mesh resolution.
        max_depth_m: Ignore depth values beyond this distance.
        max_depth_delta: Max Z-diff between quad corners (depth gate).
        laplacian_iterations: Laplacian smooth passes after construction.
    """

    def __init__(
        self,
        fx: float | None = None,
        fy: float | None = None,
        cx: float | None = None,
        cy: float | None = None,
        step: int | None = None,
        max_depth_m: float | None = None,
        max_depth_delta: float | None = None,
        laplacian_iterations: int | None = None,
    ) -> None:
        self._fx = fx or float(config.frame_width * 1.1)
        self._fy = fy or self._fx
        self._cx = cx or float(config.frame_width) / 2.0
        self._cy = cy or float(config.frame_height) / 2.0
        self._step = max(1, step or config.mesh_step)
        self._max_depth_m = max_depth_m or config.mesh_max_depth_m
        self._max_depth_delta = (
            max_depth_delta
            if max_depth_delta is not None
            else config.max_triangle_depth_delta
        )
        self._laplacian_iters = (
            laplacian_iterations
            if laplacian_iterations is not None
            else config.mesh_laplacian_iterations
        )

    # ── Public API ───────────────────────────────────────────────────

    def generate(
        self,
        depth: np.ndarray,
        frame_width: int | None = None,
        frame_height: int | None = None,
        valid_mask: np.ndarray | None = None,
    ) -> MeshResult:
        """
        Generate a centred, scaled mesh from a (post-processed) depth map.

        Args:
            depth: Depth map (H, W) float32 in metres.
            frame_width: Original frame width for UV mapping.
            frame_height: Original frame height for UV mapping.
            valid_mask: Boolean mask (H, W) from DepthProcessor.
                        If None, pixels with depth > 1e-3 are used.

        Returns:
            ``MeshResult`` with vertices, indices, UVs, and quality info.
        """
        if depth is None or depth.size == 0:
            logger.warning("[MeshGenerator] Empty depth map — returning empty mesh.")
            return MeshResult()

        h, w = depth.shape[:2]
        img_w = frame_width or w
        img_h = frame_height or h
        step = self._step

        rows = np.arange(0, h, step, dtype=np.int32)
        cols = np.arange(0, w, step, dtype=np.int32)
        grid_h = len(rows)
        grid_w = len(cols)

        if grid_h < 2 or grid_w < 2:
            return MeshResult()

        # ── Vertex grid ──────────────────────────────────────────────
        grid_c, grid_r = np.meshgrid(cols, rows)
        u_px = grid_c.astype(np.float32)
        v_px = grid_r.astype(np.float32)
        z = depth[grid_r, grid_c].astype(np.float32)

        # Valid pixel mask on grid
        if valid_mask is not None:
            v_on_grid = valid_mask[grid_r, grid_c]
        else:
            v_on_grid = (z > 1e-3) & (z < self._max_depth_m)

        x = (u_px - self._cx) * z / self._fx
        y = (v_px - self._cy) * z / self._fy

        # Flatten
        x_flat = x.ravel()
        y_flat = y.ravel()
        z_flat = z.ravel()
        u_flat = u_px.ravel()
        v_flat = v_px.ravel()
        valid_flat = v_on_grid.ravel()

        n_verts = grid_h * grid_w
        vertices = np.column_stack([x_flat, y_flat, z_flat]).astype(np.float32)
        uvs = np.column_stack([
            u_flat / float(img_w),
            v_flat / float(img_h),
        ]).astype(np.float32)

        # ── Triangle indices with depth-delta gate ───────────────────
        indices: list[list[int]] = []
        candidate_quads = 0

        for r in range(grid_h - 1):
            for c in range(grid_w - 1):
                i00 = r * grid_w + c
                i10 = r * grid_w + (c + 1)
                i01 = (r + 1) * grid_w + c
                i11 = (r + 1) * grid_w + (c + 1)

                if not (
                    valid_flat[i00]
                    and valid_flat[i10]
                    and valid_flat[i01]
                    and valid_flat[i11]
                ):
                    continue

                candidate_quads += 1

                # ── Depth-delta gate ─────────────────────────────────
                z_vals = np.array([
                    z_flat[i00], z_flat[i10], z_flat[i01], z_flat[i11]
                ])
                if (z_vals.max() - z_vals.min()) > self._max_depth_delta:
                    continue  # Reject: straddles a depth discontinuity

                # Two triangles per quad (CCW winding)
                indices.append([i00, i10, i11])
                indices.append([i00, i11, i01])

        if not indices:
            logger.warning("[MeshGenerator] No valid triangles generated.")
            return MeshResult()

        tri_indices = np.array(indices, dtype=np.int32)
        accepted_quads = len(indices) // 2
        valid_face_ratio = (
            accepted_quads / candidate_quads if candidate_quads > 0 else 0.0
        )

        # ── Laplacian smooth ─────────────────────────────────────────
        if self._laplacian_iters > 0 and len(indices) > 0:
            vertices = self._laplacian_smooth(
                vertices, tri_indices, self._laplacian_iters
            )

        # ── Centre and scale mesh ────────────────────────────────────
        valid_verts = vertices[valid_flat]
        centroid = valid_verts.mean(axis=0)
        vertices = vertices - centroid

        extents = valid_verts - centroid
        max_extent = float(np.max(np.abs(extents))) if len(extents) > 0 else 1.0
        scale = 1.0
        if max_extent > 1e-6:
            scale = config.mesh_target_extent / max_extent
            vertices = (vertices * scale).astype(np.float32)

        face_count = len(tri_indices)
        is_stable = valid_face_ratio >= 0.5 and face_count > 50

        result = MeshResult(
            vertices=vertices,
            indices=tri_indices,
            uvs=uvs,
            vertex_count=n_verts,
            face_count=face_count,
            centroid=centroid.astype(np.float32),
            scale=float(scale),
            valid_face_ratio=round(valid_face_ratio, 4),
            is_stable=is_stable,
        )

        logger.debug(
            "[MeshGenerator] %d verts, %d faces, ratio=%.2f, stable=%s (step=%d)",
            result.vertex_count,
            result.face_count,
            result.valid_face_ratio,
            result.is_stable,
            step,
        )
        return result

    def update_intrinsics(self, intrinsics: dict) -> None:
        """Update camera intrinsics from calibration dict."""
        self._fx = float(intrinsics.get("fx", self._fx))
        self._fy = float(intrinsics.get("fy", self._fy))
        self._cx = float(intrinsics.get("cx", self._cx))
        self._cy = float(intrinsics.get("cy", self._cy))

    # ── Internal helpers ─────────────────────────────────────────────

    @staticmethod
    def _laplacian_smooth(
        vertices: np.ndarray,
        indices: np.ndarray,
        iterations: int,
    ) -> np.ndarray:
        """
        Simple Laplacian smoothing: each vertex moves toward the average of
        its neighbours.  Only XYZ is smoothed; UVs are kept as-is.
        """
        n = len(vertices)
        # Build adjacency (each vertex → set of neighbour indices)
        neighbours: list[set[int]] = [set() for _ in range(n)]
        for tri in indices:
            a, b, c = int(tri[0]), int(tri[1]), int(tri[2])
            neighbours[a].update((b, c))
            neighbours[b].update((a, c))
            neighbours[c].update((a, b))

        verts = vertices.copy()
        for _ in range(iterations):
            new_verts = verts.copy()
            for i, nbrs in enumerate(neighbours):
                if nbrs:
                    new_verts[i] = verts[list(nbrs)].mean(axis=0)
            verts = new_verts

        return verts.astype(np.float32)


def mesh_quality_check(mesh: MeshResult) -> MeshQualityResult:
    """
    Standalone quality gate for a generated mesh.

    Returns MeshQualityResult with is_stable flag used by snapshot_builder.
    """
    if mesh.face_count == 0:
        return MeshQualityResult(
            is_stable=False,
            valid_face_ratio=0.0,
            face_count=0,
            reject_reason="no_faces",
        )

    if not mesh.is_stable:
        reason = (
            "low_face_ratio"
            if mesh.valid_face_ratio < 0.5
            else "insufficient_faces"
        )
        return MeshQualityResult(
            is_stable=False,
            valid_face_ratio=mesh.valid_face_ratio,
            face_count=mesh.face_count,
            reject_reason=reason,
        )

    return MeshQualityResult(
        is_stable=True,
        valid_face_ratio=mesh.valid_face_ratio,
        face_count=mesh.face_count,
    )

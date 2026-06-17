"""
ARGOS SLOPE 4.0 — Snapshot Builder (Orchestrator).

Single entry point called from main.py to build a Snapshot3D payload.
Replaces the ad-hoc block at main.py L749-827.

Pipeline:
    roi_frame + raw_depth + cracks + intrinsics
        → DepthProcessor       (filter + plane displacement)
        → SceneValidator       (5 quality gates)
        → DepthMeshGenerator   (mesh with depth-delta gate + Laplacian smooth)
        → MeshQualityGate      (valid_face_ratio, is_stable)
        → CrackSurfaceProjector (median-depth projection onto mesh)
        → SnapshotBuildResult  (mode + payload fields)

The caller (main.py) uses result.mode to decide what to publish:
    "3d_valid"    → publisher.publish_snapshot_3d with mesh
    "2d_only"     → publisher.publish_snapshot_3d without mesh
    "invalid_scene" → skip publish or publish 2d_only with reject info
"""

from __future__ import annotations

import base64
import logging
from dataclasses import dataclass, field
from typing import Optional

import cv2
import numpy as np

from edge.config import config
from edge.depth.depth_processor import DepthProcessor, ProcessedDepth
from edge.scene.scene_validator import SceneValidator, SceneValidation
from edge.pointcloud.mesh_generator import DepthMeshGenerator, MeshResult, mesh_quality_check
from edge.reconstruction.crack_projector import CrackSurfaceProjector, ProjectedCrack

logger = logging.getLogger(__name__)


# ── Result ───────────────────────────────────────────────────────────


@dataclass
class ReconstructionMeta:
    """Metadata about the 3D reconstruction attempt (included in MQTT payload)."""

    mode: str  # "3d_valid" | "2d_only" | "invalid_scene"
    scene_valid: bool = False
    quality_score: float = 0.0
    reject_reason: str = ""
    message: str = ""


@dataclass
class SnapshotBuildResult:
    """
    Result of snapshot_builder.build().

    The caller converts this to the MQTT payload via publish_snapshot_3d.
    """

    mode: str  # "3d_valid" | "2d_only" | "invalid_scene"
    reconstruction: ReconstructionMeta = field(
        default_factory=lambda: ReconstructionMeta(mode="2d_only")
    )

    # ── Mesh fields (only when mode == "3d_valid") ───────────────────
    mesh: Optional[MeshResult] = None

    # ── Always-present fields ─────────────────────────────────────────
    image_bgr: Optional[np.ndarray] = None
    """ROI frame BGR — caller encodes to JPEG for MQTT."""

    cracks: list[ProjectedCrack] = field(default_factory=list)
    """Cracks with 2D coords always; x3d/y3d/z3d only when surface_valid."""

    processed_depth: Optional[ProcessedDepth] = None
    """Post-processed depth (kept for point-cloud generation if needed)."""


# ── Builder ───────────────────────────────────────────────────────────


class SnapshotBuilder:
    """
    Orchestrates the full depth → mesh → crack-projection pipeline.

    Instantiate once per process (components are stateless or re-entrant).
    Call build() on every frame you want to snapshot.
    """

    def __init__(
        self,
        fx: float,
        fy: float,
        cx: float,
        cy: float,
    ) -> None:
        self._fx = fx
        self._fy = fy
        self._cx = cx
        self._cy = cy

        self._depth_proc = DepthProcessor()
        self._scene_val = SceneValidator()
        self._mesh_gen = DepthMeshGenerator(fx=fx, fy=fy, cx=cx, cy=cy)

    def build(
        self,
        roi_frame: np.ndarray,
        raw_depth: np.ndarray,
        cracks: list,
    ) -> SnapshotBuildResult:
        """
        Build a Snapshot3D from a ROI frame and its raw MiDaS depth.

        Args:
            roi_frame: BGR frame after ROI crop (used for JPEG texture).
            raw_depth: Raw MiDaS output (H, W) float32, in metres.
            cracks: List of CrackResult objects from the detector.

        Returns:
            SnapshotBuildResult with mode, mesh (if valid), and cracks.
        """
        h_frame, w_frame = roi_frame.shape[:2]

        # ── Step A: Depth post-processing ────────────────────────────
        processed = self._depth_proc.process(
            raw_depth,
            fx=self._fx, fy=self._fy, cx=self._cx, cy=self._cy,
        )

        # ── Step B: Scene validation ──────────────────────────────────
        validation: SceneValidation = self._scene_val.validate(processed)

        if not validation.valid:
            logger.info(
                "[SnapshotBuilder] mode=2d_only reason=%s score=%.3f",
                validation.reject_reason, validation.score,
            )
            # Still project cracks 2D (no mesh, no surface_valid)
            cracks_out = self._project_cracks_no_mesh(cracks)
            return SnapshotBuildResult(
                mode="2d_only",
                reconstruction=ReconstructionMeta(
                    mode="2d_only",
                    scene_valid=False,
                    quality_score=validation.score,
                    reject_reason=validation.reject_reason,
                    message=validation.message,
                ),
                mesh=None,
                image_bgr=roi_frame,
                cracks=cracks_out,
                processed_depth=processed,
            )

        # ── Step C: Mesh generation ───────────────────────────────────
        mesh = self._mesh_gen.generate(
            processed.depth,
            frame_width=w_frame,
            frame_height=h_frame,
            valid_mask=processed.mask,
        )
        quality_check = mesh_quality_check(mesh)

        if not quality_check.is_stable:
            logger.info(
                "[SnapshotBuilder] mode=2d_only reason=%s faces=%d ratio=%.2f",
                quality_check.reject_reason,
                quality_check.face_count,
                quality_check.valid_face_ratio,
            )
            cracks_out = self._project_cracks_no_mesh(cracks)
            return SnapshotBuildResult(
                mode="2d_only",
                reconstruction=ReconstructionMeta(
                    mode="2d_only",
                    scene_valid=True,
                    quality_score=validation.score,
                    reject_reason=quality_check.reject_reason,
                    message="Malla 3D inestable — usando vista 2D.",
                ),
                mesh=None,
                image_bgr=roi_frame,
                cracks=cracks_out,
                processed_depth=processed,
            )

        # ── Step D: Crack surface projection ─────────────────────────
        projector = CrackSurfaceProjector(
            fx=self._fx,
            fy=self._fy,
            cx=self._cx,
            cy=self._cy,
            mesh_centroid=mesh.centroid,
            mesh_scale=mesh.scale,
        )
        cracks_out = projector.project(cracks, processed.depth, (h_frame, w_frame))

        logger.info(
            "[SnapshotBuilder] mode=3d_valid faces=%d ratio=%.2f score=%.3f cracks=%d",
            mesh.face_count,
            mesh.valid_face_ratio,
            validation.score,
            len(cracks_out),
        )

        return SnapshotBuildResult(
            mode="3d_valid",
            reconstruction=ReconstructionMeta(
                mode="3d_valid",
                scene_valid=True,
                quality_score=validation.score,
                reject_reason="",
                message="",
            ),
            mesh=mesh,
            image_bgr=roi_frame,
            cracks=cracks_out,
            processed_depth=processed,
        )

    # ── Internal helpers ─────────────────────────────────────────────

    def _project_cracks_no_mesh(self, cracks: list) -> list[ProjectedCrack]:
        """
        Emit cracks with only 2D coords (surface_valid=False).
        Used when scene / mesh validation fails.
        """
        out: list[ProjectedCrack] = []
        for crack in cracks:
            if hasattr(crack, "x"):
                bx = int(crack.x)
                by = int(crack.y)
                bw = int(getattr(crack, "width", getattr(crack, "w", 10)))
                bh = int(getattr(crack, "height", getattr(crack, "h", 10)))
                roi_id = str(getattr(crack, "roi_id", "") or "")
                cls = str(
                    getattr(crack.classification, "value", crack.classification)
                    if hasattr(crack, "classification") else "none"
                )
                length_mm = getattr(crack, "length_mm", None)
                width_mm_val = getattr(crack, "width_mm", None)
            else:
                bx = int(crack.get("x", 0))
                by = int(crack.get("y", 0))
                bw = int(crack.get("width", crack.get("w", 10)))
                bh = int(crack.get("height", crack.get("h", 10)))
                roi_id = str(crack.get("roi_id", ""))
                cls = str(crack.get("classification", "none"))
                length_mm = crack.get("length_mm")
                width_mm_val = crack.get("width_mm")

            out.append(
                ProjectedCrack(
                    roi_id=roi_id,
                    x=bx,
                    y=by,
                    w=bw,
                    h=bh,
                    classification=cls,
                    length_mm=float(length_mm) if length_mm is not None else None,
                    width_mm=float(width_mm_val) if width_mm_val is not None else None,
                    surface_valid=False,
                )
            )
        return out



from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Optional, List

import numpy as np

logger = logging.getLogger(__name__)



@dataclass
class ProjectedCrack:

    roi_id: str = ""
    x: int = 0
    y: int = 0
    w: int = 0
    h: int = 0
    classification: str = "none"
    length_mm: Optional[float] = None
    width_mm: Optional[float] = None

    x3d: Optional[float] = None
    y3d: Optional[float] = None
    z3d: Optional[float] = None
    surface_valid: bool = False




class CrackSurfaceProjector:
   
    MIN_BBOX_VALID_FRACTION = 0.2

    def __init__(
        self,
        fx: float,
        fy: float,
        cx: float,
        cy: float,
        mesh_centroid: Optional[np.ndarray] = None,
        mesh_scale: float = 1.0,
    ) -> None:
        self._fx = fx
        self._fy = fy
        self._cx = cx
        self._cy = cy
        self._centroid = mesh_centroid if mesh_centroid is not None else np.zeros(3)
        self._scale = mesh_scale

    def project(
        self,
        cracks: list,
        depth: np.ndarray,
        frame_shape: tuple[int, int],
    ) -> list[ProjectedCrack]:
       
        dh, dw = depth.shape[:2] if depth is not None else frame_shape
        results: list[ProjectedCrack] = []

        for crack in cracks:
            projected = self._project_one(crack, depth, dh, dw)
            results.append(projected)

        n_valid = sum(1 for r in results if r.surface_valid)
        logger.debug(
            "[CrackProjector] %d/%d cracks projected to surface",
            n_valid, len(results),
        )
        return results

    # ── Internal ─────────────────────────────────────────────────────

    def _project_one(
        self,
        crack,
        depth: np.ndarray,
        dh: int,
        dw: int,
    ) -> ProjectedCrack:
        """Project a single crack detection."""
        # Support both CrackResult objects and plain dicts
        if hasattr(crack, "x"):
            bx = int(crack.x)
            by = int(crack.y)
            bw = int(getattr(crack, "width", getattr(crack, "w", 10)))
            bh = int(getattr(crack, "height", getattr(crack, "h", 10)))
            roi_id = str(getattr(crack, "roi_id", "") or "")
            cls = str(
                getattr(crack.classification, "value", crack.classification)
                if hasattr(crack, "classification")
                else "none"
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

        pc = ProjectedCrack(
            roi_id=roi_id,
            x=bx,
            y=by,
            w=bw,
            h=bh,
            classification=cls,
            length_mm=float(length_mm) if length_mm is not None else None,
            width_mm=float(width_mm_val) if width_mm_val is not None else None,
        )

        if depth is None or depth.size == 0:
            return pc

        # Clamp bbox to depth map bounds
        x0 = max(0, bx)
        y0 = max(0, by)
        x1 = min(dw, bx + bw)
        y1 = min(dh, by + bh)
        if x1 <= x0 or y1 <= y0:
            return pc

        region = depth[y0:y1, x0:x1]
        valid_vals = region[region > 0.1]

        valid_fraction = len(valid_vals) / max(1, region.size)
        if valid_fraction < self.MIN_BBOX_VALID_FRACTION:
            # Not enough reliable depth in this bbox
            return pc

        # Median depth for the bbox (robust against edge noise)
        z_m = float(np.median(valid_vals))

        # Pixel centre of the bbox
        cx_px = bx + bw / 2.0
        cy_px = by + bh / 2.0

        # Back-project to camera space (metres)
        x3d_raw = (cx_px - self._cx) * z_m / self._fx
        y3d_raw = (cy_px - self._cy) * z_m / self._fy
        z3d_raw = z_m

        # Apply same centring+scale as the mesh
        x3d = (x3d_raw - self._centroid[0]) * self._scale
        y3d = (y3d_raw - self._centroid[1]) * self._scale
        z3d = (z3d_raw - self._centroid[2]) * self._scale

        pc.x3d = round(float(x3d), 5)
        pc.y3d = round(float(y3d), 5)
        pc.z3d = round(float(z3d), 5)
        pc.surface_valid = True

        return pc

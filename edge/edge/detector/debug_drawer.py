"""
ARGOS SLOPE 4.0 — Debug Drawer for pipeline stage visualisation.

Annotates frames with detection results and rejected contours at each
pipeline stage so operators can visually inspect and tune parameters
during development or on-site troubleshooting.
"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Optional

import cv2
import numpy as np

from edge.detector.fisura_detector import CrackResult

logger = logging.getLogger(__name__)

# ── BGR colour constants ───────────────────────────────────────────────
_COLOR_GREEN = (0, 255, 0)
_COLOR_RED = (0, 0, 255)
_COLOR_YELLOW = (0, 255, 255)
_COLOR_WHITE = (255, 255, 255)
_COLOR_BLACK = (0, 0, 0)


class DebugDrawer:
    """Annotate frames with pipeline-stage overlays for visual debugging.

    Usage::

        drawer = DebugDrawer(enabled=True, output_dir="debug_output")
        annotated = drawer.draw_pipeline_stage(
            frame, "post_detection", cracks, rejected
        )
        drawer.save_stage(annotated, "final", frame_count)
    """

    def __init__(
        self, enabled: bool = False, output_dir: str = "debug_output"
    ) -> None:
        """
        Args:
            enabled: When ``False``, ``draw_pipeline_stage`` returns the
                image unchanged.
            output_dir: Directory where annotated frames are saved.
        """
        self._enabled = enabled
        self._output_dir = Path(output_dir)

    # ── Public API ──────────────────────────────────────────────────

    def draw_pipeline_stage(
        self,
        image: np.ndarray,
        stage: str,
        cracks: list[CrackResult],
        rejected: Optional[list[tuple[np.ndarray, str]]] = None,
    ) -> np.ndarray:
        """Draw detection annotations on a copy of *image*.

        Args:
            image: BGR frame to annotate.
            stage: Stage name (e.g. ``"post_detection"``) drawn as a label.
            cracks: List of accepted crack results.
            rejected: Optional list of ``(contour, reason)`` tuples.

        Returns:
            Annotated BGR image (same shape and dtype as *image*).
        """
        if not self._enabled:
            return image

        result = image.copy()
        h, w = result.shape[:2]

        # ── Stage label (top-left corner) ────────────────────────────
        self._draw_text(result, f"Stage: {stage}", (10, 30), _COLOR_WHITE)

        # ── Draw rejected contours (red) ─────────────────────────────
        if rejected:
            self._draw_text(
                result,
                f"Rejected: {len(rejected)}",
                (10, 60),
                _COLOR_RED,
            )
            for contour, reason in rejected:
                cv2.drawContours(result, [contour], -1, _COLOR_RED, 1)
                x, y, *_ = cv2.boundingRect(contour)
                self._draw_text(
                    result,
                    reason,
                    (x, y - 4),
                    _COLOR_RED,
                    scale=0.4,
                )

        # ── Draw accepted cracks (green) ─────────────────────────────
        if cracks:
            self._draw_text(
                result,
                f"Accepted: {len(cracks)}",
                (10, 90),
                _COLOR_GREEN,
            )
            for crack in cracks:
                cv2.rectangle(
                    result,
                    (crack.x, crack.y),
                    (crack.x + crack.width, crack.y + crack.height),
                    _COLOR_GREEN,
                    thickness=2,
                )
                label = (
                    f"{crack.roi_id} "
                    f"({crack.classification.value}) "
                    f"{crack.length_mm:.1f}mm"
                )
                self._draw_text(
                    result,
                    label,
                    (crack.x, crack.y - 8),
                    _COLOR_GREEN,
                    scale=0.45,
                )

        # ── Legend (bottom-right) ────────────────────────────────────
        legend_y = h - 60
        cv2.rectangle(
            result,
            (10, legend_y),
            (200, legend_y + 50),
            (0, 0, 0),
            -1,  # filled
        )
        cv2.rectangle(result, (20, legend_y + 8), (35, legend_y + 22), _COLOR_GREEN, -1)
        self._draw_text(
            result, "Accepted", (40, legend_y + 20), _COLOR_GREEN, scale=0.4
        )
        cv2.rectangle(result, (20, legend_y + 30), (35, legend_y + 44), _COLOR_RED, -1)
        self._draw_text(
            result, "Rejected", (40, legend_y + 42), _COLOR_RED, scale=0.4
        )

        return result

    def save_stage(
        self, image: np.ndarray, stage: str, frame_num: int
    ) -> Optional[Path]:
        """Save an annotated frame to disk.

        Args:
            image: Annotated BGR image.
            stage: Stage name used in the filename.
            frame_num: Frame number for zero-padded naming.

        Returns:
            The path to the saved file, or ``None`` if disabled.
        """
        if not self._enabled:
            return None

        self._output_dir.mkdir(parents=True, exist_ok=True)
        filename = f"stage_{stage}_frame_{frame_num:06d}.jpg"
        path = self._output_dir / filename
        cv2.imwrite(str(path), image)
        logger.debug("Debug frame saved: %s", path)
        return path

    # ── Internal helpers ────────────────────────────────────────────

    @staticmethod
    def _draw_text(
        image: np.ndarray,
        text: str,
        position: tuple[int, int],
        color: tuple[int, int, int],
        scale: float = 0.5,
        thickness: int = 1,
    ) -> None:
        """Draw text with a black shadow for readability."""
        x, y = position
        # Shadow (black, thicker)
        cv2.putText(
            image,
            text,
            (x + 1, y + 1),
            cv2.FONT_HERSHEY_SIMPLEX,
            scale,
            _COLOR_BLACK,
            thickness + 1,
            lineType=cv2.LINE_AA,
        )
        # Foreground
        cv2.putText(
            image,
            text,
            (x, y),
            cv2.FONT_HERSHEY_SIMPLEX,
            scale,
            color,
            thickness,
            lineType=cv2.LINE_AA,
        )

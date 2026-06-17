"""
ARGOS SLOPE 4.0 — Scene Validator.

Applies heuristic checks (no ML required) to determine whether a depth+frame
pair is suitable for 3D reconstruction of a talud surface.

Five quality gates:

    1. ROI gate       — if REQUIRE_ROI_FOR_3D is true and no ROI is configured,
                        reject immediately.
    2. Depth variance — very low variance (flat wall / uniform depth) or very
                        high variance (cluttered scene with many objects) both
                        indicate a non-talud scene.
    3. Valid coverage — if fewer than 60 % of the ROI pixels survive the depth
                        processor's filter, the scene has too much noise or
                        occlusion.
    4. Dominant plane — if DepthProcessor could not fit a stable plane, the
                        scene geometry is too chaotic.
    5. Discontinuities — if more than 25 % of adjacent pixel pairs have a depth
                        jump larger than max_depth_gradient, a non-planar
                        multi-object scene is likely.

The validator returns a SceneValidation with:
    valid        bool    — True only when all gates pass
    score        float   — weighted quality score [0, 1]
    reject_reason str   — short machine-readable code (empty when valid)
    message      str    — user-friendly Spanish message
"""

from __future__ import annotations

import logging
from dataclasses import dataclass

import numpy as np

from edge.config import config
from edge.depth.depth_processor import ProcessedDepth

logger = logging.getLogger(__name__)


# ── Result ───────────────────────────────────────────────────────────


@dataclass
class SceneValidation:
    """Result of the scene validation pipeline."""

    valid: bool
    score: float
    reject_reason: str = ""
    message: str = ""


# ── Validator ────────────────────────────────────────────────────────


class SceneValidator:
    """
    Validates whether a depth map + frame represent a talud surface
    suitable for 3D mesh reconstruction.

    All thresholds are read from ``edge.config`` at construction time and
    can be tuned without code changes via environment variables.
    """

    # Thresholds (can be overridden per instance for testing)
    MIN_VALID_COVERAGE = 0.55           # Gate 3: 55 % valid pixels required
    MIN_DEPTH_VARIANCE = 0.003          # Gate 2: below this → wall/uniform plane
    MAX_DEPTH_VARIANCE = 2.5            # Gate 2: above this → chaotic scene
    MAX_DISCONTINUITY_FRACTION = 0.30   # Gate 5: max 30 % edge pixels

    def __init__(self, roi_str: str | None = None) -> None:
        self._roi_str = roi_str if roi_str is not None else config.roi
        self._require_roi = config.require_roi_for_3d
        self._max_grad = config.max_depth_gradient
        self._min_quality = config.min_scene_quality_score

    # ── Public ───────────────────────────────────────────────────────

    def validate(self, processed: ProcessedDepth) -> SceneValidation:
        """
        Run all validation gates against a ProcessedDepth.

        Args:
            processed: Output of DepthProcessor.process().

        Returns:
            SceneValidation with valid, score, reject_reason, message.
        """
        # Gate 1 — ROI required
        if self._require_roi and not self._roi_str.strip():
            return SceneValidation(
                valid=False,
                score=0.0,
                reject_reason="no_roi",
                message="ROI no configurado. Definí ROI=x,y,w,h para activar reconstrucción 3D.",
            )

        # Gate 3 — Valid pixel coverage
        if processed.valid_coverage < self.MIN_VALID_COVERAGE:
            return SceneValidation(
                valid=False,
                score=processed.quality_score,
                reject_reason="insufficient_valid_depth",
                message=(
                    f"Cobertura de depth insuficiente ({processed.valid_coverage:.0%}). "
                    "Verificá iluminación y enfoque de la cámara."
                ),
            )

        # Gate 2 — Depth variance
        var = processed.depth_variance
        if var < self.MIN_DEPTH_VARIANCE:
            return SceneValidation(
                valid=False,
                score=processed.quality_score,
                reject_reason="invalid_depth_variance",
                message=(
                    "Escena demasiado uniforme (profundidad casi plana). "
                    "Apuntá la cámara al talud con textura visible."
                ),
            )
        if var > self.MAX_DEPTH_VARIANCE:
            return SceneValidation(
                valid=False,
                score=processed.quality_score,
                reject_reason="cluttered_scene",
                message=(
                    "Escena con demasiada variación de profundidad. "
                    "Posibles objetos en primer plano o escena con múltiples superficies."
                ),
            )

        # Gate 4 — Dominant plane
        if not processed.has_dominant_plane:
            return SceneValidation(
                valid=False,
                score=processed.quality_score,
                reject_reason="no_dominant_plane",
                message=(
                    "No se encontró plano dominante en la escena. "
                    "La cámara debe apuntar a una superficie continua del talud."
                ),
            )

        # Gate 5 — Depth discontinuities
        discontinuity_fraction = self._compute_discontinuity_fraction(processed.depth)
        if discontinuity_fraction > self.MAX_DISCONTINUITY_FRACTION:
            return SceneValidation(
                valid=False,
                score=processed.quality_score,
                reject_reason="cluttered_scene",
                message=(
                    f"Escena con demasiadas discontinuidades ({discontinuity_fraction:.0%}). "
                    "Posibles objetos o personas en el campo de visión."
                ),
            )

        # All gates passed — check minimum quality score
        score = processed.quality_score
        if score < self._min_quality:
            return SceneValidation(
                valid=False,
                score=score,
                reject_reason="low_quality",
                message=(
                    f"Calidad de reconstrucción insuficiente (score={score:.2f}). "
                    f"Mínimo requerido: {self._min_quality:.2f}. "
                    "Mejorá el encuadre del talud."
                ),
            )

        logger.info(
            "[SceneValidator] valid score=%.3f coverage=%.2f variance=%.4f disc=%.2f",
            score,
            processed.valid_coverage,
            processed.depth_variance,
            discontinuity_fraction,
        )

        return SceneValidation(
            valid=True,
            score=score,
            reject_reason="",
            message="",
        )

    # ── Internal helpers ─────────────────────────────────────────────

    def _compute_discontinuity_fraction(self, depth: np.ndarray) -> float:
        """
        Fraction of adjacent pixel pairs with depth jump > max_depth_gradient.

        Uses horizontal gradient only (sufficient signal, cheaper than full
        Sobel). Returns 0.0 if depth map is empty.
        """
        if depth is None or depth.size == 0:
            return 0.0

        valid = depth > 0
        diff_h = np.abs(np.diff(depth, axis=1))
        # Both neighbours must be valid to count as a real discontinuity
        valid_pairs_h = valid[:, :-1] & valid[:, 1:]
        n_valid_pairs = int(valid_pairs_h.sum())
        if n_valid_pairs == 0:
            return 0.0

        disc_h = (diff_h > self._max_grad) & valid_pairs_h
        return float(disc_h.sum()) / n_valid_pairs

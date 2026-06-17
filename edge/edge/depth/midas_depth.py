"""
ARGOS SLOPE 4.0 — MiDaS Depth Estimation (CPU).

Wraps MiDaS v3.1 Small (PyTorch) for single-image depth estimation on CPU.
Model is loaded once at module level (singleton) and reused across calls.

Usage:
    estimator = MidasDepthEstimator()
    depth = estimator.estimate(frame)   # (H, W) float32, normalized 0..1

Graceful fallback: if torch is not installed or model loading fails,
``estimate()`` returns None and logs a warning.
"""

from __future__ import annotations

import logging
import math
from typing import Optional

import cv2
import numpy as np

from edge.config import config

logger = logging.getLogger(__name__)

# ── Module-level model cache (singleton) ──────────────────────────────
# Loaded once on first call; survives for the lifetime of the process.
_model = None
_transform = None
_device = "cpu"


def _load_model() -> bool:
    """
    Load MiDaS v3.1 Small via torch.hub.

    Returns:
        True if model loaded successfully, False otherwise.
    """
    global _model, _transform  # noqa: PLW0603

    try:
        import torch  # type: ignore[import-untyped]
        import torchvision.transforms as T  # type: ignore[import-untyped]
    except ImportError:
        logger.warning(
            "PyTorch not installed — depth estimation disabled. "
            "Install with: pip install torch torchvision"
        )
        return False

    model_name = config.depth_model or "MiDaS_small"

    try:
        # Trust repos needed by MiDaS — it internally loads
        # rwightman/gen-efficientnet-pytorch via torch.hub, which
        # prompts for trust confirmation interactively and crashes
        # in non-interactive environments.
        extra_owners = {"intel-isl", "rwightman"}
        current = set(torch.hub._TRUSTED_REPO_OWNERS)
        if not extra_owners.issubset(current):
            torch.hub._TRUSTED_REPO_OWNERS = tuple(current | extra_owners)

        logger.info("Loading MiDaS model '%s' (this may take a few seconds)...", model_name)
        _model = torch.hub.load(
            "intel-isl/MiDaS",
            model_name,
            trust_repo=True,
            skip_validation=False,
        )
        _model.eval()
        _model.to(_device)

        # Load the appropriate transform for the model
        midas_transforms = torch.hub.load("intel-isl/MiDaS", "transforms")
        if model_name == "DPT_Large" or model_name == "DPT_Hybrid":
            _transform = midas_transforms.dpt_transform
        else:
            _transform = midas_transforms.small_transform

        logger.info("MiDaS model '%s' loaded on %s.", model_name, _device)
        return True

    except Exception:
        logger.exception("Failed to load MiDaS model '%s'.", model_name)
        return False


# ── Estimator class ───────────────────────────────────────────────────


class MidasDepthEstimator:
    """
    Single-image depth estimator using MiDaS v3.1 Small.

    The underlying PyTorch model is loaded once per process (module-level
    singleton) so that the first call incurs the download/load latency
    (2–5 s) but subsequent calls reuse the cached model.
    """

    def __init__(self) -> None:
        self._loaded = _model is not None

    @property
    def is_ready(self) -> bool:
        """Whether the underlying model has been loaded successfully."""
        return _model is not None

    def estimate(self, frame: np.ndarray) -> Optional[np.ndarray]:
        """
        Run depth estimation on a single BGR frame.

        Args:
            frame: BGR image (H, W, 3) uint8 from the camera.

        Returns:
            Depth map ``(H, W)`` float32, normalized to [0, 1].
            ``None`` if the model is unavailable or inference fails.
        """
        if frame is None or frame.size == 0:
            logger.warning("Empty frame passed to depth estimator.")
            return None

        if len(frame.shape) != 3 or frame.shape[2] != 3:
            logger.warning(
                "Expected 3-channel BGR frame, got shape %s.", frame.shape
            )
            return None

        global _model, _transform  # noqa: PLW0603

        # Lazy-load on first call
        if _model is None:
            if not _load_model():
                return None
            self._loaded = True

        try:
            import torch  # type: ignore[import-untyped]

            # Convert BGR → RGB
            rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)

            # Apply MiDaS transform
            input_batch = _transform(rgb).to(_device)

            with torch.no_grad():
                prediction = _model(input_batch)

            # Resize to original frame size
            depth = prediction.squeeze().cpu().numpy()
            orig_h, orig_w = frame.shape[:2]
            if depth.shape != (orig_h, orig_w):
                depth = cv2.resize(depth, (orig_w, orig_h), interpolation=cv2.INTER_LINEAR)

            # ── MiDaS normalization (FIX 5: percentile clipping) ─────
            # MiDaS outputs INVERSE relative depth (disparity):
            #   higher value = closer to camera
            #   lower  value = farther from camera
            #
            # We need Z = distance from camera (higher = farther),
            # so we invert first.
            #
            # CRITICAL: For a flat wall, MiDaS disparity is nearly uniform
            # (±0.03 range). Full-range normalization [0,1] would amplify
            # these tiny variations to span 4.7m → artificial cone shape.
            #
            # Solution: clip to 5th-95th percentile, then scale to a
            # realistic talud range (2.0m – 5.0m). This preserves real
            # depth variations while suppressing noise amplification.
            depth_min = float(depth.min())
            depth_max = float(depth.max())
            p5 = depth_min
            p95 = depth_max

            if depth_max - depth_min > 1e-6:
                # 1) Invert (higher → farther)
                depth = depth_max - depth

                # 2) Clip to 5th–95th percentile to kill outliers
                p5 = float(np.percentile(depth, 5))
                p95 = float(np.percentile(depth, 95))
                depth = np.clip(depth, p5, p95)

                # 3) Normalize the clipped range to [0, 1]
                d_min = depth.min()
                d_max = depth.max()
                if d_max - d_min > 1e-6:
                    depth = (depth - d_min) / (d_max - d_min)
                else:
                    depth = np.zeros_like(depth)

                # 4) Scale to metric meters (typical talud: 2m–5m)
                DEPTH_MIN_M = 2.0
                DEPTH_MAX_M = 5.0
                depth = depth * (DEPTH_MAX_M - DEPTH_MIN_M) + DEPTH_MIN_M

            # ── Debug: log depth range every 60 frames ───────────────
            _fc = getattr(self, "_frame_counter", 0) + 1
            self._frame_counter = _fc
            if _fc % 60 == 1:
                logger.info(
                    "Depth range: raw=[%.4f, %.4f]  p5=%.4f  p95=%.4f  "
                    "final=[%.3f, %.3f] m  mean=%.3f m",
                    depth_min, depth_max,
                    p5, p95,
                    float(depth.min()), float(depth.max()),
                    float(depth.mean()),
                )

            return depth.astype(np.float32)  # now in meters

        except Exception:
            logger.exception("Depth estimation failed on frame.")
            return None

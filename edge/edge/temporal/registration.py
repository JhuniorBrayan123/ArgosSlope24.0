"""
ARGOS SLOPE 4.0 — Image Registration Module.

Aligns current frame to a reference frame using ORB feature detection
and RANSAC homography estimation for temporal comparison.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Optional

import cv2
import numpy as np

logger = logging.getLogger(__name__)


@dataclass
class RegistrationConfig:
    """Configuration for image registration.

    Attributes:
        min_matches: Minimum number of good matches required for RANSAC.
                     Below this threshold, identity fallback is used.
        ransac_reproj_thresh: Maximum reprojection error (pixels) for RANSAC inliers.
        ransac_max_iters: Maximum RANSAC iterations.
        nfeatures: Maximum number of ORB features to detect.
    """

    min_matches: int = 10
    ransac_reproj_thresh: float = 3.0
    ransac_max_iters: int = 2000
    nfeatures: int = 2000


class ImageRegistrator:
    """
    Aligns a current frame to a reference frame using ORB + RANSAC homography.

    Pipeline:
        1. Detect ORB keypoints and descriptors in both frames
        2. Match descriptors using BFMatcher with cross-check
        3. Filter matches (optional ratio test)
        4. If sufficient matches: estimate homography via RANSAC
        5. Warp current frame using the homography
        6. If insufficient matches: return identity homography and unmodified current frame

    Usage:
        registrator = ImageRegistrator()
        H, aligned = registrator.register(reference_frame, current_frame)
    """

    def __init__(self, config: Optional[RegistrationConfig] = None) -> None:
        """
        Initialize the ImageRegistrator.

        Args:
            config: Optional RegistrationConfig. Uses defaults if not provided.
        """
        self.config = config or RegistrationConfig()

        # ORB detector
        self.orb = cv2.ORB_create(nfeatures=self.config.nfeatures)

        # BFMatcher for ORB (Hamming distance)
        self.matcher = cv2.BFMatcher(cv2.NORM_HAMMING, crossCheck=True)

        logger.info(
            "ImageRegistrator initialized: nfeatures=%d, min_matches=%d, "
            "ransac_reproj_thresh=%.1f, ransac_max_iters=%d",
            self.config.nfeatures,
            self.config.min_matches,
            self.config.ransac_reproj_thresh,
            self.config.ransac_max_iters,
        )

    def register(
        self, reference: np.ndarray, current: np.ndarray
    ) -> tuple[np.ndarray, np.ndarray]:
        """
        Align 'current' to 'reference' using ORB + RANSAC homography.

        Args:
            reference: Reference frame (grayscale or BGR).
            current: Current frame to align (grayscale or BGR).

        Returns:
            Tuple of (H, aligned_current):
                H: 3x3 homography matrix (identity if insufficient matches).
                aligned_current: Current frame warped to reference frame coordinates.
                                 Same shape as reference if successful, otherwise
                                 same shape as current (unmodified).
        """
        # Convert to grayscale if needed
        if len(reference.shape) == 3:
            ref_gray = cv2.cvtColor(reference, cv2.COLOR_BGR2GRAY)
        else:
            ref_gray = reference

        if len(current.shape) == 3:
            cur_gray = cv2.cvtColor(current, cv2.COLOR_BGR2GRAY)
        else:
            cur_gray = current

        # 1. Detect keypoints + descriptors in both images
        kp1, des1 = self.orb.detectAndCompute(ref_gray, None)
        kp2, des2 = self.orb.detectAndCompute(cur_gray, None)

        # Handle case where no features are found
        if des1 is None or des2 is None or len(kp1) == 0 or len(kp2) == 0:
            logger.warning("No ORB features detected in one or both images; using identity fallback")
            return self._identity_fallback(reference, current)

        # 2. Match descriptors using BFMatcher with crossCheck
        matches = self.matcher.match(des1, des2)

        # 3. Sort matches by distance (best first)
        matches = sorted(matches, key=lambda m: m.distance)

        # 4. Filter matches - keep good matches
        # Optional: ratio test (Lowe's ratio test) - but crossCheck already filters
        good_matches = matches

        total_matches = len(matches)
        good_count = len(good_matches)

        logger.debug("ORB matches: total=%d, good=%d", total_matches, good_count)

        # 5. Check if we have enough matches for RANSAC
        if good_count < self.config.min_matches:
            logger.warning(
                "Insufficient matches (%d < %d); using identity fallback",
                good_count,
                self.config.min_matches,
            )
            return self._identity_fallback(reference, current)

        # 6. Extract matched keypoint coordinates
        src_pts = np.float32([kp1[m.queryIdx].pt for m in good_matches]).reshape(-1, 1, 2)
        dst_pts = np.float32([kp2[m.trainIdx].pt for m in good_matches]).reshape(-1, 1, 2)

        # 7. Find homography using RANSAC
        H, mask = cv2.findHomography(
            dst_pts,
            src_pts,
            cv2.RANSAC,
            ransacReprojThreshold=self.config.ransac_reproj_thresh,
            maxIters=self.config.ransac_max_iters,
        )

        if H is None:
            logger.warning("RANSAC failed to find homography; using identity fallback")
            return self._identity_fallback(reference, current)

        # 8. Count inliers
        inliers = int(np.sum(mask)) if mask is not None else 0
        inlier_ratio = inliers / good_count if good_count > 0 else 0.0

        logger.info(
            "Registration successful: matches=%d, inliers=%d, inlier_ratio=%.2f",
            good_count,
            inliers,
            inlier_ratio,
        )

        # 9. Warp current frame to reference frame
        h_ref, w_ref = ref_gray.shape[:2]
        aligned = cv2.warpPerspective(current, H, (w_ref, h_ref))

        return H, aligned

    def _identity_fallback(
        self, reference: np.ndarray, current: np.ndarray
    ) -> tuple[np.ndarray, np.ndarray]:
        """
        Return identity homography and unmodified current frame.

        Args:
            reference: Reference frame.
            current: Current frame.

        Returns:
            (identity_matrix, current_frame)
        """
        H = np.eye(3, dtype=np.float64)
        return H, current.copy()

    def draw_matches(
        self,
        reference: np.ndarray,
        current: np.ndarray,
        kp1: list[cv2.KeyPoint],
        kp2: list[cv2.KeyPoint],
        matches: list[cv2.DMatch],
    ) -> np.ndarray:
        """
        Debug: draw matches for visualization.

        Args:
            reference: Reference frame.
            current: Current frame.
            kp1: Keypoints from reference.
            kp2: Keypoints from current.
            matches: Matches to draw.

        Returns:
            Image with matches drawn.
        """
        return cv2.drawMatches(
            reference,
            kp1,
            current,
            kp2,
            matches[:50],  # Limit to top 50 for visibility
            None,
            flags=cv2.DrawMatchesFlags_NOT_DRAW_SINGLE_POINTS,
        )

"""
Image registration module for ARGOS SLOPE 4.0.

Performs feature-based image registration between consecutive daily images
using OpenCV (SIFT/ORB) feature matching and homography estimation.
Produces a warped overlay of yesterday's image aligned to today's perspective
for deformation analysis.
"""

from __future__ import annotations

from typing import Optional

import cv2
import numpy as np


def register_images(
    image_path_today: str,
    image_path_yesterday: str,
    feature_method: str = "sift",
    max_features: int = 5000,
    match_ratio: float = 0.75,
    ransac_threshold: float = 5.0,
) -> dict:
    """
    Register two slope images using feature matching and compute homography.

    Steps:
        1. Load both images as grayscale
        2. Detect keypoints and descriptors using SIFT or ORB
        3. Match features using brute-force matcher
        4. Compute homography with RANSAC
        5. Warp yesterday's image to today's perspective
        6. Generate blended overlay

    Args:
        image_path_today: Path to the most recent image.
        image_path_yesterday: Path to the previous day's image.
        feature_method: Feature detector — ``"sift"`` (default) or ``"orb"``.
        max_features: Maximum number of keypoints to detect (default 5000).
        match_ratio: Lowe's ratio for good match filtering (default 0.75).
        ransac_threshold: RANSAC reprojection threshold in pixels (default 5.0).

    Returns:
        Dictionary with:
            - ``homography``: 3×3 homography matrix as list of lists
            - ``matches_count``: Number of good feature matches
            - ``inliers_count``: Number of inlier matches after RANSAC
            - ``overlay``: Blended overlay image (numpy array)
            - ``warped_image``: Yesterday's image warped to today's perspective
            - ``error``: Error message if registration fails (absent on success)

    Raises:
        ValueError: If images cannot be read, descriptors are empty, or
            not enough matches for homography.
        FileNotFoundError: If either image path does not exist.
    """
    # ── Load images ──────────────────────────────────────────────────
    img_today = cv2.imread(image_path_today, cv2.IMREAD_GRAYSCALE)
    img_yesterday = cv2.imread(image_path_yesterday, cv2.IMREAD_GRAYSCALE)

    if img_today is None:
        raise FileNotFoundError(f"Cannot read today's image: {image_path_today}")
    if img_yesterday is None:
        raise FileNotFoundError(
            f"Cannot read yesterday's image: {image_path_yesterday}"
        )

    # ── Detect keypoints and descriptors ─────────────────────────────
    if feature_method.lower() == "orb":
        detector = cv2.ORB_create(nfeatures=max_features)
        kp1, des1 = detector.detectAndCompute(img_today, None)
        kp2, des2 = detector.detectAndCompute(img_yesterday, None)
        matcher = cv2.BFMatcher(cv2.NORM_HAMMING, crossCheck=True)
    else:
        # Default: SIFT
        detector = cv2.SIFT_create(nfeatures=max_features)
        kp1, des1 = detector.detectAndCompute(img_today, None)
        kp2, des2 = detector.detectAndCompute(img_yesterday, None)
        matcher = cv2.BFMatcher(cv2.NORM_L2, crossCheck=True)

    if des1 is None or des2 is None or len(des1) < 2 or len(des2) < 2:
        raise ValueError(
            "Could not compute descriptors — insufficient features in one or both images"
        )

    # ── Feature matching ─────────────────────────────────────────────
    matches = matcher.match(des1, des2)  # type: ignore[arg-type]
    matches = sorted(matches, key=lambda m: m.distance)

    good_matches = matches[: max(1, int(len(matches) * match_ratio))]

    if len(good_matches) < 4:
        raise ValueError(
            f"Not enough matches for homography (found {len(good_matches)}, need ≥ 4)"
        )

    # ── Homography estimation ────────────────────────────────────────
    src_pts = np.float32([kp1[m.queryIdx].pt for m in good_matches]).reshape(
        -1, 1, 2
    )
    dst_pts = np.float32([kp2[m.trainIdx].pt for m in good_matches]).reshape(
        -1, 1, 2
    )

    homography, mask = cv2.findHomography(
        src_pts, dst_pts, cv2.RANSAC, ransac_threshold
    )

    if homography is None:
        raise ValueError("Could not compute homography — RANSAC failed to converge")

    # ── Warp and overlay ─────────────────────────────────────────────
    h, w = img_today.shape
    warped = cv2.warpPerspective(img_yesterday, homography, (w, h))
    overlay = cv2.addWeighted(img_today, 0.5, warped, 0.5, 0)

    return {
        "homography": homography.tolist(),
        "matches_count": len(good_matches),
        "inliers_count": int(np.sum(mask)),
        "overlay": overlay,
        "warped_image": warped,
    }


def compute_homography_from_points(
    src_points: list[tuple[float, float]],
    dst_points: list[tuple[float, float]],
    method: int = cv2.RANSAC,
    threshold: float = 5.0,
) -> Optional[np.ndarray]:
    """
    Compute homography matrix from known point correspondences.

    Useful for testing and for manual ground-control-point registration.

    Args:
        src_points: Source image points [(x1,y1), (x2,y2), ...].
        dst_points: Destination image points matching src_points order.
        method: OpenCV homography method (default cv2.RANSAC).
        threshold: RANSAC reprojection threshold (default 5.0).

    Returns:
        3×3 homography matrix as numpy array, or None if computation fails.

    Raises:
        ValueError: If fewer than 4 point pairs are provided.
    """
    if len(src_points) < 4 or len(dst_points) < 4:
        raise ValueError("At least 4 point correspondences required for homography")

    src = np.float32(src_points).reshape(-1, 1, 2)
    dst = np.float32(dst_points).reshape(-1, 1, 2)

    homography, _ = cv2.findHomography(src, dst, method, threshold)
    return homography

"""
Tests for ARGOS SLOPE 4.0 backend services and API endpoints.

Covers:
    - T1.1: Image registration with known points returns correct homography
    - T1.2: Deformation velocity for known displacement
    - T1.3: RQD with known input (including blocks < 10cm ignored)
    - T1.4: Δ > threshold returns is_critical=true
    - T1.5: Pixel to mm with known Z/f values
    - API endpoint integration via TestClient
"""

from __future__ import annotations

import math
from typing import Generator

import cv2
import numpy as np
import pytest
from fastapi.testclient import TestClient

from backend.main import app
from backend.services import deformation, growth_alert, image_registration, rqd


# ══════════════════════════════════════════════════════════════════════
# Fixtures
# ══════════════════════════════════════════════════════════════════════


@pytest.fixture
def client() -> Generator[TestClient, None, None]:
    """FastAPI TestClient fixture."""
    with TestClient(app) as c:
        yield c


@pytest.fixture
def synthetic_images(tmp_path) -> tuple[str, str]:
    """
    Create two synthetic images with a known translation for testing
    image registration.

    Returns:
        Tuple of (image1_path, image2_path) where image2 is image1
        translated by (5, 3) pixels.
    """
    size = (200, 200)
    # Image 1: white circle on black background
    img1 = np.zeros(size, dtype=np.uint8)
    cv2.circle(img1, (100, 100), 40, 255, -1)
    # Add some noise-like features
    for _ in range(20):
        cx, cy = np.random.randint(20, 180, 2).tolist()
        cv2.circle(img1, (cx, cy), np.random.randint(3, 8), 200, -1)

    # Image 2: same image translated by (5, 3)
    translation = np.float32([[1, 0, 5], [0, 1, 3]])
    img2 = cv2.warpAffine(img1, translation, size)

    path1 = str(tmp_path / "img_yesterday.png")
    path2 = str(tmp_path / "img_today.png")
    cv2.imwrite(path1, img1)
    cv2.imwrite(path2, img2)

    return path1, path2


# ══════════════════════════════════════════════════════════════════════
# T1.1: Image Registration
# ══════════════════════════════════════════════════════════════════════


class TestImageRegistration:
    """Image registration with known transformations."""

    def test_homography_from_known_points(self):
        """
        T1.1: Known point correspondences produce correct homography.
        """
        src_points = [(0, 0), (100, 0), (100, 100), (0, 100)]
        dst_points = [(10, 5), (110, 5), (110, 105), (10, 105)]

        H = image_registration.compute_homography_from_points(
            src_points, dst_points
        )

        assert H is not None, "Homography should not be None"
        assert H.shape == (3, 3), "Homography must be 3×3"

        # Verify: transform src points and compare to dst
        for src, expected_dst in zip(src_points, dst_points):
            src_h = np.array([[*src, 1.0]])
            result = H @ src_h.T  # shape (3, 1)
            result = result / result[2, 0]
            rx = round(float(result[0, 0]), 1)
            ry = round(float(result[1, 0]), 1)
            assert (rx, ry) == expected_dst, (
                f"Point {src} → ({rx}, {ry}), expected {expected_dst}"
            )

    def test_synthetic_image_registration(self, synthetic_images):
        """
        T1.1: Registration of synthetic translated images returns
        homography with expected translation.
        """
        path_yesterday, path_today = synthetic_images

        result = image_registration.register_images(
            image_path_today=path_today,
            image_path_yesterday=path_yesterday,
        )

        assert "homography" in result, "Result must contain homography"
        assert result["matches_count"] >= 4, "Should have at least 4 matches"
        assert result["inliers_count"] >= 4, "Should have at least 4 inliers"

        H = np.array(result["homography"])
        # For a pure translation, H[0,2] ≈ 5 and H[1,2] ≈ 3 (or close,
        # depending on feature distribution)
        tx = H[0, 2]
        ty = H[1, 2]
        # Allow some tolerance since feature-based matching may vary.
        # The sign may be inverted depending on match direction.
        assert abs(abs(tx) - 5) < 3 and abs(abs(ty) - 3) < 3, (
            f"Translation magnitude should be ≈(5,3), got ({tx:.1f}, {ty:.1f})"
        )

    def test_registration_missing_image(self):
        """Registration with non-existent image raises error."""
        with pytest.raises(FileNotFoundError):
            image_registration.register_images(
                image_path_today="/nonexistent/today.png",
                image_path_yesterday="/nonexistent/yesterday.png",
            )


# ══════════════════════════════════════════════════════════════════════
# T1.2: Deformation Velocity
# ══════════════════════════════════════════════════════════════════════


class TestDeformationVelocity:
    """Deformation velocity for known displacement."""

    def test_velocity_known_values(self):
        """
        T1.2: Known displacement produces correct velocity.

        With: displacement_px=10, days=2, Z=10m, f=50mm
        D_real = 10 × (10000/50) = 2000 mm
        Velocity = 2000 / 2 = 1000 mm/day
        """
        result = deformation.calculate_velocity(
            displacement_px=10,
            days_elapsed=2,
            z=10,
            f=50,
        )

        assert result["displacement_mm"] == 2000.0
        assert result["velocity_mm_per_day"] == 1000.0

    def test_velocity_zero_displacement(self):
        """Zero displacement produces zero velocity."""
        result = deformation.calculate_velocity(
            displacement_px=0,
            days_elapsed=1,
            z=10,
            f=50,
        )

        assert result["displacement_mm"] == 0.0
        assert result["velocity_mm_per_day"] == 0.0

    def test_velocity_invalid_inputs(self):
        """Invalid inputs raise ValueError."""
        with pytest.raises(ValueError, match="days_elapsed must be > 0"):
            deformation.calculate_velocity(
                displacement_px=10, days_elapsed=0, z=10, f=50
            )

        with pytest.raises(ValueError, match="z.*must be > 0"):
            deformation.calculate_velocity(
                displacement_px=10, days_elapsed=1, z=0, f=50
            )

        with pytest.raises(ValueError, match="f.*must be > 0"):
            deformation.calculate_velocity(
                displacement_px=10, days_elapsed=1, z=10, f=0
            )

    def test_velocity_different_z_f_values(self):
        """
        T1.5: Pixel to mm with known Z/f values.

        D_real = D_pixel × (Z_mm / f_mm)
        Z=5m=5000mm, f=25mm → ratio=200
        displacement_px=3 → D_real=600mm
        """
        result = deformation.calculate_velocity(
            displacement_px=3,
            days_elapsed=1,
            z=5,
            f=25,
        )

        expected_mm = 3 * (5000 / 25)  # = 600
        assert result["displacement_mm"] == expected_mm
        assert result["velocity_mm_per_day"] == expected_mm


# ══════════════════════════════════════════════════════════════════════
# T1.3: RQD Calculation
# ══════════════════════════════════════════════════════════════════════


class TestRQD:
    """RQD calculation with known inputs and edge cases."""

    def test_rqd_with_below_threshold_blocks(self):
        """
        T1.3: RQD with blocks < 10cm correctly ignored.

        Pieces: [30, 8, 45, 6, 12] cm, core_length=1.5m
        Pieces ≥ 10cm: [30, 45, 12] → sum = 87cm
        RQD = 87/150 × 100 = 58.0%
        """
        result = rqd.calculate_rqd(
            piece_lengths_cm=[30, 8, 45, 6, 12],
            core_length_m=1.5,
        )

        assert result["rqd_percent"] == 58.0
        assert result["intact_pieces_count"] == 3
        assert result["pieces_below_threshold"] == 2
        assert result["total_intact_length_cm"] == 87.0

    def test_rqd_all_above_threshold(self):
        """All pieces ≥ 10cm → RQD = 100%."""
        result = rqd.calculate_rqd(
            piece_lengths_cm=[50, 50, 50],
            core_length_m=1.5,
        )

        assert result["rqd_percent"] == 100.0

    def test_rqd_none_above_threshold(self):
        """No pieces ≥ 10cm → RQD = 0%."""
        result = rqd.calculate_rqd(
            piece_lengths_cm=[3, 5, 2, 8, 4],
            core_length_m=1.5,
        )

        assert result["rqd_percent"] == 0.0
        assert result["intact_pieces_count"] == 0

    def test_rqd_zero_length_error(self):
        """core_length=0 raises ValueError."""
        with pytest.raises(ValueError, match="core_length_m must be > 0"):
            rqd.calculate_rqd(
                piece_lengths_cm=[10, 20],
                core_length_m=0,
            )

    def test_rqd_empty_pieces(self):
        """Empty piece list raises ValueError."""
        with pytest.raises(ValueError, match="piece_lengths_cm must not be empty"):
            rqd.calculate_rqd(
                piece_lengths_cm=[],
                core_length_m=1.0,
            )

    def test_rqd_simple_fracture_count(self):
        """
        Simplified RQD API endpoint model.
        fracture_count=3, core_length=1.5 → RQD = 20.0%
        (3 intact pieces × 10cm ÷ 150cm × 100 = 20%)
        """
        result = rqd.calculate_rqd_simple(
            fracture_count=3, core_length=1.5
        )

        assert result == 20.0


# ══════════════════════════════════════════════════════════════════════
# T1.4: Growth Alert
# ══════════════════════════════════════════════════════════════════════


class TestGrowthAlert:
    """Growth alert threshold checking."""

    def test_critical_growth_exceeds_threshold(self):
        """
        T1.4: Δ > threshold returns is_critical=true.

        Measurements: [10.0, 10.5, 11.0, 11.8]
        Δ = ((11.8 - 10.0) / 10.0) × 100 = 18.0%
        18.0 > 5.0 → critical
        """
        result = growth_alert.check_growth(
            measurements_mm=[10.0, 10.5, 11.0, 11.8],
        )

        assert result["is_critical"] is True
        assert result["delta_percent"] == 18.0

    def test_non_critical_growth(self):
        """
        Δ below threshold returns is_critical=false.

        Measurements: [10.0, 10.2, 10.3]
        Δ = ((10.3 - 10.0) / 10.0) × 100 = 3.0%
        3.0 ≤ 5.0 → not critical
        """
        result = growth_alert.check_growth(
            measurements_mm=[10.0, 10.2, 10.3],
        )

        assert result["is_critical"] is False
        assert result["delta_percent"] == 3.0

    def test_critical_with_custom_threshold(self):
        """Custom threshold (3%) triggers critical correctly."""
        result = growth_alert.check_growth(
            measurements_mm=[10.0, 10.0, 10.0, 10.4],
            threshold_percent=3.0,
        )

        assert result["is_critical"] is True
        assert result["delta_percent"] == 4.0

    def test_exactly_at_threshold_not_critical(self):
        """Delta exactly at threshold (not exceeding) is not critical."""
        result = growth_alert.check_growth(
            measurements_mm=[10.0, 10.5],
            threshold_percent=5.0,
        )

        # Δ = 5.0%, threshold = 5.0%, 5.0 > 5.0 is False
        assert result["is_critical"] is False
        assert result["delta_percent"] == 5.0

    def test_insufficient_measurements(self):
        """Fewer than 2 measurements raises ValueError."""
        with pytest.raises(ValueError, match="At least 2 measurements required"):
            growth_alert.check_growth(measurements_mm=[10.0])

    def test_negative_change_decrease(self):
        """Negative Δ (decreasing crack) is never critical."""
        result = growth_alert.check_growth(
            measurements_mm=[10.0, 9.5, 9.0],
        )

        assert result["is_critical"] is False
        assert result["delta_percent"] == -10.0


# ══════════════════════════════════════════════════════════════════════
# T1.5: Pixel to mm Conversion (also in TestDeformationVelocity)
# ══════════════════════════════════════════════════════════════════════


class TestPixelToMM:
    """Pixel to mm conversion with known reference values."""

    def test_pixels_to_mm_simple(self):
        """
        T1.5: Pixel to mm with known values.

        pixels=150, reference_mm=10, reference_pixels=50
        length_mm = 150 × (10/50) = 30.0
        """
        result = deformation.pixels_to_mm(
            pixels=150,
            reference_mm=10,
            reference_pixels=50,
        )

        assert result == 30.0

    def test_pixels_to_mm_one_to_one(self):
        """1:1 pixel-to-mm ratio."""
        result = deformation.pixels_to_mm(
            pixels=100,
            reference_mm=1,
            reference_pixels=1,
        )

        assert result == 100.0

    def test_pixels_to_mm_invalid_reference(self):
        """Zero reference raises ValueError."""
        with pytest.raises(ValueError, match="reference_pixels must be > 0"):
            deformation.pixels_to_mm(pixels=10, reference_mm=10, reference_pixels=0)


# ══════════════════════════════════════════════════════════════════════
# API Endpoint Integration Tests
# ══════════════════════════════════════════════════════════════════════


class TestAPIEndpoints:
    """Integration tests for FastAPI endpoints via TestClient."""

    def test_health_endpoint(self, client):
        """GET /api/health returns ok status."""
        response = client.get("/api/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "ok"

    def test_rqd_endpoint_happy_path(self, client):
        """GET /api/rqd?fracture_count=3&core_length=1.5 → 20.0%."""
        response = client.get("/api/rqd", params={
            "fracture_count": 3,
            "core_length": 1.5,
        })
        assert response.status_code == 200
        data = response.json()
        assert data["rqd_percent"] == 20.0

    def test_rqd_endpoint_zero_length(self, client):
        """core_length=0 → HTTP 400."""
        response = client.get("/api/rqd", params={
            "fracture_count": 3,
            "core_length": 0,
        })
        assert response.status_code == 400
        data = response.json()
        assert "error" in data

    def test_convert_endpoint(self, client):
        """POST /api/convert → length_mm calculation."""
        response = client.post("/api/convert", json={
            "pixels": 150,
            "reference_mm": 10,
            "reference_pixels": 50,
        })
        assert response.status_code == 200
        data = response.json()
        assert data["length_mm"] == 30.0

    def test_convert_invalid_input(self, client):
        """POST /api/convert with invalid input → 400."""
        response = client.post("/api/convert", json={
            "pixels": -1,
            "reference_mm": 10,
            "reference_pixels": 50,
        })
        assert response.status_code == 400

    def test_growth_alert_critical(self, client):
        """POST /api/growth/alert → is_critical=True."""
        response = client.post("/api/growth/alert", json={
            "measurements_mm": [10.0, 10.5, 11.0, 11.8],
        })
        assert response.status_code == 200
        data = response.json()
        assert data["is_critical"] is True
        assert data["delta_percent"] == 18.0

    def test_growth_alert_non_critical(self, client):
        """POST /api/growth/alert → is_critical=False."""
        response = client.post("/api/growth/alert", json={
            "measurements_mm": [10.0, 10.2, 10.3],
        })
        assert response.status_code == 200
        data = response.json()
        assert data["is_critical"] is False
        assert data["delta_percent"] == 3.0

    def test_growth_alert_insufficient_data(self, client):
        """POST /api/growth/alert with 1 measurement → 400."""
        response = client.post("/api/growth/alert", json={
            "measurements_mm": [10.0],
        })
        assert response.status_code == 400

    def test_deformation_velocity_endpoint(self, client):
        """POST /deformation/velocity → correct displacement."""
        response = client.post("/api/deformation/velocity", json={
            "displacement_px": 10,
            "days_elapsed": 2,
            "z": 10,
            "f": 50,
        })
        assert response.status_code == 200
        data = response.json()
        assert data["displacement_mm"] == 2000.0
        assert data["velocity_mm_per_day"] == 1000.0

    def test_root_endpoint(self, client):
        """GET / returns service info."""
        response = client.get("/")
        assert response.status_code == 200
        data = response.json()
        assert "service" in data
        assert "endpoints" in data

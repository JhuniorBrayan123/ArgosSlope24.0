"""
FastAPI router for ARGOS SLOPE 4.0 deformation engine endpoints.

Provides REST endpoints for RQD calculation, pixel-to-mm conversion,
growth alert evaluation, image registration, and deformation velocity.
All endpoints return HTTP 400 with ``{"error": "message"}`` on invalid input.
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query

from backend.models.schemas import (
    ConvertRequest,
    ConvertResponse,
    ErrorResponse,
    GrowthAlertRequest,
    GrowthAlertResponse,
    RegistrationRequest,
    RegistrationResponse,
    RQDResponse,
    VelocityRequest,
    VelocityResponse,
)
from backend.services import deformation, growth_alert, image_registration, rqd

router = APIRouter(prefix="/api", tags=["Deformation Engine"])


# ──────────────────────────────────────────────
# RQD — Rock Quality Designation
# ──────────────────────────────────────────────


@router.get(
    "/rqd",
    response_model=RQDResponse,
    summary="Calculate RQD from fracture count",
    description="Compute Rock Quality Designation using simplified fracture-count model.",
)
async def get_rqd(
    fracture_count: int = Query(
        ..., ge=0, description="Number of fractures counted in the core section"
    ),
    core_length: float = Query(
        ..., gt=0, description="Total core length in meters"
    ),
):
    """
    Calculate RQD percentage.

    Uses the simplified model where fracture_count represents the number
    of intact pieces at the minimum block size (10 cm). Remaining core
    material is treated as broken fragments below threshold.
    """
    if core_length <= 0:
        raise HTTPException(
            status_code=400,
            detail=ErrorResponse(error="core_length must be > 0").model_dump(),
        )
    if fracture_count < 0:
        raise HTTPException(
            status_code=400,
            detail=ErrorResponse(error="fracture_count must be >= 0").model_dump(),
        )

    try:
        rqd_value = rqd.calculate_rqd_simple(
            fracture_count=fracture_count, core_length=core_length
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=400,
            detail=ErrorResponse(error=str(exc)).model_dump(),
        ) from exc

    return RQDResponse(rqd_percent=rqd_value)


# ──────────────────────────────────────────────
# Convert — Pixel to mm conversion
# ──────────────────────────────────────────────


@router.post(
    "/convert",
    response_model=ConvertResponse,
    summary="Convert pixels to mm",
    description="Convert pixel measurements to mm using a known reference object.",
)
async def convert_pixels_to_mm(request: ConvertRequest):
    """
    Convert pixel measurements to physical mm.

    Formula: length_mm = pixels × (reference_mm / reference_pixels)
    """
    try:
        length_mm = deformation.pixels_to_mm(
            pixels=request.pixels,
            reference_mm=request.reference_mm,
            reference_pixels=request.reference_pixels,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=400,
            detail=ErrorResponse(error=str(exc)).model_dump(),
        ) from exc

    return ConvertResponse(length_mm=length_mm)


# ──────────────────────────────────────────────
# Growth Alert — Check crack growth threshold
# ──────────────────────────────────────────────


@router.post(
    "/growth/alert",
    response_model=GrowthAlertResponse,
    summary="Check crack growth alert",
    description="Evaluate whether crack growth Δ exceeds the critical threshold.",
)
async def check_growth_alert(request: GrowthAlertRequest):
    """
    Evaluate crack growth and flag critical alerts.

    Δ = ((last - first) / first) × 100
    Critical if Δ > threshold_percent (default 5%).
    """
    try:
        result = growth_alert.check_growth(
            measurements_mm=request.measurements_mm,
            threshold_percent=request.threshold_percent,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=400,
            detail=ErrorResponse(error=str(exc)).model_dump(),
        ) from exc

    return GrowthAlertResponse(
        is_critical=result["is_critical"],
        delta_percent=result["delta_percent"],
    )


# ──────────────────────────────────────────────
# Deformation Velocity
# ──────────────────────────────────────────────


@router.post(
    "/deformation/velocity",
    response_model=VelocityResponse,
    summary="Calculate deformation velocity",
    description="Compute real-world displacement and velocity from pixel displacement using D = D_px × (Z/f).",
)
async def deformation_velocity(request: VelocityRequest):
    """
    Calculate deformation velocity from pixel displacement.

    D_real = D_pixel × (Z_mm / f_mm)
    Velocity = D_real / days_elapsed (mm/day)
    """
    try:
        result = deformation.calculate_velocity(
            displacement_px=request.displacement_px,
            days_elapsed=request.days_elapsed,
            z=request.z,
            f=request.f,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=400,
            detail=ErrorResponse(error=str(exc)).model_dump(),
        ) from exc

    return VelocityResponse(
        displacement_mm=result["displacement_mm"],
        velocity_mm_per_day=result["velocity_mm_per_day"],
    )


# ──────────────────────────────────────────────
# Image Registration
# ──────────────────────────────────────────────


@router.post(
    "/deformation/register",
    response_model=RegistrationResponse,
    summary="Register two slope images",
    description="Perform feature-based image registration between consecutive daily images.",
)
async def register_deformation_images(request: RegistrationRequest):
    """
    Register today's and yesterday's images.

    Computes SIFT/ORB feature matching, homography estimation, and
    produces a warped overlay for deformation analysis.
    """
    try:
        result = image_registration.register_images(
            image_path_today=request.image_path_today,
            image_path_yesterday=request.image_path_yesterday,
        )
    except (FileNotFoundError, ValueError) as exc:
        raise HTTPException(
            status_code=400,
            detail=ErrorResponse(error=str(exc)).model_dump(),
        ) from exc

    return RegistrationResponse(
        status="success",
        homography=result["homography"],
        matches_count=result["matches_count"],
        inliers_count=result["inliers_count"],
        message=f"Registration successful: {result['matches_count']} matches, {result['inliers_count']} inliers",
    )


# ──────────────────────────────────────────────
# Health Check
# ──────────────────────────────────────────────


@router.get(
    "/health",
    summary="Health check",
    description="Returns service status.",
)
async def health_check():
    """Simple health check endpoint."""
    return {"status": "ok", "service": "argos-slope-deformation-engine"}

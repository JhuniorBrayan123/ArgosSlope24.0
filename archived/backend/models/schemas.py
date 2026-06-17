"""
Pydantic schemas for the ARGOS SLOPE 4.0 deformation monitoring API.

Provides request/response models for all endpoints including deformation
velocity, image registration, RQD calculation, and growth alerts.
"""

from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


# ──────────────────────────────────────────────
# Domain Models
# ──────────────────────────────────────────────


class ImageMetadata(BaseModel):
    """Metadata associated with a slope monitoring image."""

    image_id: str
    timestamp: datetime
    camera_focal_mm: float = Field(..., gt=0, description="Camera focal length in mm")
    sensor_distance_m: float = Field(
        ..., gt=0, description="Distance from camera to slope face (Z) in meters"
    )
    gps_latitude: Optional[float] = Field(None, description="GPS latitude")
    gps_longitude: Optional[float] = Field(None, description="GPS longitude")
    roi_x: Optional[int] = Field(None, ge=0, description="ROI top-left X in pixels")
    roi_y: Optional[int] = Field(None, ge=0, description="ROI top-left Y in pixels")
    roi_width: Optional[int] = Field(None, gt=0, description="ROI width in pixels")
    roi_height: Optional[int] = Field(None, gt=0, description="ROI height in pixels")


class CrackMeasurement(BaseModel):
    """Measured dimensions of a detected crack."""

    crack_id: str
    length_mm: float = Field(..., ge=0, description="Crack length in mm")
    width_mm: float = Field(..., ge=0, description="Average crack width in mm")
    area_mm2: float = Field(..., ge=0, description="Crack area in mm²")
    classification: str = Field(
        ..., description="Crack type: fina (<0.3mm), media (0.3-1mm), gruesa (>1mm)"
    )
    timestamp: datetime
    roi_center_x: int = Field(..., description="ROI center X in pixels")
    roi_center_y: int = Field(..., description="ROI center Y in pixels")


class DeformationResult(BaseModel):
    """Result of deformation velocity calculation for a crack."""

    crack_id: str
    displacement_px: float = Field(..., ge=0, description="Displacement in pixels")
    displacement_mm: float = Field(..., ge=0, description="Real displacement in mm")
    velocity_mm_per_day: float = Field(..., description="Velocity in mm/day")
    delta_percent: float = Field(..., description="Growth delta percentage")
    is_critical: bool = Field(
        ..., description="Whether delta exceeds critical threshold"
    )
    homography_confidence: Optional[float] = Field(
        None, ge=0, le=1.0, description="Homography match confidence"
    )


class AlertConfig(BaseModel):
    """Configuration parameters for alert thresholds."""

    delta_threshold_percent: float = Field(
        default=5.0, gt=0, description="Growth delta threshold before alert (%)"
    )
    min_rqd_block_cm: float = Field(
        default=10.0, gt=0, description="Minimum intact block length for RQD (cm)"
    )
    critical_growth_percent: float = Field(
        default=5.0,
        gt=0,
        description="Growth percentage triggering critical alert",
    )
    polling_interval_seconds: int = Field(
        default=30, gt=0, description="Dashboard polling interval"
    )


# ──────────────────────────────────────────────
# Request Models
# ──────────────────────────────────────────────


class RQDRequest(BaseModel):
    """Request model for RQD calculation endpoint."""

    piece_lengths_cm: list[float] = Field(
        ..., description="Lengths of intact core pieces in cm"
    )
    core_length_m: float = Field(
        ..., gt=0, description="Total core length in meters"
    )


class RQDFractureRequest(BaseModel):
    """Simplified RQD request using fracture count (GET /api/rqd)."""

    fracture_count: int = Field(..., ge=0, description="Number of fractures counted")
    core_length: float = Field(..., gt=0, description="Total core length in meters")


class ConvertRequest(BaseModel):
    """Request model for pixel-to-mm conversion."""

    pixels: float = Field(..., gt=0, description="Measured length in pixels")
    reference_mm: float = Field(..., gt=0, description="Known reference length in mm")
    reference_pixels: float = Field(
        ..., gt=0, description="Known reference length in pixels"
    )


class GrowthAlertRequest(BaseModel):
    """Request model for growth alert checking."""

    measurements_mm: list[float] = Field(
        ..., min_length=2, description="Chronological crack measurements in mm"
    )
    threshold_percent: float = Field(
        default=5.0, gt=0, description="Critical growth threshold (%)"
    )


class VelocityRequest(BaseModel):
    """Request model for deformation velocity calculation."""

    displacement_px: float = Field(
        ..., ge=0, description="Pixel displacement between frames"
    )
    days_elapsed: float = Field(
        ..., gt=0, description="Days between measurements"
    )
    z: float = Field(
        ..., gt=0, description="Camera-to-object distance (Z) in meters"
    )
    f: float = Field(
        ..., gt=0, description="Camera focal length in mm"
    )


class RegistrationRequest(BaseModel):
    """Request model for image registration."""

    image_path_today: str = Field(..., description="Path to today's image")
    image_path_yesterday: str = Field(..., description="Path to yesterday's image")


# ──────────────────────────────────────────────
# Response Models
# ──────────────────────────────────────────────


class RQDResponse(BaseModel):
    """Response model for RQD calculation."""

    rqd_percent: float = Field(..., description="Rock Quality Designation (%)")


class ConvertResponse(BaseModel):
    """Response model for pixel-to-mm conversion."""

    length_mm: float = Field(..., description="Converted length in mm")


class GrowthAlertResponse(BaseModel):
    """Response model for growth alert check."""

    is_critical: bool = Field(..., description="Whether growth exceeds threshold")
    delta_percent: float = Field(..., description="Calculated growth delta (%)")


class VelocityResponse(BaseModel):
    """Response model for deformation velocity."""

    displacement_mm: float = Field(..., description="Real displacement in mm")
    velocity_mm_per_day: float = Field(
        ..., description="Deformation velocity in mm/day"
    )


class RegistrationResponse(BaseModel):
    """Response model for image registration."""

    status: str = Field(..., description="Registration status")
    homography: Optional[list[list[float]]] = Field(
        None, description="3×3 homography matrix"
    )
    matches_count: int = Field(0, description="Number of feature matches")
    inliers_count: int = Field(0, description="Number of inlier matches")
    message: str = Field("", description="Status message")


class ErrorResponse(BaseModel):
    """Standard error response body."""

    error: str = Field(..., description="Error description")


# ──────────────────────────────────────────────
# Dashboard / Fisura Response Models
# ──────────────────────────────────────────────


class FisuraResponse(BaseModel):
    """Public representation of a fissure for the API."""

    id: int
    roi_id: str
    fecha_deteccion: datetime
    largo_mm: float
    ancho_mm: float
    area_mm2: float
    orientacion: Optional[str] = None
    tipo: Optional[str] = None
    coordenadas: Optional[str] = None
    imagen_original: Optional[str] = None
    imagen_segmentada: Optional[str] = None


class MedicionResponse(BaseModel):
    """Public representation of a daily measurement."""

    id: int
    fisura_id: int
    fecha: datetime
    largo_mm: float
    ancho_mm: float
    area_mm2: float
    delta_porcentaje: Optional[float] = None
    es_critica: bool


class AlertaResponse(BaseModel):
    """Public representation of an alert."""

    id: int
    fisura_id: Optional[int] = None
    fecha: datetime
    tipo: str
    mensaje: str
    umbral_superado: float
    valor_actual: float
    reconocida: bool


class ConfigResponse(BaseModel):
    """Public representation of a configuration entry."""

    clave: str
    valor: str
    descripcion: Optional[str] = None


class ResumenResponse(BaseModel):
    """Dashboard summary statistics."""

    total_fisuras: int
    alertas_criticas: int
    rpi_conectada: bool
    deformacion_promedio: float


class FisuraDetalleResponse(BaseModel):
    """Detailed fissure information including its measurements."""

    fisura: FisuraResponse
    mediciones: list[MedicionResponse]
    total_mediciones: int
    alertas: list[AlertaResponse]


class ValorConfigRequest(BaseModel):
    """Request body to update a single configuration value."""

    valor: str = Field(..., description="New value for the configuration key")

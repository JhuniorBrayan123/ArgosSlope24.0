"""
FastAPI router for ARGOS SLOPE 4.0 deformation engine endpoints.

Provides REST endpoints for RQD calculation, pixel-to-mm conversion,
growth alert evaluation, image registration, deformation velocity,
fissure/measurement CRUD, alerts, configuration, and dashboard summary.
All endpoints return HTTP 400 with ``{"error": "message"}`` on invalid input.
"""

from __future__ import annotations

import math
import random
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlmodel.ext.asyncio.session import AsyncSession

from backend.database import get_session
from backend.models.schemas import (
    AlertaResponse,
    ConfigResponse,
    ConvertRequest,
    ConvertResponse,
    ErrorResponse,
    FisuraDetalleResponse,
    FisuraResponse,
    GrowthAlertRequest,
    GrowthAlertResponse,
    MedicionResponse,
    RegistrationRequest,
    RegistrationResponse,
    ResumenResponse,
    RQDResponse,
    ValorConfigRequest,
    VelocityRequest,
    VelocityResponse,
)
from backend.services import db_service, deformation, growth_alert, image_registration, rqd

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


# ═══════════════════════════════════════════════════════════════════════
# Dashboard — Fisuras
# ═══════════════════════════════════════════════════════════════════════


@router.get(
    "/fisuras",
    response_model=list[FisuraResponse],
    tags=["Dashboard"],
    summary="Listar todas las fisuras",
    description="Retorna todas las fisuras detectadas ordenadas por fecha descendente.",
)
async def list_fisuras(
    session: AsyncSession = Depends(get_session),
):
    """Obtener el listado completo de fisuras detectadas."""
    fisuras = await db_service.obtener_fisuras(session)
    return [FisuraResponse(**f.model_dump()) for f in fisuras]


@router.get(
    "/fisuras/{fisura_id}",
    response_model=FisuraDetalleResponse,
    tags=["Dashboard"],
    summary="Detalle de fisura",
    description="Retorna el detalle completo de una fisura incluyendo mediciones y alertas.",
)
async def get_fisura_detail(
    fisura_id: int,
    session: AsyncSession = Depends(get_session),
):
    """Obtener detalle completo de una fisura."""
    fisura = await db_service.obtener_fisura(session, fisura_id)
    if not fisura:
        raise HTTPException(
            status_code=404,
            detail=ErrorResponse(error="Fisura no encontrada").model_dump(),
        )
    mediciones = await db_service.obtener_mediciones(session, fisura_id)
    alertas_list = await db_service.obtener_alertas(session)
    alertas_fisura = [a for a in alertas_list if a.fisura_id == fisura_id]
    return FisuraDetalleResponse(
        fisura=FisuraResponse(**fisura.model_dump()),
        mediciones=[MedicionResponse(**m.model_dump()) for m in mediciones],
        total_mediciones=len(mediciones),
        alertas=[AlertaResponse(**a.model_dump()) for a in alertas_fisura],
    )


@router.get(
    "/fisuras/{fisura_id}/mediciones",
    response_model=list[MedicionResponse],
    tags=["Dashboard"],
    summary="Mediciones de una fisura",
    description="Retorna las mediciones diarias de una fisura, con filtro opcional de días.",
)
async def get_mediciones(
    fisura_id: int,
    dias: int = Query(
        default=None, ge=1, description="Número de días hacia atrás (opcional)"
    ),
    session: AsyncSession = Depends(get_session),
):
    """Obtener mediciones diarias de una fisura."""
    mediciones = await db_service.obtener_mediciones(session, fisura_id, dias=dias)
    return [MedicionResponse(**m.model_dump()) for m in mediciones]


# ═══════════════════════════════════════════════════════════════════════
# Dashboard — Resumen
# ═══════════════════════════════════════════════════════════════════════


@router.get(
    "/resumen",
    response_model=ResumenResponse,
    tags=["Dashboard"],
    summary="Resumen del dashboard",
    description="Retorna estadísticas agregadas para las tarjetas del panel principal.",
)
async def get_resumen(
    session: AsyncSession = Depends(get_session),
):
    """Obtener estadísticas de resumen para el panel principal."""
    return await db_service.obtener_resumen(session)


# ═══════════════════════════════════════════════════════════════════════
# Dashboard — Alertas
# ═══════════════════════════════════════════════════════════════════════


@router.get(
    "/alertas",
    response_model=list[AlertaResponse],
    tags=["Dashboard"],
    summary="Listar alertas",
    description="Retorna todas las alertas, con filtro opcional para solo no reconocidas.",
)
async def list_alertas(
    solo_no_reconocidas: bool = Query(
        default=False, description="Filtrar solo alertas no reconocidas"
    ),
    session: AsyncSession = Depends(get_session),
):
    """Obtener listado de alertas."""
    alertas = await db_service.obtener_alertas(session, solo_no_reconocidas=solo_no_reconocidas)
    return [AlertaResponse(**a.model_dump()) for a in alertas]


@router.put(
    "/alertas/{alerta_id}/reconocer",
    response_model=AlertaResponse,
    tags=["Dashboard"],
    summary="Reconocer alerta",
    description="Marca una alerta como reconocida por el operador.",
)
async def reconocer_alerta(
    alerta_id: int,
    session: AsyncSession = Depends(get_session),
):
    """Reconocer (ack) una alerta."""
    alerta = await db_service.reconocer_alerta(session, alerta_id)
    if not alerta:
        raise HTTPException(
            status_code=404,
            detail=ErrorResponse(error="Alerta no encontrada").model_dump(),
        )
    return AlertaResponse(**alerta.model_dump())


# ═══════════════════════════════════════════════════════════════════════
# Dashboard — Configuración
# ═══════════════════════════════════════════════════════════════════════


@router.get(
    "/configuracion",
    response_model=list[ConfigResponse],
    tags=["Dashboard"],
    summary="Obtener configuración",
    description="Retorna todos los parámetros de configuración del robot.",
)
async def get_configuracion(
    session: AsyncSession = Depends(get_session),
):
    """Obtener la configuración completa del robot."""
    entries = await db_service.obtener_configuracion_completa(session)
    return [ConfigResponse(**e.model_dump()) for e in entries]


@router.put(
    "/configuracion/{clave}",
    response_model=ConfigResponse,
    tags=["Dashboard"],
    summary="Actualizar configuración",
    description="Actualiza o crea un valor de configuración por su clave.",
)
async def update_configuracion(
    clave: str,
    body: ValorConfigRequest,
    session: AsyncSession = Depends(get_session),
):
    """Actualizar un valor de configuración."""
    entry = await db_service.actualizar_configuracion(session, clave, body.valor)
    return ConfigResponse(**entry.model_dump())


# ═══════════════════════════════════════════════════════════════════════
# Seed data (development only)
# ═══════════════════════════════════════════════════════════════════════


@router.post(
    "/seed",
    tags=["Dashboard"],
    summary="Insertar datos de ejemplo",
    description="Puebla la base de datos con 5 fisuras y 7 días de mediciones cada una (solo desarrollo).",
)
async def seed_database(
    session: AsyncSession = Depends(get_session),
):
    """Insertar datos de semilla para desarrollo."""
    now = datetime.utcnow()

    # ── Default configuration ──
    config_defaults = [
        ("distancia_focal_mm", "50", "Distancia focal de la cámara en mm (f)"),
        ("distancia_sensor_z_mm", "10000", "Distancia del sensor al talud en mm (Z)"),
        ("umbral_delta_critico", "5.0", "Porcentaje de crecimiento que dispara alerta crítica"),
        ("tamano_minimo_bloque_rqd_cm", "10", "Tamaño mínimo de bloque intacto para RQD en cm"),
        ("intervalo_polling_seg", "30", "Intervalo de actualización del dashboard en segundos"),
    ]
    for clave, valor, desc in config_defaults:
        entry = await db_service.actualizar_configuracion(session, clave, valor)
        entry.descripcion = desc
        session.add(entry)
        await session.commit()

    # ── 5 fissures ──
    fisuras_data = [
        {
            "roi_id": "ROI-A-01",
            "fecha_deteccion": now - timedelta(days=14),
            "largo_mm": 45.2,
            "ancho_mm": 2.1,
            "area_mm2": 94.9,
            "orientacion": "45°",
            "tipo": "media",
            "coordenadas": '{"x":120,"y":340,"w":80,"h":60}',
            "imagen_original": "/static/samples/roi_a_01_original.jpg",
            "imagen_segmentada": "/static/samples/roi_a_01_segmented.jpg",
        },
        {
            "roi_id": "ROI-A-02",
            "fecha_deteccion": now - timedelta(days=10),
            "largo_mm": 78.5,
            "ancho_mm": 3.8,
            "area_mm2": 298.3,
            "orientacion": "30°",
            "tipo": "gruesa",
            "coordenadas": '{"x":450,"y":210,"w":120,"h":90}',
        },
        {
            "roi_id": "ROI-B-01",
            "fecha_deteccion": now - timedelta(days=7),
            "largo_mm": 12.8,
            "ancho_mm": 0.5,
            "area_mm2": 6.4,
            "orientacion": "90°",
            "tipo": "fina",
            "coordenadas": '{"x":780,"y":560,"w":40,"h":25}',
        },
        {
            "roi_id": "ROI-B-02",
            "fecha_deteccion": now - timedelta(days=5),
            "largo_mm": 33.1,
            "ancho_mm": 1.8,
            "area_mm2": 59.6,
            "orientacion": "15°",
            "tipo": "media",
            "coordenadas": '{"x":300,"y":100,"w":60,"h":45}',
        },
        {
            "roi_id": "ROI-C-01",
            "fecha_deteccion": now - timedelta(days=3),
            "largo_mm": 92.4,
            "ancho_mm": 4.2,
            "area_mm2": 388.1,
            "orientacion": "60°",
            "tipo": "gruesa",
            "coordenadas": '{"x":600,"y":700,"w":150,"h":100}',
        },
    ]

    created_fisuras = []
    for fd in fisuras_data:
        f = await db_service.crear_fisura(session, fd)
        created_fisuras.append(f)

    # ── 7 days of measurements per fissure, plus alerts ──
    random.seed(42)
    for idx, fisura in enumerate(created_fisuras):
        base_largo = fisura.largo_mm
        base_ancho = fisura.ancho_mm
        base_area = fisura.area_mm2
        growth_rate = random.uniform(-0.5, 3.0)  # % growth per day
        for day in range(7):
            day_date = now - timedelta(days=(6 - day))
            factor = 1.0 + (growth_rate * day / 100.0)
            largo = round(base_largo * factor + random.uniform(-0.5, 0.5), 2)
            ancho = round(base_ancho * factor + random.uniform(-0.05, 0.05), 2)
            area = round(base_area * factor + random.uniform(-1.0, 1.0), 2)
            delta = round(growth_rate, 2) if day > 0 else None
            es_critica = delta is not None and delta > 5.0

            await db_service.crear_medicion(
                session,
                {
                    "fisura_id": fisura.id,
                    "fecha": day_date,
                    "largo_mm": max(0.1, largo),
                    "ancho_mm": max(0.01, ancho),
                    "area_mm2": max(0.1, area),
                    "delta_porcentaje": delta,
                    "es_critica": es_critica,
                },
            )

        # Create an alert for fissures with >5% growth
        if growth_rate > 2.0:
            await db_service.crear_alerta(
                session,
                {
                    "fisura_id": fisura.id,
                    "fecha": now - timedelta(hours=random.randint(1, 12)),
                    "tipo": "critico",
                    "mensaje": f"Crecimiento crítico detectado en {fisura.roi_id}: Δ={growth_rate:.1f}% supera el umbral del 5%",
                    "umbral_superado": 5.0,
                    "valor_actual": round(growth_rate, 2),
                    "reconocida": idx > 2,  # first 3 alertas are not acknowledged
                },
            )

    return {
        "status": "ok",
        "message": "Datos de ejemplo insertados correctamente",
        "fisuras_creadas": len(created_fisuras),
        "configuracion_default": len(config_defaults),
    }


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

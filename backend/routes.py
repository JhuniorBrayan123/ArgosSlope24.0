"""
ARGOS SLOPE 4.0 — REST API Routes.

All endpoints use /api prefix and delegate to db_bridge for data access.
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query
from backend import db_bridge

router = APIRouter(prefix="/api", tags=["Dashboard"])


@router.get("/fisuras")
async def list_fisuras():
    """List all fissures with their latest state."""
    return db_bridge.get_fisuras()


@router.get("/fisuras/{track_id}")
async def get_fisura_detail(track_id: int):
    """Full detail for a single fissure, including measurements and alerts."""
    result = db_bridge.get_fisura(track_id)
    if result is None:
        raise HTTPException(status_code=404, detail=f"Fisura #{track_id} no encontrada")
    return result


@router.get("/fisuras/{track_id}/mediciones")
async def get_mediciones(track_id: int, dias: int = Query(None)):
    """Historical measurements for a fissure, optionally filtered by days."""
    result = db_bridge.get_mediciones(track_id, dias)
    if not result and db_bridge.get_fisura(track_id) is None:
        raise HTTPException(status_code=404, detail=f"Fisura #{track_id} no encontrada")
    return result


@router.get("/resumen")
async def get_resumen():
    """Dashboard summary cards."""
    return db_bridge.get_resumen()


@router.get("/alertas")
async def list_alertas(solo_no_reconocidas: bool = Query(False)):
    """List velocity-based alerts, sorted by fecha descending."""
    return db_bridge.get_alertas(solo_no_reconocidas=solo_no_reconocidas)


@router.put("/alertas/{alerta_id}/reconocer")
async def reconocer_alerta(alerta_id: int):
    """Mark an alert as acknowledged."""
    result = db_bridge.reconocer_alerta(alerta_id)
    if result is None:
        raise HTTPException(status_code=404, detail=f"Alerta #{alerta_id} no encontrada")
    return result


@router.get("/configuracion")
async def get_configuracion():
    """List system configuration entries."""
    return db_bridge.get_configuracion()


@router.put("/configuracion/{clave}")
async def update_configuracion(clave: str, body: dict):
    """Update a single configuration value."""
    valor = body.get("valor")
    if valor is None:
        raise HTTPException(status_code=400, detail="Campo 'valor' requerido")
    return db_bridge.actualizar_configuracion(clave, str(valor))


@router.get("/health")
async def health_check():
    """Lightweight health check."""
    return {"status": "ok", "service": "ARGOS SLOPE 4.0 API"}

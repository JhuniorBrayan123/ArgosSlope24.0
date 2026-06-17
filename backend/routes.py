from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query
from backend import db_bridge

router = APIRouter(prefix="/api", tags=["Dashboard"])

@router.get("/fisuras")
async def list_fisuras():

    return db_bridge.get_fisuras()

@router.get("/fisuras/{track_id}")
async def get_fisura_detail(track_id: int):

    result = db_bridge.get_fisura(track_id)
    if result is None:
        raise HTTPException(status_code=404, detail=f"Fisura #{track_id} no encontrada")
    return result

@router.get("/fisuras/{track_id}/mediciones")
async def get_mediciones(track_id: int, dias: int = Query(None)):

    result = db_bridge.get_mediciones(track_id, dias)
    if not result and db_bridge.get_fisura(track_id) is None:
        raise HTTPException(status_code=404, detail=f"Fisura #{track_id} no encontrada")
    return result

@router.get("/resumen")
async def get_resumen():

    return db_bridge.get_resumen()

@router.get("/alertas")
async def list_alertas(solo_no_reconocidas: bool = Query(False)):

    return db_bridge.get_alertas(solo_no_reconocidas=solo_no_reconocidas)

@router.put("/alertas/{alerta_id}/reconocer")
async def reconocer_alerta(alerta_id: int):

    result = db_bridge.reconocer_alerta(alerta_id)
    if result is None:
        raise HTTPException(status_code=404, detail=f"Alerta #{alerta_id} no encontrada")
    return result

@router.get("/configuracion")
async def get_configuracion():

    return db_bridge.get_configuracion()

@router.put("/configuracion/{clave}")
async def update_configuracion(clave: str, body: dict):

    valor = body.get("valor")
    if valor is None:
        raise HTTPException(status_code=400, detail="Campo 'valor' requerido")
    return db_bridge.actualizar_configuracion(clave, str(valor))

@router.get("/predicciones")
async def list_predicciones():

    return db_bridge.get_predicciones()

@router.get("/predicciones/{crack_id}")
async def get_prediccion(crack_id: int):

    result = db_bridge.get_prediccion(crack_id)
    if result is None:
        raise HTTPException(
            status_code=404,
            detail=f"Predicción para fisura #{crack_id} no disponible. Se requieren al menos 3 mediciones.",
        )
    return result

@router.get("/health")
async def health_check():

    return {"status": "ok", "service": "ARGOS SLOPE 4.0 API"}

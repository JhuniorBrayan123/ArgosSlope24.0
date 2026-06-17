"""
Database CRUD service for ARGOS SLOPE 4.0.

All functions accept an async SQLModel ``AsyncSession`` and return
plain Python dicts or Pydantic-compatible model instances so callers
(the route layer) can serialise them directly.
"""

from __future__ import annotations

from datetime import datetime, timedelta
from typing import Optional

from sqlmodel import func, select
from sqlmodel.ext.asyncio.session import AsyncSession

from backend.models.database_models import Alerta, Configuracion, Fisura, MedicionDiaria

# ═══════════════════════════════════════════════════════════════════════
# Fisura
# ═══════════════════════════════════════════════════════════════════════


async def crear_fisura(session: AsyncSession, data: dict) -> Fisura:
    """Insert a new fisura and return it."""
    obj = Fisura(**data)
    session.add(obj)
    await session.commit()
    await session.refresh(obj)
    return obj


async def obtener_fisuras(session: AsyncSession) -> list[Fisura]:
    """Return all fisuras ordered by detection date (newest first)."""
    stmt = select(Fisura).order_by(Fisura.fecha_deteccion.desc())
    result = await session.exec(stmt)
    return list(result.all())


async def obtener_fisura(session: AsyncSession, fisura_id: int) -> Optional[Fisura]:
    """Return a single fisura by primary key."""
    return await session.get(Fisura, fisura_id)


async def actualizar_fisura(
    session: AsyncSession, fisura_id: int, data: dict
) -> Optional[Fisura]:
    """Update fields of an existing fisura. Returns ``None`` if not found."""
    obj = await session.get(Fisura, fisura_id)
    if not obj:
        return None
    for key, value in data.items():
        setattr(obj, key, value)
    session.add(obj)
    await session.commit()
    await session.refresh(obj)
    return obj


# ═══════════════════════════════════════════════════════════════════════
# MedicionDiaria
# ═══════════════════════════════════════════════════════════════════════


async def crear_medicion(session: AsyncSession, data: dict) -> MedicionDiaria:
    """Insert a new daily measurement and return it."""
    obj = MedicionDiaria(**data)
    session.add(obj)
    await session.commit()
    await session.refresh(obj)
    return obj


async def obtener_mediciones(
    session: AsyncSession, fisura_id: int, dias: Optional[int] = None
) -> list[MedicionDiaria]:
    """Return measurements for a given fisura, optionally filtered to the last N days."""
    stmt = (
        select(MedicionDiaria)
        .where(MedicionDiaria.fisura_id == fisura_id)
        .order_by(MedicionDiaria.fecha.asc())
    )
    if dias is not None and dias > 0:
        cutoff = datetime.utcnow() - timedelta(days=dias)
        stmt = stmt.where(MedicionDiaria.fecha >= cutoff)
    result = await session.exec(stmt)
    return list(result.all())


# ═══════════════════════════════════════════════════════════════════════
# Alerta
# ═══════════════════════════════════════════════════════════════════════


async def crear_alerta(session: AsyncSession, data: dict) -> Alerta:
    """Insert a new alert and return it."""
    obj = Alerta(**data)
    session.add(obj)
    await session.commit()
    await session.refresh(obj)
    return obj


async def obtener_alertas(
    session: AsyncSession, solo_no_reconocidas: bool = False
) -> list[Alerta]:
    """Return all alerts (newest first), optionally only unacknowledged ones."""
    stmt = select(Alerta).order_by(Alerta.fecha.desc())
    if solo_no_reconocidas:
        stmt = stmt.where(Alerta.reconocida == False)
    result = await session.exec(stmt)
    return list(result.all())


async def reconocer_alerta(session: AsyncSession, alerta_id: int) -> Optional[Alerta]:
    """Mark an alert as recognised. Returns ``None`` if not found."""
    obj = await session.get(Alerta, alerta_id)
    if not obj:
        return None
    obj.reconocida = True
    session.add(obj)
    await session.commit()
    await session.refresh(obj)
    return obj


# ═══════════════════════════════════════════════════════════════════════
# Configuracion
# ═══════════════════════════════════════════════════════════════════════


async def obtener_configuracion(session: AsyncSession) -> dict[str, str]:
    """Return all config entries as a flat ``{clave: valor}`` dict."""
    stmt = select(Configuracion)
    result = await session.exec(stmt)
    return {row.clave: row.valor for row in result.all()}


async def obtener_configuracion_completa(session: AsyncSession) -> list[Configuracion]:
    """Return all config entries with their full metadata."""
    stmt = select(Configuracion)
    result = await session.exec(stmt)
    return list(result.all())


async def actualizar_configuracion(
    session: AsyncSession, clave: str, valor: str
) -> Configuracion:
    """Upsert a configuration entry. Returns the saved entry."""
    stmt = select(Configuracion).where(Configuracion.clave == clave)
    result = await session.exec(stmt)
    entry = result.one_or_none()
    if entry:
        entry.valor = valor
    else:
        entry = Configuracion(clave=clave, valor=valor)
    session.add(entry)
    await session.commit()
    await session.refresh(entry)
    return entry


# ═══════════════════════════════════════════════════════════════════════
# Resumen (dashboard statistics)
# ═══════════════════════════════════════════════════════════════════════


async def obtener_resumen(session: AsyncSession) -> dict:
    """Compute aggregate statistics for the dashboard header cards."""
    # Total fisuras
    total = await session.exec(select(func.count(Fisura.id)))
    total_fisuras: int = total.one() or 0

    # Unacknowledged critical alerts
    crit = await session.exec(
        select(func.count(Alerta.id)).where(
            Alerta.tipo == "critico", Alerta.reconocida == False
        )
    )
    alertas_criticas: int = crit.one() or 0

    # Average delta across all non-null measurements
    avg = await session.exec(
        select(func.avg(MedicionDiaria.delta_porcentaje)).where(
            MedicionDiaria.delta_porcentaje.isnot(None)
        )
    )
    deformacion_promedio: float = round(float(avg.one() or 0.0), 2)

    return {
        "total_fisuras": total_fisuras,
        "alertas_criticas": alertas_criticas,
        "rpi_conectada": True,  # Would come from a real heartbeat endpoint in production
        "deformacion_promedio": deformacion_promedio,
    }

"""
SQLModel table definitions for ARGOS SLOPE 4.0.

Each class maps to a PostgreSQL table via the async SQLModel engine managed
in ``backend.database``.
"""

from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy import Column, Text
from sqlmodel import Field, SQLModel


class Fisura(SQLModel, table=True):
    """A detected fissure / crack on the mining slope wall."""

    __tablename__ = "fisura"

    id: Optional[int] = Field(default=None, primary_key=True)
    roi_id: str = Field(max_length=100, description="ROI identifier (region of interest)")
    fecha_deteccion: datetime = Field(description="Date/time the fissure was first detected")
    largo_mm: float = Field(ge=0, description="Fissure length in millimetres")
    ancho_mm: float = Field(ge=0, description="Average fissure width in millimetres")
    area_mm2: float = Field(ge=0, description="Fissure surface area in mm²")
    orientacion: Optional[str] = Field(default=None, max_length=50, description="Orientation angle or cardinal direction")
    tipo: Optional[str] = Field(default=None, max_length=50, description="Fissure type (fina / media / gruesa)")
    coordenadas: Optional[str] = Field(default=None, sa_column=Column(Text), description="JSON-encoded ROI coordinates")
    imagen_original: Optional[str] = Field(default=None, max_length=500, description="Path to the original photograph")
    imagen_segmentada: Optional[str] = Field(default=None, max_length=500, description="Path to the AI-segmented image")


class MedicionDiaria(SQLModel, table=True):
    """Daily follow-up measurement for a previously detected fissure."""

    __tablename__ = "medicion_diaria"

    id: Optional[int] = Field(default=None, primary_key=True)
    fisura_id: int = Field(foreign_key="fisura.id", index=True)
    fecha: datetime = Field(description="Measurement date")
    largo_mm: float = Field(ge=0)
    ancho_mm: float = Field(ge=0)
    area_mm2: float = Field(ge=0)
    delta_porcentaje: Optional[float] = Field(default=None, description="Growth Δ% since the previous measurement")
    es_critica: bool = Field(default=False, description="True when Δ% exceeds the critical threshold")


class Alerta(SQLModel, table=True):
    """Alert raised when a fissure measurement exceeds its configured threshold."""

    __tablename__ = "alerta"

    id: Optional[int] = Field(default=None, primary_key=True)
    fisura_id: Optional[int] = Field(default=None, foreign_key="fisura.id")
    fecha: datetime = Field(description="Alert generation timestamp")
    tipo: str = Field(max_length=100, description="Alert type (critico / advertencia / informativo)")
    mensaje: str = Field(sa_column=Column(Text), description="Human-readable alert message in Spanish")
    umbral_superado: float = Field(description="The threshold value that was exceeded")
    valor_actual: float = Field(description="The measured value that triggered the alert")
    reconocida: bool = Field(default=False, description="Whether an operator has acknowledged this alert")


class Configuracion(SQLModel, table=True):
    """Key-value store for robot and processing configuration parameters."""

    __tablename__ = "configuracion"

    id: Optional[int] = Field(default=None, primary_key=True)
    clave: str = Field(max_length=100, unique=True, index=True, description="Configuration key")
    valor: str = Field(max_length=500, description="Configuration value (stringified)")
    descripcion: Optional[str] = Field(default=None, sa_column=Column(Text), description="Human-readable description in Spanish")

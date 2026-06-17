"""ARGOS SLOPE 4.0 — Pydantic schemas and SQLModel table definitions."""

from backend.models.database_models import Alerta, Configuracion, Fisura, MedicionDiaria
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
    VelocityRequest,
    VelocityResponse,
)

__all__ = [
    # SQLModel tables
    "Fisura",
    "MedicionDiaria",
    "Alerta",
    "Configuracion",
    # Pydantic schemas
    "RQDResponse",
    "ConvertRequest",
    "ConvertResponse",
    "GrowthAlertRequest",
    "GrowthAlertResponse",
    "VelocityRequest",
    "VelocityResponse",
    "RegistrationRequest",
    "RegistrationResponse",
    "ErrorResponse",
    "FisuraResponse",
    "FisuraDetalleResponse",
    "MedicionResponse",
    "AlertaResponse",
    "ConfigResponse",
    "ResumenResponse",
]

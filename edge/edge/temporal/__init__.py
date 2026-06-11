"""
ARGOS SLOPE 4.0 — Temporal Analysis Module.

Provides image registration, crack tracking, velocity calculation,
persistence, and alert engine capabilities for temporal comparison
of slope imagery.
"""

from edge.temporal.alert_engine import AlertEngine, AlertLevel, CrackAlertState
from edge.temporal.registration import ImageRegistrator, RegistrationConfig
from edge.temporal.tracking import CrackTracker, TrackedCrack
from edge.temporal.velocity import VelocityCalculator, TrackHistory, MeasurementRecord
from edge.temporal.persistence import (
    JsonCrackHistoryStore,
    CrackHistoryStore,
    CrackSnapshot,
)
from edge.temporal.trend_predictor import TrendPredictor, TrendPredictionResult

__all__ = [
    "ImageRegistrator",
    "RegistrationConfig",
    "CrackTracker",
    "TrackedCrack",
    "VelocityCalculator",
    "TrackHistory",
    "MeasurementRecord",
    "JsonCrackHistoryStore",
    "CrackHistoryStore",
    "CrackSnapshot",
    "AlertEngine",
    "AlertLevel",
    "CrackAlertState",
    "TrendPredictor",
    "TrendPredictionResult",
]

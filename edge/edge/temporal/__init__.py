"""
ARGOS SLOPE 4.0 — Temporal Analysis Module.

Provides image registration, crack tracking, velocity calculation,
and persistence capabilities for temporal comparison of slope imagery.
"""

from edge.temporal.registration import ImageRegistrator, RegistrationConfig
from edge.temporal.tracking import CrackTracker, TrackedCrack
from edge.temporal.velocity import VelocityCalculator, TrackHistory, MeasurementRecord
from edge.temporal.persistence import (
    JsonCrackHistoryStore,
    CrackHistoryStore,
    CrackSnapshot,
)

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
]

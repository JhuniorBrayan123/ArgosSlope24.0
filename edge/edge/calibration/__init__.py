"""
ARGOS SLOPE 4.0 — Camera calibration and ArUco scale detection module.

Provides:
- ``CameraCalibrator`` — checkerboard-based camera calibration
- ``ArucoScaleDetector`` — ArUco marker detection for pixel-to-mm scale
- ``CalibrationService`` — orchestrator for the full calibration pipeline
"""

from edge.calibration.calibrate_camera import CameraCalibrator
from edge.calibration.detect_aruco_scale import ArucoScaleDetector
from edge.calibration.calibration_service import CalibrationService

__all__ = [
    "CameraCalibrator",
    "ArucoScaleDetector",
    "CalibrationService",
]

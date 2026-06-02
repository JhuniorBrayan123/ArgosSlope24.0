"""
ARGOS SLOPE 4.0 — Shared Frame Buffer (thread-safe).

Permite que el main loop (captura + detección) y el stream WebRTC
compartan el mismo frame sin duplicar el acceso a la cámara.

Uso:
   main_loop:  shared_frame.write(frame, detections)
   WebRTC:     shared_frame.read() → (frame, detections)
"""

from __future__ import annotations

import threading
import numpy as np
from typing import Optional

from edge.detector.fisura_detector import CrackResult


class SharedFrame:
    """Buffer thread-safe para 1 frame + sus detecciones."""

    def __init__(self):
        self._lock = threading.Lock()
        self._frame: Optional[np.ndarray] = None
        self._detections: list[CrackResult] = []
        self._frame_count: int = 0

    def write(self, frame: np.ndarray, detections: list[CrackResult]) -> None:
        """Escribe el frame actual (llamado desde el main loop)."""
        with self._lock:
            self._frame = frame.copy()
            self._detections = list(detections)
            self._frame_count += 1

    def read(self) -> tuple[Optional[np.ndarray], list[CrackResult], int]:
        """Lee el frame más reciente (llamado desde WebRTC)."""
        with self._lock:
            if self._frame is None:
                return None, [], 0
            return (
                self._frame.copy(),
                list(self._detections),
                self._frame_count,
            )


# Instancia global única
shared_frame = SharedFrame()

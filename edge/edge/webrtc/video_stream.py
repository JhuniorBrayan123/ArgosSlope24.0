"""
ARGOS SLOPE 4.0 — WebRTC Video Stream Track.

Proporciona un ``VideoStreamTrack`` de aiortc que envía frames por WebRTC
al frontend. Dos modos de operación:

Modo ``shared`` (por defecto):
  - Lee el frame desde un ``SharedFrame`` actualizado por el main loop.
  - No compite por la cámara.
  - Las detecciones incluyen bounding boxes dibujados en el frame.

Modo ``direct``:
  - Abre su propia cámara o archivo de video (útil para testing standalone).
"""

from __future__ import annotations

import asyncio
import logging
import time
from typing import Optional

import cv2
import numpy as np
from fractions import Fraction
from aiortc import VideoStreamTrack
from av import VideoFrame

from edge.detector.fisura_detector import CrackResult
from edge.webrtc.shared_frame import shared_frame

logger = logging.getLogger(__name__)


class OpenCvVideoTrack(VideoStreamTrack):
    """
    VideoStreamTrack que alimenta frames desde OpenCV hacia WebRTC.

    El video se envía **sin overlays** — los bounding boxes se dibujan
    en el frontend vía MQTT, siguiendo la arquitectura definida:

      OpenCV → Detecciones → MQTT → Frontend → Canvas Overlay

    Args:
        mode: ``"shared"`` (lee del buffer global) o ``"direct"`` (cámara propia).
        source: Solo para mode="direct" — ``"0"`` (USB) o ruta de video.
        draw_detections: Si True, dibuja bounding boxes en el video.
                         Por defecto False (se dibujan via MQTT en frontend).
        fps, frame_width, frame_height: Solo para mode="direct".
    """

    def __init__(
        self,
        mode: str = "shared",
        source: str = "0",
        draw_detections: bool = False,
        fps: int = 15,
        frame_width: int = 640,
        frame_height: int = 480,
    ) -> None:
        super().__init__()

        self._mode = mode
        self._fps = fps
        self._frame_width = frame_width
        self._frame_height = frame_height
        self._frame_period = 1.0 / fps
        self._last_frame_time = 0.0
        self._draw_detections = draw_detections
        self._pts_counter = 0  # Contador de PTS para WebRTC
        self._cap: Optional[cv2.VideoCapture] = None

        if mode == "direct":
            if source.isdigit():
                self._cap = cv2.VideoCapture(int(source), cv2.CAP_V4L2)
            else:
                self._cap = cv2.VideoCapture(source)

            if not self._cap or not self._cap.isOpened():
                raise RuntimeError(f"Cannot open video source: {source}")

            self._cap.set(cv2.CAP_PROP_FRAME_WIDTH, frame_width)
            self._cap.set(cv2.CAP_PROP_FRAME_HEIGHT, frame_height)
            self._cap.set(cv2.CAP_PROP_FPS, fps)

        logger.info(
            "OpenCvVideoTrack initialized: mode=%s, draw=%s, %dx%d @ %d fps",
            mode, draw_detections, frame_width, frame_height, fps,
        )

    async def recv(self) -> VideoFrame:
        """Sobrescribe VideoStreamTrack.recv() — entrega el próximo frame."""

        # Control de FPS
        now = time.time()
        wait = self._frame_period - (now - self._last_frame_time)
        if wait > 0:
            await asyncio.sleep(wait)
        self._last_frame_time = time.time()

        # Obtener frame según modo
        if self._mode == "shared":
            frame = self._read_shared()
        else:
            frame = self._read_direct()

        if frame is None:
            # Frame placeholder si aún no hay datos
            frame = np.zeros(
                (self._frame_height, self._frame_width, 3),
                dtype=np.uint8,
            )
            cv2.putText(
                frame, "Esperando señal de la cámara...",
                (20, self._frame_height // 2),
                cv2.FONT_HERSHEY_SIMPLEX, 0.7, (200, 200, 200), 1,
            )

        # Convertir BGR → RGB → VideoFrame
        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        video_frame = VideoFrame.from_ndarray(rgb, format="rgb24")
        # PTS incremental (90000 / FPS por frame)
        self._pts_counter += int(90000 / self._fps)
        video_frame.pts = self._pts_counter
        video_frame.time_base = Fraction(1, 90000)

        return video_frame

    def _read_shared(self) -> Optional[np.ndarray]:
        """Lee el frame desde el buffer compartido.

        Por defecto NO dibuja bounding boxes — estos se dibujan en el
        frontend vía MQTT. Si ``draw_detections=True``, los dibuja aquí.
        """
        frame, detections, count = shared_frame.read()
        if frame is None:
            return None

        # Redimensionar si es necesario
        if (frame.shape[1] != self._frame_width or
                frame.shape[0] != self._frame_height):
            frame = cv2.resize(frame, (self._frame_width, self._frame_height))

        # Dibujar bounding boxes solo si está explícitamente activado
        if self._draw_detections and detections:
            self._draw_detections(frame, detections)

        return frame

    def _read_direct(self) -> Optional[np.ndarray]:
        """Lee frame directamente desde la cámara."""
        if self._cap is None:
            return None
        ret, frame = self._cap.read()
        if not ret:
            # Reiniciar si es archivo
            self._cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
            ret, frame = self._cap.read()
            if not ret:
                return None
        return frame

    @staticmethod
    def _draw_detections(frame: np.ndarray, detections: list[CrackResult]) -> None:
        """Dibuja bounding boxes + etiquetas directamente en el frame BGR."""
        color_map = {
            "fina": (0, 212, 170),    # teal (BGR)
            "media": (11, 158, 245),  # amber
            "gruesa": (68, 68, 239),  # red
            "none": (170, 170, 136),  # gray
        }

        for crack in detections:
            color = color_map.get(crack.classification.value, (170, 170, 136))

            # Bounding box
            cv2.rectangle(
                frame,
                (crack.x, crack.y),
                (crack.x + crack.width, crack.y + crack.height),
                color=color,
                thickness=2,
            )

            # Label
            label = f"{crack.roi_id} ({crack.classification.value})"
            (tw, th), _ = cv2.getTextSize(
                label, cv2.FONT_HERSHEY_SIMPLEX, 0.45, 1
            )

            # Fondo del texto
            cv2.rectangle(
                frame,
                (crack.x, crack.y - th - 6),
                (crack.x + tw + 6, crack.y),
                color=color,
                thickness=-1,
            )

            # Texto
            cv2.putText(
                frame,
                label,
                (crack.x + 3, crack.y - 4),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.45,
                (15, 15, 26),  # dark
                thickness=1,
                lineType=cv2.LINE_AA,
            )

    def stop(self) -> None:
        """Libera la cámara (solo modo direct)."""
        if self._cap:
            self._cap.release()
            logger.info("Camera released.")

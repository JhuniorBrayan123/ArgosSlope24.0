#!/usr/bin/env python3
"""
ARGOS SLOPE 4.0 — Raspberry Pi Camera Streamer.

Transmite la cámara del RPi como un stream MJPEG vía HTTP.
La laptop (Edge Processing) consume este stream como si fuera una cámara local.

Uso:
    # Cámara CSI (conector de cinta plana)
    python3 stream.py

    # Cámara USB
    python3 stream.py --usb

    # Puerto personalizado
    python3 stream.py --port 8080

    # Resolución personalizada
    python3 stream.py --width 1280 --height 720

Dependencias:
    - Cámara CSI:    python3-picamera2 (viene con Raspberry Pi OS)
    - Cámara USB:    python3-opencv

El stream queda accesible en:
    http://<IP-del-RPi>:5000/stream
"""

from __future__ import annotations

import argparse
import io
import logging
import socket
import sys
import threading
import time
from http.server import HTTPServer, BaseHTTPRequestHandler
from typing import Optional

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    stream=sys.stdout,
)
logger = logging.getLogger("rpi-streamer")


# ── Camera wrappers ─────────────────────────────────────────────────────


class CsiCamera:
    """Wrapper para cámara CSI (Picamera2)."""

    def __init__(self, width: int = 640, height: int = 480):
        from picamera2 import Picamera2

        self._cam = Picamera2()
        config = self._cam.create_video_configuration(
            main={"size": (width, height), "format": "RGB888"}
        )
        self._cam.configure(config)
        self._cam.start()
        # Esperar a que el sensor estabilice
        time.sleep(1.5)
        logger.info("CSI camera opened: %dx%d", width, height)

    def capture_jpeg(self) -> bytes:
        """Captura un frame y lo devuelve como JPEG."""
        buf = io.BytesIO()
        self._cam.capture_file(buf, format="jpeg")
        return buf.getvalue()

    def release(self):
        self._cam.stop()
        self._cam.close()


class UsbCamera:
    """Wrapper para cámara USB (OpenCV)."""

    def __init__(self, width: int = 640, height: int = 480, index: int = 0):
        import cv2

        self._cap = cv2.VideoCapture(index, cv2.CAP_V4L2)
        if not self._cap.isOpened():
            raise RuntimeError(f"Cannot open USB camera at index {index}")

        self._cap.set(cv2.CAP_PROP_FRAME_WIDTH, width)
        self._cap.set(cv2.CAP_PROP_FRAME_HEIGHT, height)

        # Verificar que podamos leer un frame
        ret, _ = self._cap.read()
        if not ret:
            self._cap.release()
            raise RuntimeError("USB camera opened but cannot read frames")

        actual_w = int(self._cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        actual_h = int(self._cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        logger.info("USB camera opened: %dx%d (requested %dx%d)", actual_w, actual_h, width, height)

    def capture_jpeg(self) -> bytes:
        """Captura un frame y lo devuelve como JPEG."""
        import cv2
        import numpy as np

        ret, frame = self._cap.read()
        if not ret:
            raise RuntimeError("Failed to read frame from USB camera")

        ret, jpeg = cv2.imencode(".jpg", frame, [int(cv2.IMWRITE_JPEG_QUALITY), 85])
        if not ret:
            raise RuntimeError("Failed to encode JPEG")
        return jpeg.tobytes()

    def release(self):
        self._cap.release()


# ── HTTP Stream Handler ─────────────────────────────────────────────────


class StreamHandler(BaseHTTPRequestHandler):
    """Sirve el stream MJPEG al cliente conectado."""

    # Referencia a la cámara (se asigna desde afuera)
    camera = None  # type: Optional[Union[CsiCamera, UsbCamera]]
    _lock = threading.Lock()

    def do_GET(self):
        if self.path != "/stream":
            self.send_response(404)
            self.end_headers()
            self.wfile.write(b"Use /stream for MJPEG stream")
            return

        logger.info("Client connected: %s", self.client_address)

        self.send_response(200)
        self.send_header("Content-Type", "multipart/x-mixed-replace; boundary=frame")
        self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        self.send_header("Connection", "close")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()

        frame_count = 0
        try:
            while True:
                with self._lock:
                    jpeg_bytes = self.camera.capture_jpeg()

                self.wfile.write(b"--frame\r\n")
                self.wfile.write(b"Content-Type: image/jpeg\r\n")
                self.wfile.write(f"Content-Length: {len(jpeg_bytes)}\r\n".encode())
                self.wfile.write(b"\r\n")
                self.wfile.write(jpeg_bytes)
                self.wfile.write(b"\r\n")
                self.wfile.flush()

                frame_count += 1
                if frame_count % 300 == 0:
                    logger.info(
                        "Streaming to %s: %d frames sent",
                        self.client_address,
                        frame_count,
                    )
        except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError):
            logger.info("Client disconnected: %s (%d frames)", self.client_address, frame_count)
        except Exception as e:
            logger.warning("Stream error for %s: %s", self.client_address, e)

    def log_message(self, format, *args):
        """Silenciar logs de HTTP Server (son muy ruidosos)."""
        pass


# ── Health Endpoint ─────────────────────────────────────────────────────


class HealthHandler(BaseHTTPRequestHandler):
    """Sirve un endpoint de health check en GET /health."""

    def do_GET(self):
        if self.path == "/health":
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(b'{"status":"ok","service":"rpi-streamer"}')
        else:
            self.send_response(404)
            self.end_headers()

    def log_message(self, format, *args):
        pass


# ── Multi-routes server ─────────────────────────────────────────────────


class MultiRouteServer(HTTPServer):
    """Server que rutea según el path a distintos handlers."""

    def __init__(self, server_address, camera):
        self.camera = camera
        super().__init__(server_address, self._create_handler)
        StreamHandler.camera = camera

    def _create_handler(self, request, client_address, server):
        path = request.split(b" ")[1].decode() if b" " in request else "/"
        if path == "/health":
            return HealthHandler(request, client_address, server)
        return StreamHandler(request, client_address, server)


# ── Main ────────────────────────────────────────────────────────────────


def get_ip() -> str:
    """Obtiene la IP local del RPi en la red."""
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "127.0.0.1"


def main():
    parser = argparse.ArgumentParser(description="RPi Camera Streamer for ARGOS SLOPE")
    parser.add_argument("--usb", action="store_true", help="Use USB camera instead of CSI")
    parser.add_argument("--index", type=int, default=0, help="USB camera index (default: 0)")
    parser.add_argument("--port", type=int, default=5000, help="HTTP port (default: 5000)")
    parser.add_argument("--width", type=int, default=640, help="Frame width (default: 640)")
    parser.add_argument("--height", type=int, default=480, help="Frame height (default: 480)")
    args = parser.parse_args()

    # ── Iniciar cámara ───────────────────────────────────────────────
    logger.info("Starting camera (%s)...", "USB" if args.usb else "CSI")
    try:
        if args.usb:
            camera = UsbCamera(width=args.width, height=args.height, index=args.index)
        else:
            camera = CsiCamera(width=args.width, height=args.height)
    except Exception as e:
        logger.error("Failed to start camera: %s", e)
        sys.exit(1)

    # ── Iniciar servidor HTTP ────────────────────────────────────────
    ip = get_ip()
    hostname = socket.gethostname()
    server = MultiRouteServer(("0.0.0.0", args.port), camera)

    logger.info("=" * 55)
    logger.info("  ARGOS SLOPE — RPi Camera Streamer")
    logger.info("=" * 55)
    logger.info("  Stream URL:  http://%s.local:%d/stream", hostname, args.port)
    logger.info("  Stream URL:  http://%s:%d/stream", ip, args.port)
    logger.info("  Health:      http://%s:%d/health", ip, args.port)
    logger.info("  Resolution:  %dx%d", args.width, args.height)
    logger.info("=" * 55)
    logger.info("Press Ctrl+C to stop")

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        logger.info("Shutting down...")
    finally:
        server.shutdown()
        camera.release()
        logger.info("Camera released. Goodbye.")


if __name__ == "__main__":
    main()

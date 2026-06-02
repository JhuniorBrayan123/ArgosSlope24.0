"""
ARGOS SLOPE 4.0 — Servidor MJPEG (Motion JPEG).

Alternativa simple a WebRTC para transmisión de video en vivo.
Funciona con cualquier navegador usando <img src="...">.

Lee del buffer compartido (shared_frame) igual que WebRTC.
"""

from __future__ import annotations

import asyncio
import logging
from pathlib import Path

import cv2
import numpy as np
from aiohttp import web

from edge.config import config
from edge.webrtc.shared_frame import shared_frame

logger = logging.getLogger(__name__)

JPEG_QUALITY = 70       # 0-100, menor = más compresión
MJPEG_FPS = 15
FRAME_PERIOD = 1.0 / MJPEG_FPS
BOUNDARY = b"--frame"

# ── CORS simple ─────────────────────────────────────────────────────


@web.middleware
async def cors_middleware(request: web.Request, handler) -> web.Response:
    """Permite CORS."""
    if request.method == "OPTIONS":
        resp = web.Response()
        resp.headers["Access-Control-Allow-Origin"] = "*"
        resp.headers["Access-Control-Allow-Methods"] = "GET, OPTIONS"
        resp.headers["Access-Control-Allow-Headers"] = "*"
        return resp
    resp = await handler(request)
    resp.headers["Access-Control-Allow-Origin"] = "*"
    return resp


# ── MJPEG Stream ────────────────────────────────────────────────────


async def handle_mjpeg(request: web.Request) -> web.StreamResponse:
    """
    Endpoint MJPEG: devuelve multipart/x-mixed-replace.

    Uso: <img src="http://localhost:8082/stream" />
    """
    response = web.StreamResponse(
        status=200,
        reason="OK",
        headers={
            "Content-Type": "multipart/x-mixed-replace; boundary=frame",
            "Cache-Control": "no-cache, no-store, must-revalidate",
            "Pragma": "no-cache",
            "Expires": "0",
            "Access-Control-Allow-Origin": "*",
        },
    )
    await response.prepare(request)

    logger.info("MJPEG client connected from %s", request.remote)

    try:
        while True:
            loop_start = asyncio.get_event_loop().time()

            # Leer frame del buffer compartido
            frame, detections, count = shared_frame.read()

            if frame is None:
                # Frame vacío — mostrar placeholder
                frame = np.zeros((480, 640, 3), dtype=np.uint8)
                cv2.putText(
                    frame, "Esperando senal de la camara...",
                    (20, 240),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.7, (200, 200, 200), 1,
                )
            else:
                # Redimensionar si es necesario
                h, w = frame.shape[:2]
                if w != 640 or h != 480:
                    frame = cv2.resize(frame, (640, 480))

            # Codificar JPEG
            ret, jpeg = cv2.imencode(".jpg", frame, [
                cv2.IMWRITE_JPEG_QUALITY, JPEG_QUALITY,
            ])
            if not ret:
                await asyncio.sleep(FRAME_PERIOD)
                continue

            # Escribir frame MJPEG
            try:
                await response.write(BOUNDARY)
                await response.write(b"\r\n")
                await response.write(b"Content-Type: image/jpeg\r\n")
                await response.write(f"Content-Length: {len(jpeg)}\r\n".encode())
                await response.write(b"\r\n")
                await response.write(jpeg.tobytes())
                await response.write(b"\r\n")
            except ConnectionResetError:
                logger.info("MJPEG client disconnected")
                break
            except Exception:
                logger.exception("MJPEG write error")
                break

            # Control de FPS
            elapsed = asyncio.get_event_loop().time() - loop_start
            wait = FRAME_PERIOD - elapsed
            if wait > 0:
                await asyncio.sleep(wait)

    except asyncio.CancelledError:
        pass
    finally:
        logger.info("MJPEG stream ended")

    return response


async def handle_health(request: web.Request) -> web.Response:
    """Health check."""
    frame, _, count = shared_frame.read()
    return web.json_response({
        "status": "ok",
        "has_frame": frame is not None,
        "frame_count": count,
    })


# ── Static file serving for HD captures ─────────────────────────────


async def handle_hd_capture_file(request: web.Request) -> web.FileResponse:
    """Sirve archivos .obj y .ply de capturas_hd/."""
    filename = request.match_info.get("filename", "")
    filepath = Path(config.hd_capture_dir) / filename
    if not filepath.exists() or not filepath.is_file():
        raise web.HTTPNotFound(text=f"Archivo no encontrado: {filename}")
    return web.FileResponse(filepath)


# ── Factory ─────────────────────────────────────────────────────────


def create_mjpeg_app() -> web.Application:
    """Crea la app aiohttp con rutas MJPEG."""
    app = web.Application(middlewares=[cors_middleware])
    app.router.add_get("/stream", handle_mjpeg)
    app.router.add_get("/health", handle_health)
    app.router.add_get("/capturas_hd/{filename:.+}", handle_hd_capture_file)
    return app


async def run_mjpeg_server(
    host: str = "0.0.0.0",
    port: int = 8082,
) -> None:
    """
    Arranca el servidor MJPEG.

    Args:
        host: Dirección a la que bindear.
        port: Puerto (por defecto 8082).
    """
    app = create_mjpeg_app()
    runner = web.AppRunner(app)
    await runner.setup()
    site = web.TCPSite(runner, host, port)
    await site.start()
    logger.info("MJPEG server running on http://%s:%d/stream", host, port)

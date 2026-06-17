"""
ARGOS SLOPE 4.0 — Servidor de Señalización WebRTC.

Protocolo simplificado (HTTP POST polling):
  1. Frontend: Crea RTCPeerConnection → genera SDP Offer
  2. Frontend → POST /offer  { sdp, type }
  3. RPi:      aiortc recibe la offer, configura su PeerConnection,
               genera SDP Answer
  4. RPi → Response JSON: { sdp, type }
  5. Frontend: Establece SDP Answer como remote description
  6. ✅ Video fluye P2P via ICE

Servidor liviano con aiohttp (sin dependencias extra pesadas).
"""

from __future__ import annotations

import json
import logging
import asyncio
from typing import Optional

from aiohttp import web

import os

from aiortc import RTCPeerConnection, RTCSessionDescription
from aiortc.contrib.media import MediaRelay

from edge.config import config
from edge.webrtc.video_stream import OpenCvVideoTrack

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Estado
# ---------------------------------------------------------------------------

_pcs: set[RTCPeerConnection] = set()
_relay = MediaRelay()  # Permite compartir el mismo stream con varios peers


def _create_video_track() -> OpenCvVideoTrack:
    """Crea el track de video desde el buffer compartido (modo shared).

    El main loop es quien captura la cámara y escribe en el SharedFrame.
    WebRTC solo lee de ahí, no compite por la cámara.
    """
    return OpenCvVideoTrack(
        mode="shared",
        fps=config.webrtc_fps,
        frame_width=config.webrtc_frame_width,
        frame_height=config.webrtc_frame_height,
    )


# Instancia global — compartida entre peers via relay
_global_video_track: Optional[OpenCvVideoTrack] = None


def get_video_track() -> OpenCvVideoTrack:
    """Retorna (o crea) el track global de video."""
    global _global_video_track
    if _global_video_track is None:
        _global_video_track = _create_video_track()
    return _global_video_track


# ---------------------------------------------------------------------------
# Handlers HTTP
# ---------------------------------------------------------------------------

async def handle_offer(request: web.Request) -> web.Response:
    """
    Recibe una SDP Offer del frontend, crea un RTCPeerConnection en el RPi,
    agrega el video track, genera una SDP Answer y la devuelve.

    Request body (JSON):
        { "sdp": "...", "type": "offer" }

    Response (JSON):
        { "sdp": "...", "type": "answer" }
    """
    params = await request.json()

    offer = RTCSessionDescription(sdp=params["sdp"], type=params["type"])

    pc = RTCPeerConnection()
    _pcs.add(pc)

    # ── Eventos de depuración ────────────────────────────────
    @pc.on("connectionstatechange")
    async def on_connection_state_change():
        logger.info("WebRTC connection state: %s", pc.connectionState)
        if pc.connectionState in ("failed", "closed"):
            await _cleanup_pc(pc)

    @pc.on("iceconnectionstatechange")
    async def on_ice_state_change():
        logger.info("ICE state: %s", pc.iceConnectionState)

    # ── Agregar video track ──────────────────────────────────
    # Usamos relay para que múltiples frontends compartan 1 cámara
    video_track = get_video_track()
    pc.addTrack(_relay.subscribe(video_track))

    # ── Procesar offer y generar answer ──────────────────────
    await pc.setRemoteDescription(offer)

    answer = await pc.createAnswer()
    await pc.setLocalDescription(answer)

    # ── Esperar a que se recojan los ICE candidates ──────────
    # Se usa un timeout de 3s; si en 3s no se completan,
    # se devuelve la respuesta con los candidatos parciales.
    ice_complete = asyncio.Event()

    @pc.on("icegatheringstatechange")
    async def on_ice_gathering():
        if pc.iceGatheringState == "complete":
            ice_complete.set()

    try:
        await asyncio.wait_for(ice_complete.wait(), timeout=3.0)
    except asyncio.TimeoutError:
        logger.warning("ICE gathering timeout — using partial candidates")

    logger.info(
        "WebRTC answer created, %d active peer(s), ICE state: %s",
        len(_pcs), pc.iceGatheringState,
    )

    return web.json_response({
        "sdp": pc.localDescription.sdp,
        "type": pc.localDescription.type,
    })


async def handle_health(request: web.Request) -> web.Response:
    """Health check simple."""
    return web.json_response({
        "status": "ok",
        "active_peers": len(_pcs),
    })


async def _cleanup_pc(pc: RTCPeerConnection) -> None:
    """Limpia una conexión peer al cerrarse."""
    _pcs.discard(pc)
    try:
        await pc.close()
    except Exception:
        pass
    logger.info("PeerConnection cleaned up, %d remaining", len(_pcs))


async def cleanup_all() -> None:
    """Limpia todas las conexiones activas."""
    for pc in list(_pcs):
        await _cleanup_pc(pc)


# ---------------------------------------------------------------------------
# Factory: crear y arrancar el servidor
# ---------------------------------------------------------------------------

# ---------------------------------------------------------------------------
# CORS middleware
# ---------------------------------------------------------------------------


@web.middleware
async def cors_middleware(request: web.Request, handler) -> web.Response:
    """Permite CORS para que el frontend (localhost:3000) pueda conectar."""
    if request.method == "OPTIONS":
        resp = web.Response()
        resp.headers["Access-Control-Allow-Origin"] = "*"
        resp.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
        resp.headers["Access-Control-Allow-Headers"] = "Content-Type"
        return resp

    resp = await handler(request)
    resp.headers["Access-Control-Allow-Origin"] = "*"
    return resp


def create_app() -> web.Application:
    """Crea la aplicación aiohttp con las rutas de señalización."""
    app = web.Application(middlewares=[cors_middleware])

    app.router.add_post("/offer", handle_offer)
    app.router.add_get("/health", handle_health)

    app.on_shutdown.append(lambda _: cleanup_all())

    return app


async def run_signaling_server(
    host: str = "0.0.0.0",
    port: int = 8081,
) -> None:
    """
    Arranca el servidor de señalización WebRTC.

    Args:
        host: Dirección a la que bindear.
        port: Puerto (por defecto 8081 para no interferir con otras apps).
    """
    app = create_app()
    runner = web.AppRunner(app)
    await runner.setup()
    site = web.TCPSite(runner, host, port)
    await site.start()
    logger.info("WebRTC signaling server running on http://%s:%d", host, port)

"""
ARGOS SLOPE 4.0 — Backend API entry point.

FastAPI application with CORS enabled, serving the deformation velocity
engine endpoints on port 8000.

Usage:
    uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload
"""

from __future__ import annotations

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from backend.api.routes import router
from backend.database import close_db, init_db

# ── Application metadata ────────────────────────────────────────────
APP_TITLE = "ARGOS SLOPE 4.0 — Deformation Velocity Engine"
APP_DESCRIPTION = """
Backend API for mining slope deformation monitoring.

Provides image registration, deformation velocity calculation,
crack measurement, RQD analysis, and growth alert services.
"""
APP_VERSION = "1.0.0"

# ── App factory ─────────────────────────────────────────────────────
app = FastAPI(
    title=APP_TITLE,
    description=APP_DESCRIPTION,
    version=APP_VERSION,
    docs_url="/docs",
    redoc_url="/redoc",
)

# ── CORS configuration ──────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",  # Next.js dev server
        "http://127.0.0.1:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Validation error handler (422 → 400) ────────────────────────────
# Converts Pydantic validation errors to the API's standard 400 error
# contract: {"error": "message"}


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(
    request: Request, exc: RequestValidationError
) -> JSONResponse:
    """Convert Pydantic validation errors to 400 with standard error format."""
    errors = exc.errors()
    if errors:
        message = errors[0].get("msg", "Validation error")
    else:
        message = "Validation error"
    return JSONResponse(
        status_code=400,
        content={"error": message},
    )


# ── Lifecycle events ────────────────────────────────────────────────


@app.on_event("startup")
async def on_startup() -> None:
    """Initialise the database connection pool and create tables."""
    await init_db()


@app.on_event("shutdown")
async def on_shutdown() -> None:
    """Gracefully close the database connection pool."""
    await close_db()


# ── Mount routers ───────────────────────────────────────────────────
app.include_router(router)


# ── Root endpoint ───────────────────────────────────────────────────
@app.get("/", tags=["Root"])
async def root():
    """API root — returns service info."""
    return {
        "service": APP_TITLE,
        "version": APP_VERSION,
        "docs": "/docs",
        "endpoints": {
            "GET /api/health": "Health check",
            "GET /api/rqd": "RQD calculation",
            "POST /api/convert": "Pixel to mm conversion",
            "POST /api/growth/alert": "Growth alert check",
            "POST /api/deformation/velocity": "Deformation velocity",
            "POST /api/deformation/register": "Image registration",
            "GET /api/fisuras": "List fisuras",
            "GET /api/fisuras/{id}": "Fisura detail + measurements",
            "GET /api/fisuras/{id}/mediciones": "Daily measurements",
            "GET /api/resumen": "Dashboard summary",
            "GET /api/alertas": "List alerts",
            "PUT /api/alertas/{id}/reconocer": "Acknowledge alert",
            "GET /api/configuracion": "Get config",
            "PUT /api/configuracion/{clave}": "Update config",
            "POST /api/seed": "Seed sample data",
        },
    }

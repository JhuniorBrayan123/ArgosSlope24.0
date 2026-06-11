"""
ARGOS SLOPE 4.0 — Backend API
Serves crack history and velocity data from the edge's crack_history.json.
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.routes import router

app = FastAPI(
    title="ARGOS SLOPE 4.0 — API",
    description="Mining slope deformation monitoring API",
    version="2.0.0",
    docs_url="/docs",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router)


@app.get("/")
async def root():
    return {
        "service": "ARGOS SLOPE 4.0 API",
        "version": "2.0.0",
        "docs": "/docs",
        "endpoints": {
            "GET /api/fisuras": "List fisuras from edge data",
            "GET /api/fisuras/{track_id}": "Fisura detail + measurements",
            "GET /api/fisuras/{track_id}/mediciones": "Historical measurements",
            "GET /api/resumen": "Dashboard summary",
            "GET /api/alertas": "Velocity alerts",
            "PUT /api/alertas/{alerta_id}/reconocer": "Acknowledge alert",
            "GET /api/configuracion": "Get config",
            "PUT /api/configuracion/{clave}": "Update config",
            "GET /api/health": "Health check",
        },
    }

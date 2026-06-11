#!/usr/bin/env bash
#
# ARGOS SLOPE 4.0 — Launch both backend (FastAPI) and frontend (Next.js).
#
# Starts uvicorn for the FastAPI backend and npm run dev for the Next.js
# frontend in background processes. PIDs are displayed. Press Ctrl+C to
# stop both.
#

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

echo "╔══════════════════════════════════════════╗"
echo "║   ARGOS SLOPE 4.0 — Iniciando servicios  ║"
echo "╚══════════════════════════════════════════╝"
echo ""

cleanup() {
    echo ""
    echo "Deteniendo servicios..."
    [ -n "${BACKEND_PID:-}" ] && kill "$BACKEND_PID" 2>/dev/null || true
    [ -n "${FRONTEND_PID:-}" ] && kill "$FRONTEND_PID" 2>/dev/null || true
    wait "$BACKEND_PID" "$FRONTEND_PID" 2>/dev/null || true
    echo "✓ Servicios detenidos"
}
trap cleanup EXIT INT TERM

# ── 1. Backend (FastAPI) ──────────────────────────────────────────────
echo "[1/2] Iniciando backend FastAPI..."
cd "$ROOT_DIR"
# Activate venv if present
if [ -f ".venv/bin/activate" ]; then
    source .venv/bin/activate
fi
uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload &
BACKEND_PID=$!
echo "  → Backend PID: $BACKEND_PID"
echo "  → http://localhost:8000"
echo "  → http://localhost:8000/docs (Swagger)"
echo ""

# ── 2. Frontend (Next.js) ────────────────────────────────────────────
echo "[2/2] Iniciando frontend Next.js..."
cd "$ROOT_DIR/frontend"
npm run dev &
FRONTEND_PID=$!
echo "  → Frontend PID: $FRONTEND_PID"
echo "  → http://localhost:3000"
echo ""

echo "══════════════════════════════════════════"
echo "  Backend PID  : $BACKEND_PID"
echo "  Frontend PID : $FRONTEND_PID"
echo "══════════════════════════════════════════"
echo ""
echo "Presiona Ctrl+C para detener ambos servicios."

# Wait for either process to exit
wait

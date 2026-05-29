#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
# ARGOS SLOPE 4.0 — Inicio rápido (Linux / macOS)
#
# Uso:
#   chmod +x scripts/start.sh
#   ./scripts/start.sh
#
# Requisitos:
#   - Python 3.10+ con dependencias instaladas (pip install -r backend/requirements.txt)
#   - Node.js 18+ con dependencias instaladas (npm install)
#   - PostgreSQL 14+ corriendo en localhost:5432
# ═══════════════════════════════════════════════════════════════════════════
set -e

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

echo "═══════════════════════════════════════════════════════════════"
echo "  ARGOS SLOPE 4.0 — Iniciando servicios..."
echo "═══════════════════════════════════════════════════════════════"

# ── 1. Backend (FastAPI en puerto 8000) ────────────────────────────
echo ""
echo "[1/2] Iniciando backend (FastAPI) en http://localhost:8000 ..."
cd "$ROOT_DIR/backend"
# Cargar .env si existe
if [ -f "$ROOT_DIR/.env" ]; then
    set -a
    source "$ROOT_DIR/.env"
    set +a
fi
uvicorn main:app --host 0.0.0.0 --port 8000 --reload &
BACKEND_PID=$!
echo "  → PID del backend: $BACKEND_PID"

# Esperar a que el backend esté listo
echo "  → Esperando al backend..."
for i in $(seq 1 30); do
    if curl -s http://localhost:8000/api/health > /dev/null 2>&1; then
        echo "  → Backend listo ✓"
        break
    fi
    if [ "$i" -eq 30 ]; then
        echo "  ⚠ No se pudo conectar al backend después de 30s"
    fi
    sleep 1
done

# ── 2. Frontend (Next.js en puerto 3000) ───────────────────────────
echo ""
echo "[2/2] Iniciando frontend (Next.js) en http://localhost:3000 ..."
cd "$ROOT_DIR"
npm run dev &
FRONTEND_PID=$!
echo "  → PID del frontend: $FRONTEND_PID"

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "  Servicios iniciados:"
echo "    • Backend:  http://localhost:8000"
echo "    • Frontend: http://localhost:3000"
echo "    • API Docs: http://localhost:8000/docs"
echo ""
echo "  Para detener: kill $BACKEND_PID $FRONTEND_PID"
echo "═══════════════════════════════════════════════════════════════"

# Capturar SIGINT/SIGTERM y detener ambos procesos
trap "echo ''; echo 'Deteniendo servicios...'; kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit 0" SIGINT SIGTERM

# Mantener el script en ejecución
wait

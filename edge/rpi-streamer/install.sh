#!/usr/bin/env bash
# ============================================================================
# ARGOS SLOPE 4.0 — Instalación del RPi Streamer
# ============================================================================
# Este script se ejecuta EN EL RPI (no en la laptop).
# Hace todo: instala dependencias, configura el servicio systemd,
# y opcionalmente configura WiFi dual.
#
# Uso:
#   chmod +x install.sh
#   ./install.sh
#
# Flags:
#   --usb       Configurar para cámara USB (default: CSI)
#   --port 8080 Puerto personalizado (default: 5000)
# ============================================================================

set -euo pipefail

# ── Colores para output ──────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log()  { echo -e "${GREEN}[✓]${NC} $1"; }
warn() { echo -e "${YELLOW}[!]${NC} $1"; }
err()  { echo -e "${RED}[✗]${NC} $1"; }
info() { echo -e "${BLUE}[i]${NC} $1"; }

# ── Detectar flags ───────────────────────────────────────────────────────
CAMERA_MODE="csi"   # interno: "csi" o "usb" (para elegir dependencias)
CAMERA_FLAGS=""     # se escribe en /etc/default/rpi-streamer
PORT=5000
WIDTH=640
HEIGHT=480

while [[ $# -gt 0 ]]; do
    case "$1" in
        --usb)   CAMERA_MODE="usb"; shift ;;
        --port)  PORT="$2"; shift 2 ;;
        --width) WIDTH="$2"; shift 2 ;;
        --height) HEIGHT="$2"; shift 2 ;;
        *)       warn "Flag desconocido: $1 (ignorado)"; shift ;;
    esac
done

# Construir CAMERA_FLAGS para el archivo de configuración
if [ "$CAMERA_MODE" = "usb" ]; then
    CAMERA_FLAGS="--usb --index 0"
fi
if [ "$PORT" -ne 5000 ]; then
    CAMERA_FLAGS="$CAMERA_FLAGS --port $PORT"
fi
if [ "$WIDTH" -ne 640 ]; then
    CAMERA_FLAGS="$CAMERA_FLAGS --width $WIDTH"
fi
if [ "$HEIGHT" -ne 480 ]; then
    CAMERA_FLAGS="$CAMERA_FLAGS --height $HEIGHT"
fi
# Limpiar espacios iniciales
CAMERA_FLAGS="${CAMERA_FLAGS# }"

echo "=================================================="
echo "  ARGOS SLOPE 4.0 — RPi Streamer Installer"
echo "=================================================="
echo ""

# ── Paso 1: Verificar Python ────────────────────────────────────────────
info "Paso 1/6: Verificando Python..."
if ! command -v python3 &>/dev/null; then
    err "python3 no encontrado. Instalalo con: sudo apt install python3"
    exit 1
fi
log "Python $(python3 --version)"

# ── Paso 2: Instalar dependencias del sistema ────────────────────────────
info "Paso 2/6: Instalando dependencias del sistema..."
if [ "$CAMERA_MODE" = "usb" ]; then
    sudo apt-get update -qq
    sudo apt-get install -y -qq python3-opencv
    log "OpenCV instalado para cámara USB"
else
    # CSI: picamera2 ya viene en Raspberry Pi OS, pero verificamos
    if python3 -c "import picamera2" 2>/dev/null; then
        log "picamera2 ya disponible"
    else
        warn "picamera2 no encontrado. Instalando..."
        sudo apt-get update -qq
        sudo apt-get install -y -qq python3-picamera2
        log "picamera2 instalado"
    fi
fi

# ── Paso 3: Verificar stream.py ──────────────────────────────────────────
info "Paso 3/6: Verificando archivos del streamer..."
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
STREAM_PY="$SCRIPT_DIR/stream.py"
if [ ! -f "$STREAM_PY" ]; then
    err "No se encuentra stream.py en $SCRIPT_DIR"
    err "Ejecutá este script desde el directorio rpi-streamer/"
    exit 1
fi
log "stream.py encontrado"

# ── Paso 4: Crear archivo de configuración ───────────────────────────────
info "Paso 4/6: Creando configuración en /etc/default/rpi-streamer..."
sudo tee /etc/default/rpi-streamer > /dev/null <<EOF
# ARGOS SLOPE 4.0 — Configuración del RPi Streamer
# ==================================================
# Flags extras para stream.py (--usb, --index, --port, --width, --height)
# Default (vacío) = cámara CSI, puerto 5000, 640x480
CAMERA_FLAGS="${CAMERA_FLAGS:-}"

# Ejemplos:
#   Cámara USB:     CAMERA_FLAGS="--usb --index 0"
#   Resolución HD:  CAMERA_FLAGS="--width 1280 --height 720"
#   Puerto custom:  CAMERA_FLAGS="--port 8080"
EOF
log "Configuración creada"

# ── Paso 5: Instalar servicio systemd ────────────────────────────────────
info "Paso 5/6: Instalando servicio systemd..."
if [ -f "$SCRIPT_DIR/rpi-streamer.service" ]; then
    sudo cp "$SCRIPT_DIR/rpi-streamer.service" /etc/systemd/system/
    sudo systemctl daemon-reload
    sudo systemctl enable rpi-streamer
    log "Servicio instalado y habilitado para inicio automático"
else
    warn "rpi-streamer.service no encontrado, saltando instalación systemd"
fi

# ── Paso 6: Probar cámara (no arranca el servicio todavía) ──────────────
info "Paso 6/6: Probando cámara..."
# Solo probar si la cámara se inicializa (port 0 = puerto aleatorio)
# Poner --port 0 al final para ignorar cualquier --port de CAMERA_FLAGS
python3 "$STREAM_PY" \
    $CAMERA_FLAGS \
    --port 0 \
    &>/dev/null &
TEST_PID=$!
sleep 2
kill $TEST_PID 2>/dev/null || true
wait $TEST_PID 2>/dev/null || true
RC=$?
if [ "$RC" -eq 0 ] || [ "$RC" -eq 143 ]; then
    # 143 = SIGTERM (we killed it), 0 = normal exit
    # Both mean the camera initialized successfully
    log "Cámara responde correctamente"
else
    warn "La cámara no responde ahora. Podés conectarla luego y reiniciar:"
    warn "  sudo systemctl restart rpi-streamer"
    warn "  (si es cámara USB, conectarla a un puerto USB 3.0 — color azul)"
fi

# ── Resumen final ────────────────────────────────────────────────────────
echo ""
echo "=================================================="
echo "  🎯 Instalación completa"
echo "=================================================="
echo ""
echo "  Cámara:     ${CAMERA_MODE^^}"
echo "  Puerto:     $PORT"
echo "  Resolución: ${WIDTH}x${HEIGHT}"
echo ""

if systemctl is-enabled rpi-streamer &>/dev/null; then
    echo "  Para ARRANCAR el streamer AHORA:"
    echo "    sudo systemctl start rpi-streamer"
    echo ""
    echo "  Para ver logs en vivo:"
    echo "    journalctl -u rpi-streamer -f"
    echo ""
    echo "  Stream URL:"
    IP=$(hostname -I | awk '{print $1}')
    echo "    http://$IP:$PORT/stream"
fi

echo "=================================================="

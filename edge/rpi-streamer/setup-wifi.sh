#!/usr/bin/env bash
# ============================================================================
# ARGOS SLOPE 4.0 — Configuración WiFi Dual
# ============================================================================
# Configura el RPi para conectarse automáticamente a DOS redes WiFi.
# Ideal para la presentación: una red en casa, otra en el instituto.
#
# Uso:
#   sudo ./setup-wifi.sh
#
# Te va a pedir:
#   - SSID y contraseña de la Red 1 (casa)
#   - SSID y contraseña de la Red 2 (instituto / hotspot)
#
# El RPi se conecta a la que esté disponible.
# La Red 1 tiene prioridad (si ambas están visibles).
#
# Backup automático:
#   /etc/wpa_supplicant/wpa_supplicant.conf -> .backup
# ============================================================================

set -euo pipefail

# ── Colores ──────────────────────────────────────────────────────────────
ROJO='\033[0;31m'
VERDE='\033[0;32m'
AMARILLO='\033[1;33m'
AZUL='\033[0;34m'
RESET='\033[0m'

ok()   { echo -e "${VERDE}[✓]${RESET} $1"; }
warn() { echo -e "${AMARILLO}[!]${RESET} $1"; }
err()  { echo -e "${ROJO}[✗]${RESET} $1"; }
info() { echo -e "${AZUL}[i]${RESET} $1"; }

# ── Verificar que somos root ─────────────────────────────────────────────
if [ "$EUID" -ne 0 ]; then
    err "Este script necesita sudo. Ejecutalo asi:"
    err "  sudo ./setup-wifi.sh"
    exit 1
fi

echo "=================================================="
echo "  ARGOS SLOPE 4.0 — WiFi Dual Setup"
echo "=================================================="
echo ""

# ── Paso 1: Verificar interfaz WiFi ─────────────────────────────────────
info "Paso 1/4: Verificando interfaz WiFi..."
WLAN_IFACE=""

# Buscar interfaces inalámbricas
for iface in /sys/class/net/*/wireless; do
    [ -e "$iface" ] && WLAN_IFACE="$(basename "$(dirname "$iface")")" && break
done

if [ -z "$WLAN_IFACE" ]; then
    # Fallback: buscar con iwconfig
    WLAN_IFACE=$(iwconfig 2>/dev/null | grep -oP '^\S+' | head -1 || true)
fi

if [ -z "$WLAN_IFACE" ]; then
    err "No se encontró interfaz WiFi."
    err "¿El RPi tiene WiFi y está encendido?"
    err "Probá: iwconfig"
    exit 1
fi
ok "Interfaz detectada: $WLAN_IFACE"

# ── Paso 2: Pedir datos de las redes ────────────────────────────────────
echo ""
info "Paso 2/4: Ingresá los datos de las redes WiFi."
echo "  (Dejá la Red 2 vacía para configurar solo una red)"
echo ""

read -r -p "  SSID de la Red 1 (casa): " SSID1
while [ -z "$SSID1" ]; do
    warn "El SSID no puede estar vacío."
    read -r -p "  SSID de la Red 1 (casa): " SSID1
done

read -r -s -p "  Contraseña de '${SSID1}': " PASS1
echo ""
while [ -z "$PASS1" ]; do
    warn "La contraseña no puede estar vacía."
    read -r -s -p "  Contraseña de '${SSID1}': " PASS1
    echo ""
done

echo ""
read -r -p "  SSID de la Red 2 (instituto/hotspot, opcional): " SSID2
if [ -n "$SSID2" ]; then
    read -r -s -p "  Contraseña de '${SSID2}': " PASS2
    echo ""
    while [ -z "$PASS2" ]; do
        warn "La contraseña no puede estar vacía."
        read -r -s -p "  Contraseña de '${SSID2}': " PASS2
        echo ""
    done
else
    info "Solo se configurará la Red 1."
fi

# ── Paso 3: Generar configuración ───────────────────────────────────────
echo ""
info "Paso 3/4: Generando configuración..."

WPA_CONF="/etc/wpa_supplicant/wpa_supplicant.conf"

# Backup
if [ -f "$WPA_CONF" ]; then
    cp "$WPA_CONF" "${WPA_CONF}.backup"
    ok "Backup guardado: ${WPA_CONF}.backup"
fi

# Generar contraseñas hasheadas (PSK) para no guardar texto plano
PSK1=$(wpa_passphrase "$SSID1" "$PASS1" 2>/dev/null | grep -E '^\s+psk=' | head -1 | awk -F= '{print $2}')
if [ -z "$PSK1" ]; then
    err "Error generando PSK para '$SSID1'. Revisá el SSID."
    exit 1
fi

PSK2=""
if [ -n "$SSID2" ] && [ -n "$PASS2" ]; then
    PSK2=$(wpa_passphrase "$SSID2" "$PASS2" 2>/dev/null | grep -E '^\s+psk=' | head -1 | awk -F= '{print $2}')
    if [ -z "$PSK2" ]; then
        err "Error generando PSK para '$SSID2'. Revisá el SSID."
        exit 1
    fi
fi

# Escribir configuración
cat > "$WPA_CONF" <<EOF
ctrl_interface=DIR=/var/run/wpa_supplicant GROUP=netdev
update_config=1
country=AR

# Red 1 — Casa (prioridad alta)
network={
    ssid="$SSID1"
    psk=$PSK1
    priority=10
}
EOF

if [ -n "$SSID2" ] && [ -n "$PSK2" ]; then
    cat >> "$WPA_CONF" <<EOF

# Red 2 — Instituto / Hotspot (prioridad baja)
network={
    ssid="$SSID2"
    psk=$PSK2
    priority=5
}
EOF
fi

ok "Configuración escrita en $WPA_CONF"

# ── Paso 4: Aplicar ─────────────────────────────────────────────────────
echo ""
info "Paso 4/4: Aplicando configuración..."

# Intentar recargar wpa_supplicant
if systemctl is-active wpa_supplicant &>/dev/null; then
    systemctl restart wpa_supplicant
    ok "Servicio wpa_supplicant reiniciado"
else
    warn "wpa_supplicant no está activo como servicio."
    warn "Probá reiniciando: sudo systemctl restart wpa_supplicant"
fi

# Reconfigurar interfaz
if command -v wpa_cli &>/dev/null; then
    wpa_cli -i "$WLAN_IFACE" reconfigure 2>/dev/null || true
fi

# Traer interfaz arriba
ip link set "$WLAN_IFACE" up 2>/dev/null || true

echo ""
echo "=================================================="
echo "  🎯 WiFi Dual configurado!"
echo "=================================================="
echo ""

# Esperar conexión y mostrar IP
sleep 3
IP=$(ip -4 addr show "$WLAN_IFACE" 2>/dev/null | grep -oP 'inet \K[\d.]+' || echo "conectando...")
HOSTNAME=$(hostname)

echo "  Red 1: $SSID1 (prioridad alta)"
if [ -n "$SSID2" ]; then
    echo "  Red 2: $SSID2"
fi
echo ""
echo "  Hostname: $HOSTNAME"
echo "  IP actual: $IP"
echo ""
echo "  Para probar el streamer:"
echo "    sudo systemctl start rpi-streamer"
echo ""
echo "  Para ver a qué red se conectó:"
echo "    iwconfig $WLAN_IFACE"
echo ""
echo "  Para restaurar la config anterior:"
echo "    sudo cp ${WPA_CONF}.backup $WPA_CONF"
echo "    sudo systemctl restart wpa_supplicant"
echo ""
echo "=================================================="

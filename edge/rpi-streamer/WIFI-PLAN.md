# Plan WiFi — Presentación ARGOS SLOPE 4.0

## El problema

El RPi está configurado con el WiFi de casa (`192.168.1.x`).
En el instituto, la red va a ser diferente — no va a encontrar WiFi y el
streamer no va a funcionar.

## Soluciones

### 🟢 Opción A — Hotspot con mismo SSID (recomendada)

Usás **tu celular como hotspot** con el **mismo nombre y contraseña** que el WiFi de casa.

| Red actual (casa) | Hotspot del celu |
|---|---|
| SSID: `MiWiFi` | SSID: `MiWiFi` |
| Pass: `clave123` | Pass: `clave123` |

**Ventajas:**
- ✅ El RPi se conecta solo — no hay que tocar nada
- ✅ Funciona en cualquier lado (instituto, café, sala de conferencias)
- ✅ Lo probaste antes de salir de casa
- ✅ Si hay internet en el celu, el RPi también tiene internet (MQTT sigue andando)

**Desventajas:**
- ⚠️ El celu tiene que estar cerca del RPi
- ⚠️ Consume batería del celular

**Como hacerlo:**
1. En casa: fijate el SSID y contraseña de tu WiFi (`netsh wlan show profiles` en Windows, o mirá el router)
2. En el instituto: activá hotspot en tu celu, poné **exactamente** el mismo SSID y contraseña
3. El RPi se conecta solo en segundos

---

### 🟡 Opción B — WiFi dual (más robusta)

Configurás el RPi para que conozca **dos redes**: la de casa y la del instituto.
El RPi se conecta a la que esté disponible automáticamente.

**Ventajas:**
- ✅ No depende del hotspot del celu
- ✅ Podés usar la red del instituto si tiene internet
- ✅ Sigue andando aunque el celu esté apagado

**Desventajas:**
- ⚠️ Hay que tener los datos de la red del instituto (SSID + contraseña)
- ⚠️ Si la red del instituto requiere login por portal cautivo no va a funcionar

**Requisito:** el script `setup-wifi.sh` ya está en `edge/rpi-streamer/`. Solo hay que subirlo
al RPi (junto con el resto) y ejecutarlo una sola vez.

**Opción 1 — Desde la laptop (automático):**

```bash
deploy-rpi.bat --wifi
```
(Te pide las redes, sube el script y lo ejecuta en el RPi)

**Opción 2 — Manual en el RPi:**

```bash
# Conectate al RPi
ssh jhunior@192.168.1.7

# Ejecutá el script de configuración WiFi (ya subido)
cd ~/rpi-streamer
sudo ./setup-wifi.sh
```

**Opción 3 — Directo sin subir (si tenés internet en el RPi):**

Podés llevar el script en un USB o generarlo con `nano`.
O pedírmelo a mí y te ayudo.

---

En cualquier caso, el script te va a pedir:
- SSID y password de la **Red 1** (casa) ← la actual
- SSID y password de la **Red 2** (instituto / hotspot) ← la nueva

El RPi quedará configurado para conectarse a cualquiera de las dos,
dando prioridad a la de casa.

---

### 🔴 Opción C — Manual (plan de contingencia)

Si nada de lo anterior funciona, llevate:
1. Un monitor HDMI chico + teclado para el RPi
2. Un cable de red ethernet por si las dudas
3. Los comandos para cambiar WiFi a mano:

```bash
# Ver redes disponibles
sudo iwlist wlan0 scan | grep ESSID

# Editar configuración WiFi
sudo nano /etc/wpa_supplicant/wpa_supplicant.conf

# Cambiar el SSID y password, luego:
sudo systemctl restart wpa_supplicant

# Verificar conexión
ip addr show wlan0
ping 8.8.8.8
```

---

## Checklist pre-presentación

- [ ] Streamer funciona en casa (probar con la laptop)
- [ ] Decidir opción WiFi (A / B / C)
- [ ] Si opción A: configurar hotspot en el celu antes de salir
- [ ] Si opción B: tener SSID+password de la red del instituto
- [ ] Si opción C: llevar monitor+teclado+ethernet
- [ ] Probar que el celu (hotspot) tiene suficiente batería para la presentación
- [ ] Llevar cargador del RPi
- [ ] Llevar cable HDMI por si necesitás ver la terminal del RPi

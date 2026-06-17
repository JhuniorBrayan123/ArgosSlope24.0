#!/usr/bin/env python3
"""Quick MQTT diagnostic — subscribe to Snapshot3D topic for 30s."""
from __future__ import annotations

import json
import os
import sys
import time

try:
    import paho.mqtt.client as mqtt
except ImportError:
    print("ERROR: pip install paho-mqtt")
    sys.exit(1)

BROKER = os.getenv("MQTT_BROKER", "f7d15ef59be6462fa26af237cfa21b0f.s1.eu.hivemq.cloud")
PORT = int(os.getenv("MQTT_PORT", "8883"))
USER = os.getenv("MQTT_USERNAME", "argos-edge")
PASS = os.getenv("MQTT_PASSWORD", "Argosmineria123.@")
TLS = os.getenv("MQTT_TLS_ENABLED", "true").lower() == "true"
TOPIC = os.getenv("ALERT_TOPIC", "mineria/talud/alertas")

received: list[dict] = []


def on_connect(client, userdata, flags, rc, properties=None):
    if rc == 0:
        print(f"OK conectado a {BROKER}:{PORT}")
        client.subscribe(TOPIC, qos=1)
        print(f"Suscrito a {TOPIC}")
    else:
        print(f"ERROR conexión rc={rc}")


def on_message(client, userdata, msg):
    try:
        payload = json.loads(msg.payload.decode())
        has_mesh = bool(payload.get("mesh", {}).get("vertices"))
        has_tex = bool(payload.get("image_base64"))
        cracks = len(payload.get("cracks", []))
        pts = payload.get("point_count", 0)
        print(
            f"← SNAPSHOT device={payload.get('device_id')} "
            f"mesh={has_mesh} texture={has_tex} cracks={cracks} pts={pts}"
        )
        received.append(payload)
    except Exception as exc:
        print(f"← mensaje malformado: {exc}")


def main() -> None:
    client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2)
    if USER:
        client.username_pw_set(USER, PASS)
    if TLS:
        client.tls_set()
    client.on_connect = on_connect
    client.on_message = on_message

    print(f"Conectando a {BROKER}:{PORT} (TLS={TLS})...")
    client.connect(BROKER, PORT, keepalive=60)
    client.loop_start()

    deadline = time.time() + 30
    while time.time() < deadline:
        time.sleep(1)

    client.loop_stop()
    client.disconnect()
    print(f"\nResultado: {len(received)} snapshot(s) en 30s")
    if not received:
        print("⚠ No llegó ningún snapshot — el Edge no está publicando o MQTT falló.")


if __name__ == "__main__":
    main()

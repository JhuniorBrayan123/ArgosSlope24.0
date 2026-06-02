#!/usr/bin/env python3
"""
ARGOS SLOPE 4.0 — Test rápido del pipeline MQTT.

Publica fisuras simuladas cada 2 segundos para verificar que:
  1. El broker MQTT (Mosquitto) está accesible
  2. El backend .NET recibe y persiste los mensajes
  3. El frontend muestra los bounding boxes

Uso:
    # Broker local por defecto
    python edge/test_mqtt_pipeline.py

    # Broker remoto (RPi)
    python edge/test_mqtt_pipeline.py --broker 192.168.1.100
"""

from __future__ import annotations

import argparse
import json
import logging
import random
import sys
import time

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
logger = logging.getLogger("test-mqtt")

try:
    import paho.mqtt.client as mqtt
except ImportError:
    logger.error("paho-mqtt no instalado. Ejecuta: pip install paho-mqtt")
    sys.exit(1)


def main() -> None:
    parser = argparse.ArgumentParser(description="Test MQTT pipeline")
    parser.add_argument("--broker", default="localhost", help="MQTT broker address")
    parser.add_argument("--port", type=int, default=1883, help="MQTT port")
    parser.add_argument("--username", default="", help="MQTT username (HiveMQ Cloud)")
    parser.add_argument("--password", default="", help="MQTT password (HiveMQ Cloud)")
    parser.add_argument("--tls", action="store_true", help="Enable TLS (required for HiveMQ Cloud port 8883)")
    parser.add_argument("--interval", type=float, default=2.0, help="Seconds between messages")
    parser.add_argument("--count", type=int, default=10, help="Number of messages (-1 = infinite)")
    args = parser.parse_args()

    # ── Conectar ────────────────────────────────────────────────────
    client = mqtt.Client(client_id=f"argos-test-{int(time.time())}")

    if args.username:
        client.username_pw_set(args.username, args.password)

    if args.tls:
        client.tls_set()

    client.connect(args.broker, args.port, keepalive=60)
    client.loop_start()
    logger.info("Conectado a %s:%d (TLS=%s)", args.broker, args.port, args.tls)

    # ── Publicar fisuras simuladas ──────────────────────────────────
    classifications = ["fina", "media", "gruesa"]
    count = 0
    max_count = args.count if args.count > 0 else float("inf")

    try:
        while count < max_count:
            count += 1
            roi_id = f"CRK-TEST-{count:04d}"

            payload = {
                "event": "fisura_detectada",
                "device_id": "slope-test-01",
                "roi_id": roi_id,
                "x": random.randint(50, 500),
                "y": random.randint(50, 350),
                "width": random.randint(20, 80),
                "height": random.randint(15, 60),
                "length_mm": round(random.uniform(10.0, 120.0), 1),
                "width_mm": round(random.uniform(0.5, 5.0), 2),
                "area_mm2": round(random.uniform(5.0, 300.0), 1),
                "classification": random.choice(classifications),
                "orientation_deg": round(random.uniform(0, 180), 1),
                "confidence": round(random.uniform(0.6, 0.99), 3),
                "timestamp": time.time(),
            }

            topic = f"argos/slope-test-01/fisura"
            client.publish(topic, json.dumps(payload), qos=1)

            logger.info(
                "[%d/%s] Publicado %s → %s (%s, %.1fmm, %.0f%%)",
                count,
                "∞" if max_count == float("inf") else str(int(max_count)),
                topic,
                roi_id,
                payload["classification"],
                payload["length_mm"],
                payload["confidence"] * 100,
            )

            time.sleep(args.interval)

        logger.info("Test completado. %d mensajes publicados.", count)

    except KeyboardInterrupt:
        logger.info("Interrumpido por el usuario.")

    finally:
        client.loop_stop()
        client.disconnect()
        logger.info("Desconectado.")


if __name__ == "__main__":
    main()

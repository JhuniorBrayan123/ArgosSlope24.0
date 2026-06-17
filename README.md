# ARGOS SLOPE 4.0

**Monitoreo geotécnico de taludes mineros con detección de fisuras en tiempo real.**

Sistema distribuido que captura video desde un edge (Raspberry Pi / laptop), detecta fisuras
con OpenCV, estima profundidad con MiDaS, genera nubes de puntos 3D y visualiza todo en un
dashboard Next.js. Los datos se persisten en PostgreSQL vía backend .NET.

---

## Arquitectura

```
Edge Python (laptop/RPi)
  ├─ Captura cámara USB/webcam
  ├─ Detección OpenCV (fisuras)
  ├─ MiDaS Depth Estimation (profundidad)
  ├─ Point Cloud Generator
  ├─ MJPEG Stream (:8082)
  └─ WebRTC Signaling (:8081)
        │
        ▼
MQTT Broker (Mosquitto / HiveMQ Cloud)
        │
        ├──────────────────────────────────┐
        ▼                                  ▼
Frontend Next.js                 Backend .NET 8 + PostgreSQL
  ├─ Monitoreo en tiempo real       ├─ GET/POST /api/fisuras
  ├─ Visualización 3D (R3F)        ├─ GET/POST /api/alertas
  ├─ Historial de fisuras           ├─ GET/PUT /api/configuracion
  ├─ Alertas                        ├─ POST /api/geotecnia/rqd
  ├─ Configuración                  ├─ MQTT subscriber (fisuras, telemetry)
  └─ Video en vivo (MJPEG)          └─ Risk Engine + predicciones
```

---

## Requisitos

| Componente | Versión | Instalación |
|-----------|---------|-------------|
| Docker Desktop | 28+ | docker.com |
| .NET SDK | 8.0 | dotnet.microsoft.com |
| Python | 3.10+ | python.org |
| Node.js | 20+ | nodejs.org |

---

## Inicio Rápido

### 1. PostgreSQL + Mosquitto + Backend .NET (vía Docker)

```bash
# Iniciar servicios core
docker compose up -d postgres mosquitto backend-dotnet

# Verificar
docker compose logs -f

# Probar health endpoint
curl http://localhost:8000/api/health
```

### 2. Backend .NET (local, sin Docker)

```bash
# Requisito: PostgreSQL corriendo y base 'mineriadb' creada

# Opción A: Script
.\scripts\run-dotnet.ps1

# Opción B: Manual
$env:DATABASE_URL="Host=localhost;Database=mineriadb;Username=postgres;Password=postgres"
dotnet run --project backend/src/ArgosSlope.Api
```

### 3. Edge Python (procesamiento de video)

```bash
cd edge

# Instalar dependencias
pip install -r requirements.txt

# Ejecutar (con cámara USB)
python -m edge.main

# Ejecutar (sin cámara, modo video de prueba)
CAMERA_SOURCE=videos/test.mp4 python -m edge.main
```

### 4. Frontend Next.js

```bash
cd frontend

# Instalar dependencias
npm install

# Configurar backend (copiar y ajustar)
copy .env.example .env.local

# Iniciar
npm run dev
```

Abrir http://localhost:3000

---

## Calibración de Cámara

Las mediciones en mm **no son confiables hasta que la cámara esté calibrada**.

```bash
# 1. Generar patrones de calibración para imprimir
python -m edge.calibration.run_calibration --generate --output calib_patterns/

# 2. Imprimir el tablero de ajedrez y tomar 10-15 fotos desde distintos ángulos
#    Guardar en: edge/edge/calibration/calib_images/

# 3. Ejecutar calibración completa
python -m edge.calibration.run_calibration --dir edge/edge/calibration/calib_images/

# 4. (Opcional) Detectar marcador ArUco para escala px/mm
python -m edge.calibration.run_calibration --aruco foto_con_marcador.jpg

# 5. Verificar estado
python -m edge.calibration.run_calibration --status
```

**Nota**: Sin calibración, el sistema usa valores por defecto (fx=1408, fy=1408, cx=640, cy=360)
y las mediciones 3D se marcan como "no calibradas". El Edge mostrará una advertencia en los logs.

---

## Migración de Datos (JSON → PostgreSQL)

Si existen datos en `backend/crack_history.json` (del backend FastAPI legacy):

```bash
# Requisito: Backend .NET corriendo en http://localhost:8000
.\scripts\migrate-json-to-postgres.ps1
```

---

## Modos de Ejecución

| Variable | Valores | Efecto |
|----------|---------|--------|
| `DEMO_MODE` | `true` / `false` | Activa/desactiva datos simulados |
| `NEXT_PUBLIC_DEMO_MODE` | `true` / `false` | Frontend muestra indicador demo |
| `EDGE_WEBRTC_ENABLED` | `true` / `false` | WebRTC streaming |
| `DETECTOR_METHOD` | `opencv` / `onnx` | Motor de detección |
| `SIMULATOR_ENABLED` | `true` / `false` | Simulador de fisuras |

---

## API Endpoints (Backend .NET)

### Fisuras
| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/fisuras` | Listar todas las fisuras |
| GET | `/api/fisuras/{id}` | Detalle con mediciones y alertas |
| POST | `/api/fisuras` | Registrar nueva fisura |
| PUT | `/api/fisuras/{id}` | Actualizar fisura |
| GET | `/api/fisuras/{id}/mediciones` | Mediciones históricas |
| POST | `/api/fisuras/{id}/mediciones` | Agregar medición |
| GET | `/api/fisuras/predicciones` | Predicciones de tendencia |
| GET | `/api/fisuras/predicciones/{roiId}` | Predicción por fisura |

### Alertas
| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/alertas` | Listar alertas |
| POST | `/api/alertas` | Crear alerta manual |
| PUT | `/api/alertas/{id}/reconocer` | Reconocer alerta |

### Geotecnia (servicios archivados)
| Método | Ruta | Descripción |
|--------|------|-------------|
| POST | `/api/geotecnia/rqd` | Calcular RQD |
| POST | `/api/geotecnia/deformacion` | Velocidad deformación |
| POST | `/api/geotecnia/crecimiento` | Evaluar crecimiento |

### Sistema
| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/health` | Health check |
| GET | `/api/resumen` | Dashboard summary |
| GET | `/api/configuracion` | Obtener configuración |
| PUT | `/api/configuracion/{clave}` | Actualizar configuración |

Documentación Swagger: http://localhost:8000/swagger

---

## Tests

```bash
# Backend .NET
dotnet test backend/src/ArgosSlope.Tests

# Edge Python
cd edge
python -m pytest edge/tests/ -v

# Frontend
cd frontend
npm test
```

---

## Variables de Entorno

### Backend (.env)
```
DATABASE_URL=Host=localhost;Database=mineriadb;Username=postgres;Password=postgres
MQTT_BROKER=localhost
MQTT_PORT=1883
MQTT_TLS_ENABLED=false
CORS_ORIGINS=http://localhost:3000
DEMO_MODE=false
```

### Frontend (.env.local)
```
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_MQTT_WS_URL=ws://localhost:9001
NEXT_PUBLIC_MJPEG_URL=http://localhost:8082/video_feed
NEXT_PUBLIC_DEMO_MODE=false
```

---

## Flujo de Datos

### Tiempo real (baja latencia)
```
Edge (detección) → MQTT → Frontend (WebSocket) → FisuraOverlay + NubePuntos3D
```

### Histórico (persistencia)
```
Edge → MQTT → Backend .NET → PostgreSQL → Frontend (REST API)
```

### Risk Engine (alertas)
```
Backend .NET evalúa fisura contra umbrales configurables
  → Si supera umbral → genera Alerta en PostgreSQL
    → Frontend muestra alerta no reconocida
      → Usuario reconoce (PUT /api/alertas/{id}/reconocer)
```

---

## Roadmap Técnico

| Fase | Estado | Descripción |
|------|--------|-------------|
| F1: Backend .NET + PostgreSQL | ✅ | API REST, migraciones, docker-compose corregido |
| F2: Migración JSON → PostgreSQL | ✅ | Script migrate-json-to-postgres.ps1 |
| F3: Ingesta MQTT | ✅ | MqttSubscriberHostedService con fisura/telemetry/snapshot |
| F4: Calibración | ✅ | CLI run_calibration.py, carga desde calibration.json |
| F5: Risk Engine | ✅ | Evaluación multi-factor, umbrales configurables |
| F6: Servicios archivados | ✅ | RQD, deformación, crecimiento como endpoints .NET |
| F7: Tests + Docs | 🟡 | Test project creado, 20+ tests, README completo |
| Pendiente: Raspberry Pi | ⏳ | Validar edge en ARM |
| Pendiente: Modelo ONNX | ⏳ | Entrenar modelo de detección ML |
| Pendiente: WebXR/VR | ⏳ | Visualización inmersiva con datos calibrados |

---

## Estructura del Repositorio

```
ArgosSlope4.0/
├── backend/
│   ├── main.py                         # FastAPI (fallback temporal)
│   ├── crack_history.json              # Datos legacy (JSON)
│   ├── routes.py                       # Endpoints FastAPI
│   ├── db_bridge.py                    # Persistencia JSON
│   └── src/
│       ├── ArgosSlope.Api/             # Backend .NET (principal)
│       │   ├── Program.cs
│       │   ├── Controllers/
│       │   ├── Models/
│       │   ├── Data/
│       │   └── Services/
│       └── ArgosSlope.Tests/           # Tests unitarios
├── edge/
│   └── edge/
│       ├── main.py                     # Orquestador edge
│       ├── detector/                   # Detección OpenCV/ONNX
│       ├── depth/                      # MiDaS depth estimation
│       ├── pointcloud/                 # Generación nube de puntos
│       ├── mqtt/                       # Publicador MQTT
│       ├── calibration/                # Calibración de cámara
│       ├── temporal/                   # Registro, tracking, alertas
│       ├── webrtc/                     # Streaming MJPEG + WebRTC
│       └── tests/                      # Tests del edge
├── frontend/
│   ├── app/                            # Páginas Next.js
│   │   ├── monitoreo/                  # Dashboard tiempo real
│   │   ├── visualizacion/              # Vista 3D
│   │   ├── historial/                  # Historial de fisuras
│   │   ├── alertas/                    # Panel de alertas
│   │   └── configuracion/              # Configuración
│   └── components/
│       ├── NubePuntos3D.tsx            # Visualización 3D
│       ├── FisuraOverlay.tsx           # Overlay MQTT
│       └── TablaHistorial.js           # Tabla histórica
├── archived/backend/                   # Código legacy (no activo)
├── database/
│   └── init.sql                        # Schema PostgreSQL
├── scripts/
│   ├── build-dotnet.ps1
│   ├── run-dotnet.ps1
│   ├── start-all.ps1
│   ├── run-calibration.ps1
│   └── migrate-json-to-postgres.ps1
└── docker-compose.yml
```

---

## Licencia

Uso interno / proyecto de monitoreo geotécnico minero.

# ─────────────────────────────────────────────────────────────────────────────
# ARGOS SLOPE 4.0 — Edge Processing Container (Raspberry Pi / Laptop)
#
# Multi-stage: build deps in full image, runtime in slim image.
#
# Build:
#   docker build -t argos-edge:latest -f edge/Dockerfile .
#
# Run (laptop development):
#   docker run --rm -it --network host argos-edge:latest
#
# Run (Raspberry Pi):
#   docker run --rm -it --privileged --network host argos-edge:latest
#
# Environment variables (see edge/config.py for all options):
#   CAMERA_SOURCE=0            # USB camera index
#   MQTT_BROKER=localhost       # MQTT broker address
#   MQTT_TOPIC_PREFIX=argos/slope-01
#   DETECTOR_METHOD=opencv      # opencv | onnx
#   DEBUG_SAVE_FRAMES=false
# ─────────────────────────────────────────────────────────────────────────────

FROM python:3.11-slim-bookworm AS builder

WORKDIR /build

# Install build deps
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    libc6-dev \
    && rm -rf /var/lib/apt/lists/*

# Copy only requirements first for layer caching
COPY edge/requirements.txt .
RUN pip install --no-cache-dir --user --upgrade pip && \
    pip install --no-cache-dir --user -r requirements.txt

# ── Runtime image ─────────────────────────────────────────────────────
FROM python:3.11-slim-bookworm AS runtime

# OpenCV + WebRTC (aiortc/av) runtime deps
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1-mesa-glx \
    libglib2.0-0 \
    libsm6 \
    libxext6 \
    libxrender-dev \
    libgomp1 \
    ffmpeg \
    libavcodec-dev \
    libavformat-dev \
    libavutil-dev \
    libavdevice-dev \
    libavfilter-dev \
    libswscale-dev \
    && rm -rf /var/lib/apt/lists/*

# Copy installed packages from builder
COPY --from=builder /root/.local /root/.local
ENV PATH=/root/.local/bin:$PATH \
    PYTHONPATH=/app

WORKDIR /app

# Copy edge module
COPY edge/ ./edge/

# Default environment
ENV CAMERA_SOURCE=0 \
    MQTT_BROKER=localhost \
    MQTT_PORT=1883 \
    DETECTOR_METHOD=opencv \
    FRAME_WIDTH=640 \
    FRAME_HEIGHT=480 \
    FPS=10 \
    LOG_LEVEL=INFO \
    EDGE_WEBRTC_ENABLED=true \
    EDGE_WEBRTC_PORT=8081 \
    EDGE_WEBRTC_FPS=15 \
    EDGE_WEBRTC_FRAME_WIDTH=640 \
    EDGE_WEBRTC_FRAME_HEIGHT=480

ENTRYPOINT ["python", "-m", "edge.main"]

-- ─────────────────────────────────────────────────────────────────────────────
-- ARGOS SLOPE 4.0 — Database Schema
-- ─────────────────────────────────────────────────────────────────────────────
-- Compatible with: PostgreSQL 16+
-- Usage: psql -U postgres -d mineriadb -f database/init.sql
-- ─────────────────────────────────────────────────────────────────────────────

-- Create database if not exists (run separately as superuser)
-- CREATE DATABASE mineriadb;

-- ── Fisuras ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS fisura (
    id              SERIAL PRIMARY KEY,
    roi_id          VARCHAR(100) NOT NULL,
    fecha_deteccion TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    largo_mm        DOUBLE PRECISION NOT NULL DEFAULT 0,
    ancho_mm        DOUBLE PRECISION NOT NULL DEFAULT 0,
    area_mm2        DOUBLE PRECISION NOT NULL DEFAULT 0,
    orientacion     VARCHAR(50),
    tipo            VARCHAR(50),
    coordenadas     TEXT,
    imagen_original VARCHAR(500),
    imagen_segmentada VARCHAR(500)
);

CREATE INDEX IF NOT EXISTS idx_fisura_roi_id ON fisura(roi_id);
CREATE INDEX IF NOT EXISTS idx_fisura_fecha ON fisura(fecha_deteccion);

-- ── Mediciones Diarias ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS medicion_diaria (
    id               SERIAL PRIMARY KEY,
    fisura_id        INTEGER NOT NULL REFERENCES fisura(id) ON DELETE CASCADE,
    fecha            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    largo_mm         DOUBLE PRECISION NOT NULL DEFAULT 0,
    ancho_mm         DOUBLE PRECISION NOT NULL DEFAULT 0,
    area_mm2         DOUBLE PRECISION NOT NULL DEFAULT 0,
    delta_porcentaje DOUBLE PRECISION,
    es_critica       BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_medicion_fisura_id ON medicion_diaria(fisura_id);
CREATE INDEX IF NOT EXISTS idx_medicion_fecha ON medicion_diaria(fecha);

-- ── Alertas ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS alerta (
    id              SERIAL PRIMARY KEY,
    fisura_id       INTEGER REFERENCES fisura(id) ON DELETE SET NULL,
    fecha           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    tipo            VARCHAR(100) NOT NULL,
    mensaje         TEXT NOT NULL,
    umbral_superado DOUBLE PRECISION NOT NULL DEFAULT 0,
    valor_actual    DOUBLE PRECISION NOT NULL DEFAULT 0,
    reconocida      BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_alerta_fisura_id ON alerta(fisura_id);
CREATE INDEX IF NOT EXISTS idx_alerta_fecha ON alerta(fecha);
CREATE INDEX IF NOT EXISTS idx_alerta_reconocida ON alerta(reconocida);

-- ── Configuración ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS configuracion (
    id          SERIAL PRIMARY KEY,
    clave       VARCHAR(100) NOT NULL UNIQUE,
    valor       VARCHAR(500) NOT NULL,
    descripcion TEXT
);

-- ── Snapshots 3D ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS snapshot_3d (
    id                SERIAL PRIMARY KEY,
    device_id         VARCHAR(100) NOT NULL,
    captured_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    payload_json      JSONB NOT NULL DEFAULT '{}',
    point_count       INTEGER NOT NULL DEFAULT 0,
    crack_count       INTEGER NOT NULL DEFAULT 0,
    mesh_vertex_count INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_snapshot_3d_device_captured
    ON snapshot_3d(device_id, captured_at DESC);

-- ── Seed data ────────────────────────────────────────────────────────
INSERT INTO configuracion (clave, valor, descripcion)
VALUES
    ('umbral_ancho_mm', '0.3', 'Ancho mínimo para alerta (mm)'),
    ('umbral_crecimiento_pct', '5.0', 'Crecimiento porcentual para alerta'),
    ('umbral_velocidad_mm_dia', '0.5', 'Velocidad mínima para alerta (mm/día)'),
    ('demo_mode', 'true', 'Modo demo con datos simulados'),
    ('calibrada', 'false', 'Indica si la cámara está calibrada')
ON CONFLICT (clave) DO NOTHING;

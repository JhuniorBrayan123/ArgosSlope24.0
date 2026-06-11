/**
 * ARGOS SLOPE 4.0 — API client.
 *
 * All functions return parsed JSON or throw on network / server error.
 * The base URL is configurable via NEXT_PUBLIC_API_URL env var.
 */

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

// ── Helpers ──────────────────────────────────────────────────────────

async function request(path, options = {}) {
  const url = `${API_BASE}${path}`;
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  });
  if (!res.ok) {
    let body;
    try {
      body = await res.json();
    } catch {
      body = { error: `HTTP ${res.status}` };
    }
    throw new Error(body.error || `HTTP ${res.status}`);
  }
  return res.json();
}

// ── Fisuras ──────────────────────────────────────────────────────────

export async function obtenerFisuras() {
  return request('/api/fisuras');
}

export async function obtenerFisura(id) {
  return request(`/api/fisuras/${id}`);
}

export async function obtenerMediciones(id, dias) {
  const params = dias ? `?dias=${dias}` : '';
  return request(`/api/fisuras/${id}/mediciones${params}`);
}

// ── Resumen ──────────────────────────────────────────────────────────

export async function obtenerResumen() {
  return request('/api/resumen');
}

// ── Alertas ──────────────────────────────────────────────────────────

export async function obtenerAlertas(soloNoReconocidas = false) {
  const params = soloNoReconocidas ? '?solo_no_reconocidas=true' : '';
  return request(`/api/alertas${params}`);
}

export async function reconocerAlerta(id) {
  return request(`/api/alertas/${id}/reconocer`, { method: 'PUT' });
}

// ── Predicciones ────────────────────────────────────────────────────

export async function fetchPredicciones() {
  try {
    return await request('/api/predicciones');
  } catch (err) {
    console.warn('Error al obtener predicciones:', err);
    return [];
  }
}

export async function fetchPrediccion(crackId) {
  try {
    return await request(`/api/predicciones/${crackId}`);
  } catch (err) {
    console.warn(`Error al obtener predicción para fisura #${crackId}:`, err);
    return null;
  }
}

// ── Configuración ────────────────────────────────────────────────────

export async function obtenerConfiguracion() {
  return request('/api/configuracion');
}

export async function actualizarConfiguracion(clave, valor) {
  return request(`/api/configuracion/${encodeURIComponent(clave)}`, {
    method: 'PUT',
    body: JSON.stringify({ valor }),
  });
}

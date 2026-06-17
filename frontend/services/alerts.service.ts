/**
 * ARGOS SLOPE 4.0 — Alerts Service.
 *
 * API service for .NET AlertasController:
 *   GET  /api/alertas
 *   PUT  /api/alertas/{id}/reconocer
 *   POST /api/alertas
 */

import apiClient, { AlertaResponse } from './api-client';

// ── Service ───────────────────────────────────────────────────────────

export const alertsService = {
  /**
   * Get all alerts, optionally filtered by solo no reconocidas.
   * GET /api/alertas?solo_no_reconocidas={bool}
   */
  getAll(soloNoReconocidas?: boolean): Promise<AlertaResponse[]> {
    const params: Record<string, string> = {};
    if (soloNoReconocidas) {
      params.solo_no_reconocidas = 'true';
    }
    return apiClient.get<AlertaResponse[]>(
      '/api/alertas',
      Object.keys(params).length > 0 ? params : undefined
    );
  },

  /**
   * Acknowledge/reconocer an alert.
   * PUT /api/alertas/{id}/reconocer
   */
  acknowledge(id: number): Promise<AlertaResponse> {
    return apiClient.put<AlertaResponse>(`/api/alertas/${id}/reconocer`);
  },

  /**
   * Create a new alert.
   * POST /api/alertas
   */
  create(data: Partial<AlertaResponse>): Promise<AlertaResponse> {
    return apiClient.post<AlertaResponse>('/api/alertas', data);
  },
};

export default alertsService;

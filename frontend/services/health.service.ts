/**
 * ARGOS SLOPE 4.0 — Health Service.
 *
 * API service for .NET HealthController:
 *   GET /api/health
 *   GET /api/resumen
 */

import apiClient, { HealthResponse, ResumenResponse } from './api-client';

// ── Service ───────────────────────────────────────────────────────────

export const healthService = {
  /**
   * Check the health status of the backend and its services.
   * GET /api/health
   */
  check(): Promise<HealthResponse> {
    return apiClient.get<HealthResponse>('/api/health');
  },

  /**
   * Get a summary of fissures, alerts, and system status.
   * GET /api/resumen
   */
  getResumen(): Promise<ResumenResponse> {
    return apiClient.get<ResumenResponse>('/api/resumen');
  },
};

export default healthService;

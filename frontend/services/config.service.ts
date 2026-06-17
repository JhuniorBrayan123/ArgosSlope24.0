/**
 * ARGOS SLOPE 4.0 — Config Service.
 *
 * API service for .NET ConfiguracionController:
 *   GET /api/configuracion
 *   PUT /api/configuracion/{clave}
 */

import apiClient from './api-client';

// ── Service ───────────────────────────────────────────────────────────

export const configService = {
  /**
   * Get all configuration entries.
   * GET /api/configuracion
   */
  getAll(): Promise<Record<string, string>> {
    return apiClient.get<Record<string, string>>('/api/configuracion');
  },

  /**
   * Update a single configuration entry.
   * PUT /api/configuracion/{clave}
   * Sends { valor } in the request body.
   */
  update(clave: string, valor: string): Promise<void> {
    return apiClient.put<void>(
      `/api/configuracion/${encodeURIComponent(clave)}`,
      { valor }
    );
  },
};

export default configService;

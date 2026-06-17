/**
 * ARGOS SLOPE 4.0 — Geotechnical Service.
 *
 * API service for .NET GeotecnicaController:
 *   POST /api/geotecnia/rqd
 *   POST /api/geotecnia/deformacion
 *   POST /api/geotecnia/crecimiento
 */

import apiClient, {
  RqdRequest,
  RqdResult,
  DeformationRequest,
  DeformationResult,
  GrowthResult,
} from './api-client';

// ── Service ───────────────────────────────────────────────────────────

export const geotechnicalService = {
  /**
   * Calculate Rock Quality Designation (RQD).
   * POST /api/geotecnia/rqd
   */
  calculateRqd(data: RqdRequest): Promise<RqdResult> {
    return apiClient.post<RqdResult>('/api/geotecnia/rqd', data);
  },

  /**
   * Calculate deformation analysis.
   * POST /api/geotecnia/deformacion
   */
  calculateDeformation(data: DeformationRequest): Promise<DeformationResult> {
    return apiClient.post<DeformationResult>(
      '/api/geotecnia/deformacion',
      data
    );
  },

  /**
   * Check crack growth status.
   * POST /api/geotecnia/crecimiento
   */
  checkGrowth(data: {
    fisuraId: number;
    mediciones: { fecha: string; largoMm: number; anchoMm: number }[];
  }): Promise<GrowthResult> {
    return apiClient.post<GrowthResult>('/api/geotecnia/crecimiento', data);
  },
};

export default geotechnicalService;

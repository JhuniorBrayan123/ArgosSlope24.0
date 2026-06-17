/**
 * ARGOS SLOPE 4.0 — Fissures Service.
 *
 * API service for .NET FisurasController:
 *   GET/POST  /api/fisuras
 *   GET/PUT   /api/fisuras/{id}
 *   GET/POST  /api/fisuras/{id}/mediciones
 *   GET       /api/fisuras/predicciones
 *   GET       /api/fisuras/predicciones/{roiId}
 */

import apiClient, {
  FisuraResponse,
  FisuraDetalleResponse,
  MedicionResponse,
} from './api-client';

// ── Query params for getAll ──────────────────────────────────────────

export interface FissureQueryParams {
  search?: string;
  tipo?: string;
  estado?: string;
  page?: number;
  pageSize?: number;
}

export interface PagedResponse<T> {
  items: T[];
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
}

// ── Service ───────────────────────────────────────────────────────────

export const fissuresService = {
  /**
   * Get all fissures with optional filters (paginated).
   * GET /api/fisuras
   */
  getAll(params?: FissureQueryParams): Promise<PagedResponse<FisuraResponse>> {
    const queryParams: Record<string, string> = {};
    if (params?.search) queryParams.search = params.search;
    if (params?.tipo) queryParams.tipo = params.tipo;
    if (params?.estado) queryParams.estado = params.estado;
    if (params?.page) queryParams.page = String(params.page);
    if (params?.pageSize) queryParams.pageSize = String(params.pageSize);

    return apiClient.get<PagedResponse<FisuraResponse>>(
      '/api/fisuras',
      Object.keys(queryParams).length > 0 ? queryParams : undefined
    );
  },

  /**
   * Get a single fissure by ID (full detail).
   * GET /api/fisuras/{id}
   */
  getById(id: number): Promise<FisuraDetalleResponse> {
    return apiClient.get<FisuraDetalleResponse>(`/api/fisuras/${id}`);
  },

  /**
   * Get mediciones for a fissure, optionally filtered by days.
   * GET /api/fisuras/{id}/mediciones?dias={dias}
   */
  getMediciones(id: number, dias?: number): Promise<MedicionResponse[]> {
    const params: Record<string, string> = {};
    if (dias !== undefined) params.dias = String(dias);
    return apiClient.get<MedicionResponse[]>(
      `/api/fisuras/${id}/mediciones`,
      Object.keys(params).length > 0 ? params : undefined
    );
  },

  /**
   * Create a new fissure.
   * POST /api/fisuras
   */
  create(data: Partial<FisuraResponse>): Promise<FisuraResponse> {
    return apiClient.post<FisuraResponse>('/api/fisuras', data);
  },

  /**
   * Update an existing fissure.
   * PUT /api/fisuras/{id}
   */
  update(id: number, data: Partial<FisuraResponse>): Promise<FisuraResponse> {
    return apiClient.put<FisuraResponse>(`/api/fisuras/${id}`, data);
  },

  /**
   * Delete a fissure permanently.
   * DELETE /api/fisuras/{id}
   */
  delete(id: number): Promise<void> {
    return apiClient.delete<void>(`/api/fisuras/${id}`);
  },

  /**
   * Add a new medicion to a fissure.
   * POST /api/fisuras/{id}/mediciones
   */
  addMedicion(
    id: number,
    data: Partial<MedicionResponse>
  ): Promise<MedicionResponse> {
    return apiClient.post<MedicionResponse>(
      `/api/fisuras/${id}/mediciones`,
      data
    );
  },

  /**
   * Get all predictions for all fissures.
   * GET /api/fisuras/predicciones
   */
  getPredicciones(): Promise<unknown[]> {
    return apiClient.get<unknown[]>('/api/fisuras/predicciones');
  },

  /**
   * Get prediction for a specific crack by roi_id.
   * GET /api/fisuras/predicciones/{roiId}
   */
  getPrediccionByCrack(roiId: string): Promise<unknown> {
    return apiClient.get<unknown>(`/api/fisuras/predicciones/${roiId}`);
  },
};

export default fissuresService;

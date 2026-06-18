/**
 * ARGOS SLOPE 4.0 — Typed API Client.
 *
 * Configurable fetch wrapper for the .NET backend.
 * Base URL configured via NEXT_PUBLIC_DOTNET_API_URL (default: http://localhost:5000).
 * Provides typed GET, POST, PUT, DELETE methods with error handling.
 */

// ── .NET DTO Interfaces ──────────────────────────────────────────────

/** Fisura (fissure) response from .NET FisurasController */
export interface FisuraResponse {
  id: number;
  roiId: string;
  fechaDeteccion: string;
  largo: number;    // Backend field name (was renamed from largoMm)
  ancho: number;    // Backend field name (was renamed from anchoMm)
  area: number;     // Backend field name (was renamed from areaMm2)
  orientacion: string;
  tipo: string;
  coordenadas: string;
  imagenOriginal?: string;
  imagenSegmentada?: string;
  deltaPorcentaje: number | null;
  esCritica: boolean;
  unidad?: string;
  calibrado?: boolean;
  confianza?: number;
  origen?: string;
  estadoAlerta?: string;
  deviceId?: string;
}

/** Full fissure detail with mediciones and alertas */
export interface FisuraDetalleResponse {
  fisura: FisuraResponse;
  mediciones: MedicionResponse[];
  totalMediciones: number;
  alertas: AlertaResponse[];
}

/** Medicion (measurement) for a fissure */
export interface MedicionResponse {
  id: number;
  fisuraId: number;
  fecha: string;
  largo: number;    // Backend field name (was renamed from largoMm)
  ancho: number;    // Backend field name (was renamed from anchoMm)
  area: number;     // Backend field name (was renamed from areaMm2)
  deltaPorcentaje: number | null;
  esCritica: boolean;
}

/** Alerta (alert) from .NET AlertasController */
export interface AlertaResponse {
  id: number;
  fisuraId: number | null;
  fecha: string;
  tipo: string;
  mensaje: string;
  umbralSuperado: number;
  valorActual: number;
  reconocida: boolean;
}

/** RQD calculation request */
export interface RqdRequest {
  pieceLengthsCm: number[];
  coreLengthM: number;
  minBlockCm?: number;
}

/** RQD calculation result */
export interface RqdResult {
  rqd: number;
  classification: string;
}

/** Deformation calculation request */
export interface DeformationRequest {
  displacementPx: number;
  daysElapsed: number;
  zMeters: number;
  fMm: number;
}

/** Deformation calculation result */
export interface DeformationResult {
  deformationMm: number;
  rateMmPerDay: number;
  status: string;
}

/** Growth check result */
export interface GrowthResult {
  isGrowing: boolean;
  growthRateMmPerDay: number;
  daysToCritical: number | null;
  status: string;
}

/** Generic paginated response wrapper */
export interface PaginatedResponse<T> {
  data: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

/** Health check response */
export interface HealthResponse {
  status: string;
  timestamp: string;
  services: Record<string, string>;
}

/** Resumen (summary) response */
export interface ResumenResponse {
  totalFisuras: number;
  fisurasCriticas: number;
  alertasPendientes: number;
  ultimaActualizacion: string;
}

/** API error response */
export interface ApiErrorResponse {
  error: string;
  statusCode: number;
  details?: string;
}

// ── API Client ───────────────────────────────────────────────────────

const API_BASE =
  process.env.NEXT_PUBLIC_DOTNET_API_URL || 'http://localhost:5001';

/**
 * Typed error class for API errors.
 * Includes status code and optional server error details.
 */
export class ApiError extends Error {
  statusCode: number;
  details?: string;

  constructor(message: string, statusCode: number, details?: string) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.details = details;
  }
}

/**
 * Default headers for all requests.
 * Includes Content-Type JSON and optional auth token.
 */
function getHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  // Include auth token if available
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('auth_token');
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
  }

  return headers;
}

/**
 * Internal request helper.
 * Parses JSON responses, handles errors gracefully, and returns typed data.
 */
async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${API_BASE}${path}`;

  try {
    const res = await fetch(url, {
      ...options,
      headers: { ...getHeaders(), ...options.headers },
    });

    // Handle empty responses (204 No Content)
    if (res.status === 204) {
      return undefined as unknown as T;
    }

    // Try to parse JSON body
    let body: unknown;
    const contentType = res.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
      body = await res.json();
    } else {
      const text = await res.text();
      body = { error: text || `HTTP ${res.status}` };
    }

    if (!res.ok) {
      const errBody = body as ApiErrorResponse;
      throw new ApiError(
        errBody.error || `HTTP ${res.status}`,
        res.status,
        errBody.details
      );
    }

    return body as T;
  } catch (err) {
    if (err instanceof ApiError) {
      throw err;
    }
    // Network error or JSON parse error
    throw new ApiError(
      err instanceof Error ? err.message : 'Network error',
      0
    );
  }
}

// ── Public API ───────────────────────────────────────────────────────

const apiClient = {
  /**
   * GET request with typed response.
   */
  get<T>(path: string, params?: Record<string, string>): Promise<T> {
    let queryString = '';
    if (params) {
      const searchParams = new URLSearchParams(params);
      queryString = `?${searchParams.toString()}`;
    }
    return request<T>(`${path}${queryString}`, { method: 'GET' });
  },

  /**
   * POST request with typed response.
   */
  post<T>(path: string, body?: unknown): Promise<T> {
    return request<T>(path, {
      method: 'POST',
      body: body ? JSON.stringify(body) : undefined,
    });
  },

  /**
   * PUT request with typed response.
   */
  put<T>(path: string, body?: unknown): Promise<T> {
    return request<T>(path, {
      method: 'PUT',
      body: body ? JSON.stringify(body) : undefined,
    });
  },

  /**
   * DELETE request with typed response.
   */
  delete<T>(path: string): Promise<T> {
    return request<T>(path, { method: 'DELETE' });
  },
};

export { apiClient };
export default apiClient;

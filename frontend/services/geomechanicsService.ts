export interface RmrCatalogOption {
  parameterKey: string;
  code: string;
  label: string;
  score: number;
  minValue?: number;
  maxValue?: number;
}

export interface RmrParameterDto {
  parameterKey: string;
  selectedCode: string;
  selectedLabel: string;
  score: number;
  source: string;
  isAuto: boolean;
}

export interface RqdJointFamilyDto {
  familyName: string;
  spacingM: number;
  orientationDeg?: number;
  source: string;
  detectedByOpenCv: boolean;
}

export interface HudsonCalculationRequest {
  jointFamilies: RqdJointFamilyDto[];
}

export interface PalmstromCalculationRequest {
  discontinuityCount: number;
  lineLengthM: number;
}

export interface RmrCalculationRequest {
  parameters: RmrParameterDto[];
}

export interface RqdCalculationResponse {
  method: string;
  jv?: number;
  lambdaValue?: number;
  value: number;
  quality: string;
}

export interface RmrCalculationResponse {
  value: number;
  class: string;
  quality: string;
}

export interface GeomechanicalEvaluationRequest {
  zoneId?: string;
  monitoringId?: string;
  imageId?: string;
  notes?: string;
  rqd?: any; // DTO completo
  rmr?: any; // DTO completo
}

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001';

export const geomechanicsService = {
  async getCatalogs(): Promise<Record<string, RmrCatalogOption[]>> {
    const res = await fetch(`${API_BASE_URL}/api/Geomechanics/catalogs`);
    if (!res.ok) throw new Error('Error fetching RMR catalogs');
    return res.json();
  },

  async calculateHudson(request: HudsonCalculationRequest): Promise<RqdCalculationResponse> {
    const res = await fetch(`${API_BASE_URL}/api/Geomechanics/rqd/hudson`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request)
    });
    if (!res.ok) throw new Error('Error calculating RQD Hudson');
    return res.json();
  },

  async calculatePalmstrom(request: PalmstromCalculationRequest): Promise<RqdCalculationResponse> {
    const res = await fetch(`${API_BASE_URL}/api/Geomechanics/rqd/palmstrom`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request)
    });
    if (!res.ok) throw new Error('Error calculating RQD Palmstrom');
    return res.json();
  },

  async calculateRmr(request: RmrCalculationRequest): Promise<RmrCalculationResponse> {
    const res = await fetch(`${API_BASE_URL}/api/Geomechanics/rmr/calculate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request)
    });
    if (!res.ok) throw new Error('Error calculating RMR');
    return res.json();
  },

  async saveEvaluation(request: GeomechanicalEvaluationRequest): Promise<any> {
    const res = await fetch(`${API_BASE_URL}/api/Geomechanics/evaluations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request)
    });
    if (!res.ok) throw new Error('Error saving evaluation');
    return res.json();
  },

  async getEvaluations(): Promise<any[]> {
    const res = await fetch(`${API_BASE_URL}/api/Geomechanics/evaluations`);
    if (!res.ok) throw new Error('Error fetching evaluations');
    return res.json();
  }
};

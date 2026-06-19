// ── Result Types for Análisis de Fisuras ──────────────────────────────

export interface CrackDetail {
  id: string;
  resultId: string;
  captureId: string;
  family: string;
  lengthCm: number;
  widthMm?: number;
  angleDeg?: number;
  positionX?: number;
  positionY?: number;
  status: 'estable' | 'observacion' | 'critico';
  riskLevel: 'bajo' | 'medio' | 'alto' | 'critico';
  patternMatched?: string;
  recommendation?: string;
  imageUrl?: string;
}

export interface FamilySummary {
  family: string;
  totalCracks: number;
  totalLengthCm: number;
  averageLengthCm: number;
  maxLengthCm: number;
  criticalCount: number;
  status: 'estable' | 'observacion' | 'critico';
  riskLevel: 'bajo' | 'medio' | 'alto' | 'critico';
}

export interface AnalysisResult {
  id: string;
  captureId: string;
  imageUrl: string;
  createdAt: string;
  totalCracks: number;
  totalLengthCm: number;
  familiesSummary: FamilySummary[];
  status: 'estable' | 'observacion' | 'critico';
  riskLevel: 'bajo' | 'medio' | 'alto' | 'critico';
}

export interface EvaluationRule {
  id: string;
  name: string;
  condition: string;
  severity: 'estable' | 'observacion' | 'critico';
  description: string;
}

export interface ComparisonReport {
  baseResultId: string;
  currentResultId: string;
  newCracks: number;
  increasedLength: number;
  familiesWithChanges: { family: string; delta: number }[];
  newCriticalCracks: number;
  movementDetected: boolean;
  conclusion: string;
}

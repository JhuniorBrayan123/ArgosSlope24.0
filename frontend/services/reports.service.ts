/**
 * ARGOS SLOPE 4.0 — Reports Service.
 *
 * API service for .NET ReportsController:
 *   GET /api/reports/summary
 *   GET /api/reports/trends
 *   GET /api/reports/alerts
 */

import apiClient from './api-client';

export interface ReportSummaryResponse {
  totalCracks: number;
  totalDetections: number;
  totalMeasurements: number;
  totalAlerts: number;
  activeAlerts: number;
  avgWidthPx: number;
  maxGrowthPercent: number;
  lastDetectionAt: string | null;
}

export interface ReportTrendPoint {
  date: string;
  avgWidthPx: number;
  crackCount: number;
}

export interface ReportAlertSummary {
  tipo: string;
  count: number;
}

export const reportsService = {
  /**
   * Get aggregated summary for the reports dashboard.
   */
  getSummary(): Promise<ReportSummaryResponse> {
    return apiClient.get<ReportSummaryResponse>('/api/reports/summary');
  },

  /**
   * Get average width trend by day.
   */
  getTrends(dias: number = 30): Promise<ReportTrendPoint[]> {
    return apiClient.get<ReportTrendPoint[]>('/api/reports/trends', { dias: dias.toString() });
  },

  /**
   * Get alerts summary grouped by type.
   */
  getAlertsSummary(): Promise<ReportAlertSummary[]> {
    return apiClient.get<ReportAlertSummary[]>('/api/reports/alerts');
  },
};

export default reportsService;

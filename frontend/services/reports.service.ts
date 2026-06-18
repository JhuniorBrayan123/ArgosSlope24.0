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
  getSummary(startDate?: string, endDate?: string): Promise<ReportSummaryResponse> {
    const params: Record<string, string> = {};
    if (startDate) params.startDate = startDate;
    if (endDate) params.endDate = endDate;
    return apiClient.get<ReportSummaryResponse>('/api/reports/summary', params);
  },

  /**
   * Get average width trend by day.
   */
  getTrends(dias: number = 30, startDate?: string, endDate?: string): Promise<ReportTrendPoint[]> {
    const params: Record<string, string> = { dias: dias.toString() };
    if (startDate) params.startDate = startDate;
    if (endDate) params.endDate = endDate;
    return apiClient.get<ReportTrendPoint[]>('/api/reports/trends', params);
  },

  /**
   * Get alerts summary grouped by type.
   */
  getAlertsSummary(startDate?: string, endDate?: string): Promise<ReportAlertSummary[]> {
    const params: Record<string, string> = {};
    if (startDate) params.startDate = startDate;
    if (endDate) params.endDate = endDate;
    return apiClient.get<ReportAlertSummary[]>('/api/reports/alerts', params);
  },
};

export default reportsService;

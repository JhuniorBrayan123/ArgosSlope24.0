/**
 * ARGOS SLOPE 4.0 — Results Store.
 *
 * Zustand store for managing analysis results state: current result,
 * crack list, family summaries, tab navigation, photo selection,
 * crack detail modal, comparison data, and evaluation summary.
 */

import { create } from 'zustand';
import type {
  CrackDetail,
  FamilySummary,
  AnalysisResult,
  ComparisonReport,
} from '@/types/results';
import {
  evaluateCrack,
  evaluateFamilies,
  generateRecommendation,
} from '@/data/evaluationRules';

// ── Store Interface ─────────────────────────────────────────────────

export interface ResultsStore {
  /** Currently selected analysis result */
  currentResult: AnalysisResult | null;
  /** Evaluated crack details for the current result */
  cracks: CrackDetail[];
  /** Evaluated family summaries */
  families: FamilySummary[];

  // ── UI State ────────────────────────────────────────────────────

  /** Active tab identifier */
  activeTab: 'resumen' | 'fotos' | 'fisuras' | 'comparacion';
  /** Index of the selected photo in the photo viewer */
  selectedPhotoIndex: number;
 /** Currently selected crack for detail modal */
  selectedCrack: CrackDetail | null;
  /** Whether the crack detail modal is open */
  detailModalOpen: boolean;

  // ── Comparison ──────────────────────────────────────────────────

  /** Report comparing base vs current analysis */
  comparisonReport: ComparisonReport | null;
  /** Base (reference) analysis result */
  baseResult: AnalysisResult | null;

  // ── Evaluation ──────────────────────────────────────────────────

  /** Aggregated evaluation summary with counts and recommendation */
  evaluationSummary: {
    total: number;
    estables: number;
    observacion: number;
    criticas: number;
    recommendation: string;
  } | null;

  // ── Actions ─────────────────────────────────────────────────────

  /** Set the current analysis result and evaluate all cracks/families */
  setCurrentResult: (result: AnalysisResult, cracks: CrackDetail[]) => void;
  /** Switch the active tab */
  setActiveTab: (tab: 'resumen' | 'fotos' | 'fisuras' | 'comparacion') => void;
  /** Set the selected photo index */
  setSelectedPhotoIndex: (index: number) => void;
  /** Select a crack for detail view (null to deselect) */
  setSelectedCrack: (crack: CrackDetail | null) => void;
  /** Open or close the detail modal */
  setDetailModalOpen: (open: boolean) => void;
  /** Set the comparison report */
  setComparisonReport: (report: ComparisonReport) => void;
  /** Set the base (reference) analysis result */
  setBaseResult: (result: AnalysisResult) => void;
  /** Reset all state to initial values */
  clearResults: () => void;
}

// ── Initial State ────────────────────────────────────────────────────

const initialState = {
  currentResult: null as AnalysisResult | null,
  cracks: [] as CrackDetail[],
  families: [] as FamilySummary[],
  activeTab: 'resumen' as const,
  selectedPhotoIndex: 0,
  selectedCrack: null as CrackDetail | null,
  detailModalOpen: false,
  comparisonReport: null as ComparisonReport | null,
  baseResult: null as AnalysisResult | null,
  evaluationSummary: null as ResultsStore['evaluationSummary'],
};

// ── Store ────────────────────────────────────────────────────────────

export const useResultsStore = create<ResultsStore>()((set) => ({
  ...initialState,

  setCurrentResult: (result, cracks) => {
    const evaluatedCracks = cracks.map((c) => {
      const evaluation = evaluateCrack(c);
      return { ...c, ...evaluation };
    });

    const families = evaluateFamilies(result.familiesSummary);
    const criticalCount = evaluatedCracks.filter(
      (c) => c.status === 'critico',
    ).length;

    const evaluationSummary = {
      total: evaluatedCracks.length,
      estables: evaluatedCracks.filter((c) => c.status === 'estable').length,
      observacion: evaluatedCracks.filter((c) => c.status === 'observacion')
        .length,
      criticas: criticalCount,
      recommendation: generateRecommendation(
        families,
        evaluatedCracks.length,
        criticalCount,
      ),
    };

    set({
      currentResult: result,
      cracks: evaluatedCracks,
      families,
      evaluationSummary,
    });
  },

  setActiveTab: (tab) => set({ activeTab: tab }),

  setSelectedPhotoIndex: (index) => set({ selectedPhotoIndex: index }),

  setSelectedCrack: (crack) => set({ selectedCrack: crack }),

  setDetailModalOpen: (open) => set({ detailModalOpen: open }),

  setComparisonReport: (report) => set({ comparisonReport: report }),

  setBaseResult: (result) => set({ baseResult: result }),

  clearResults: () =>
    set({
      currentResult: null,
      cracks: [],
      families: [],
      evaluationSummary: null,
      comparisonReport: null,
      baseResult: null,
      selectedCrack: null,
      detailModalOpen: false,
    }),
}));

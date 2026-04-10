import type {
  EstimateLineItem,
  CostSummary,
  ConfidenceDistribution,
  AnomalyReport,
} from "@/types";

export interface ExportData {
  project: {
    name: string;
    address: string;
    trade: string;
    facilityType: string;
    projectType: string;
    generatedAt: string;
  };
  lineItems: EstimateLineItem[];
  costSummary: CostSummary;
  confidenceDistribution: ConfidenceDistribution;
  anomalyReport: AnomalyReport;
  effectiveMarkup: number;
  effectiveOverhead: number;
  effectiveContingency: number;
  effectiveTax: number;
  materialSubtotal: number;
  laborSubtotal: number;
  grandTotal: number;
  isGcMode: boolean;
  tradeSections?: Record<string, EstimateLineItem[]>;
  tradeSubtotals?: Record<string, CostSummary>;
  materialMarkup?: Record<string, { markupPercent: number }>;
  laborMarkup?: Record<string, { markupPercent: number }>;
  wasteItems?: Record<string, number>;
  projectDescription?: string;
  tradeSummaryText?: string;
  overallSummaryText?: string;
}

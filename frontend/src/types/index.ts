// ── Enums (matching backend models) ──

export type Trade =
  | 'general_contractor'
  | 'electrical'
  | 'plumbing'
  | 'hvac'
  | 'concrete'
  | 'demolition'
  | 'framing'
  | 'drywall'
  | 'roofing'
  | 'painting'
  | 'flooring'
  | 'landscaping'
  | 'fire_protection'
  | 'structural_steel'
  | 'low_voltage';

export interface TradeCombination {
  id: string;
  name: string;
  trades: string[];
}

export type FacilityType =
  | 'occupied_retail'
  | 'hospital'
  | 'school'
  | 'industrial'
  | 'residential'
  | 'office'
  | 'warehouse'
  | 'restaurant'
  | 'data_center'
  | 'multi_family'
  | 'hotel'
  | 'religious_assembly'
  | 'parking_structure'
  | 'mixed_use'
  | 'government'
  | 'laboratory'
  | 'other';

export type ProjectType =
  | 'new_build'
  | 'renovation_restoration'
  | 'shell_and_prep'
  | 'lot_clearing'
  | 'tenant_improvement'
  | 'addition'
  | 'demolition'
  | 'systems_replacement'
  | 'seismic_retrofit'
  | 'site_work'
  | 'other';

export type ConfidenceLevel = 'high' | 'medium' | 'low';

export type AnomalyType = 'priced_in' | 'noted';

export type ProjectStatus = 'queued' | 'running' | 'completed' | 'error' | 'partial';

// ── Pipeline Stage Tracking ──

export type StageStatus = 'pending' | 'running' | 'completed' | 'failed' | 'warning';

export interface PipelineStage {
  id: string;
  name: string;
  status: StageStatus;
  progress: number;
  startTime?: string;
  endTime?: string;
  elapsed?: number;
  subtitle?: string;
  error?: string;
  isParallel?: boolean;
  parallelWith?: string;
}

export interface LogEntry {
  timestamp: string;
  level: 'info' | 'warning' | 'error';
  message: string;
}

// ── Estimate Data Models ──

export interface AnomalyFlag {
  anomaly_type: AnomalyType;
  category: string;
  description: string;
  affected_items: string[];
  cost_impact?: number;
  trade?: string;
}

export interface PriceSource {
  source_name: string;
  url?: string;
  price: number;
  date_accessed?: string;
}

export interface SiteConditionAdjustment {
  factor: string;
  description: string;
  multiplier: number;
}

export interface SourceReference {
  doc_index: number;
  doc_filename: string;
  page_number: number;
  context_snippet: string;
}

export interface EstimateLineItem {
  item_id: string;
  description: string;
  quantity: number;
  unit: string;
  has_material: boolean;
  material_unit_cost?: number;
  material_extended_cost?: number;
  material_confidence?: ConfidenceLevel;
  material_pricing_method?: string;
  material_pricing_notes?: string;
  material_sources: PriceSource[];
  material_description?: string | null;
  material_model_number?: string | null;
  material_manufacturer?: string | null;
  material_reasoning?: string | null;
  has_labor: boolean;
  labor_crew_summary?: string;
  labor_hours?: number;
  labor_hourly_rate?: number;
  labor_cost?: number;
  labor_confidence?: ConfidenceLevel;
  labor_reasoning?: string;
  labor_site_adjustments: SiteConditionAdjustment[];
  economies_of_scale_applied: boolean;
  total_cost: number;
  overall_confidence: ConfidenceLevel;
  confidence_notes?: string;
  source_refs?: SourceReference[];
}

export interface CostSummary {
  materials_subtotal: number;
  labor_subtotal: number;
  total: number;
  gc_overhead?: number;
}

export interface ConfidenceDistribution {
  high_count: number;
  medium_count: number;
  low_count: number;
  high_percent: number;
  medium_percent: number;
  low_percent: number;
}

export interface AnomalyReport {
  priced_in: AnomalyFlag[];
  noted: AnomalyFlag[];
}

export interface ParsingWarning {
  doc_index: number;
  filename: string;
  warning: string;
}

export interface AggregatedEstimate {
  project_address: string;
  facility_type: string;
  project_type: string;
  trade: string;
  is_gc_mode: boolean;
  waste_items?: Record<string, boolean>;
  waste_default_percent?: number;
  waste_custom_percent?: Record<string, number>;
  generated_at: string;
  line_items: EstimateLineItem[];
  trade_sections?: Record<string, EstimateLineItem[]>;
  trade_subtotals?: Record<string, CostSummary>;
  dedup_notes: string[];
  cost_summary: CostSummary;
  confidence_distribution: ConfidenceDistribution;
  anomaly_report: AnomalyReport;
  parsing_warnings: ParsingWarning[];
  bls_area_used: string;
  bls_wage_rates: Record<string, number>;
  total_documents_parsed: number;
  total_pages_parsed: number;
  warnings?: Array<{
    code: string;
    stage: string;
    message: string;
    details?: Record<string, unknown>;
  }>;
}

// ── Project (backend API shape) ──

export type ProjectRole = 'owner' | 'editor' | 'viewer';
export type SharePermission = 'viewer' | 'editor';

export interface BackendProject {
  id: string;
  project_name?: string;
  project_address: string;
  trade: Trade;
  facility_type: string;
  project_type: string;
  project_description: string;
  status: ProjectStatus;
  created_at: string;
  completed_at?: string;
  total_estimate?: number;
  confidence_distribution?: ConfidenceDistribution;
  total_documents: number;
  total_pages: number;
  error_message?: string;
  output_dir?: string;
  role?: ProjectRole;
  shared_by?: string;
  queue_position?: number;
  queued_at?: string;
}

export interface ProjectShare {
  id: number;
  user_id?: string;
  email?: string;
  permission: SharePermission;
  share_type: 'email' | 'link';
  share_token?: string;
  accepted_at?: string;
  created_at: string;
  display_name: string;
  avatar_url?: string;
  // Bid-request extensions
  purpose?: 'share' | 'bid_request';
  trades_scope?: string[];
  allow_competitive_view?: boolean;
}

// ── Subcontractor Types ──

export interface Subcontractor {
  id: string;
  user_id: string;
  company_name: string;
  contact_name: string;
  email: string;
  phone?: string;
  trades: string[];
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface BidInvite {
  id: number;
  token: string;
  email?: string;
  trades_scope: string[];
  allow_competitive_view: boolean;
  created_at: string;
}

export interface SubBid {
  id: number;
  company_name: string;
  contact_name: string;
  total_material: number;
  total_labor: number;
  total_bid: number;
  notes?: string;
  submitted_at: string;
  trade?: string;
}

export interface SubBidItem {
  item_id: string;
  material_unit_cost?: number;
  material_extended_cost?: number;
  labor_hours?: number;
  labor_hourly_rate?: number;
  labor_cost?: number;
  notes?: string;
  description?: string;
  quantity?: number;
  unit?: string;
  is_addition?: boolean;
}

export interface SubBidDetail {
  submission: SubBid & { trade: string };
  items: SubBidItem[];
}

export interface BidInviteData {
  invite_id: number;
  project_id: string;
  project_name: string;
  project_address: string;
  facility_type: string;
  project_type?: string;
  trades_scope: string[];
  allow_competitive_view: boolean;
  send_documents: boolean;
  trade_summary?: TradeSummary | null;
  overall_summary?: OverallSummary | null;
  line_items: EstimateLineItem[];
  trade_sections: Record<string, EstimateLineItem[]>;
  trade_subtotals: Record<string, CostSummary>;
  waste_items?: Record<string, boolean>;
  waste_default_percent?: number;
  waste_custom_percent?: Record<string, number>;
}

// ── Description Validation ──

export interface ValidationQuestion {
  id: string;
  question: string;
  placeholder: string;
}

export interface ValidationResult {
  valid: boolean;
  summary: string;
  questions: ValidationQuestion[];
  _error?: boolean;
}

// ── Voice Input ──

export interface TranscriptionResult {
  text: string;
  duration_seconds: number;
}

// ── Document Viewer ──

export interface ProjectDocument {
  doc_index: number;
  filename: string;
  file_type: string;
  total_pages: number;
  document_type?: string;
  relevance_tier?: string;
  storage_path?: string;
}

export interface DocumentPdfResponse {
  url: string;
  filename: string;
  total_pages: number;
  expires_in: number;
}

export interface DocumentSearchResult {
  doc_index: number;
  page_number: number;
  filename?: string;
  snippet: string;
  text_content?: string;
  rank?: number;
}

export interface DocumentSearchResponse {
  query: string;
  results: DocumentSearchResult[];
  total_results: number;
}

// ── Project Summaries ──

export interface OverallSummary {
  headline: string;
  classification: string;
  building_info: {
    facility_type: string;
    project_type: string;
    description: string;
  };
  document_set: {
    total_documents: number;
    total_pages: number;
    key_doc_types: string[];
  };
  trades_in_scope: string[];
  key_constraints: string[];
  parties: Array<{ role: string; name: string }>;
  narrative: string;
}

export interface TradeSummary {
  headline: string;
  scope_overview: string;
  key_quantities: Array<{ description: string; quantity: number; unit: string }>;
  site_conditions: string[];
  labor_snapshot: {
    total_hours_expected: number;
    total_cost_expected: number;
    total_cost_low: number;
    total_cost_high: number;
    bls_area: string;
    crew_roles: string[];
  };
  anomalies: Array<{ type: string; description: string }>;
  confidence_summary: {
    high: number;
    medium: number;
    low: number;
    overall_assessment: string;
  };
  assumptions: string[];
}

export interface SummaryResponse<T> {
  job_id: string;
  summary: T;
  cached: boolean;
}

// ── Preset Matching & Overrides ──

export interface PresetMatch {
  item_id: string;
  preset_id: string;
  confidence: 'high' | 'medium' | 'low';
  reasoning: string;
}

export interface MatchPresetsRequest {
  material_presets: { id: string; name: string; unitPrice: number; unit: string }[];
  labor_presets: { id: string; role: string; hourlyRate: number }[];
  material_items: { item_id: string; description: string; unit: string; material_unit_cost?: number }[];
  labor_items: { item_id: string; description: string; labor_hourly_rate?: number }[];
}

export interface MatchPresetsResponse {
  material_matches: PresetMatch[];
  labor_matches: PresetMatch[];
}

export interface ItemOverride {
  preset_id: string;
  preset_name: string;
  original_value: number;
  override_value: number;
  type: 'material_price' | 'labor_rate';
}

export interface ProjectOverrides {
  material: Record<string, ItemOverride>;
  labor: Record<string, ItemOverride>;
  markupPercent?: number;
  overheadPercent?: number;
  contingencyPercent?: number;
  taxPercent?: number;
  waste_items?: Record<string, boolean>;
  waste_default_percent?: number;
  waste_custom_percent?: Record<string, number>;
}

// ── Per-Line-Item Markup ──

export interface ItemMarkup {
  markupPercent: number;
}

/** Stored in project_overrides.markup_data column (separate from overrides_data) */
export interface MarkupData {
  material: Record<string, ItemMarkup>;
  labor: Record<string, ItemMarkup>;
}

// ── Project Feedback ──

export interface ProjectFeedback {
  id: string;
  project_id: string;
  user_id: string;
  rating: 'high' | 'low' | 'spot_on';
  message: string | null;
  created_at: string;
  projects?: {
    project_address: string;
    trade: string;
    facility_type: string;
  };
}

// ── Document Intelligence Chat ──

export type ChatMode = 'auto' | 'deep_search';

export interface ChatReference {
  doc_index: number;
  doc_name: string;
  page_number: number;
  description: string;
  image_url: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  references?: ChatReference[];
  tier_used?: number;
  model_used?: string;
  mode?: ChatMode;
  confidence?: string;
  intent?: string;
  reasoning_summary?: string;
  timestamp: string;
}

export interface ChatResponse {
  answer: string;
  references: ChatReference[];
  tier_used: number;
  model_used: string;
  reasoning_summary: string;
  confidence: string;
  intent: string;
}

// ── Scenarios ──

export type ScenarioStatus = 'pending' | 'running' | 'completed' | 'error';

export interface Scenario {
  id: string;
  project_id: string;
  parent_scenario_id?: string | null;
  name: string;
  context: string;
  summary?: string | null;
  reasoning?: string | null;
  status: ScenarioStatus;
  progress: number;
  error_message?: string | null;
  created_at: string;
  completed_at?: string | null;
  created_by?: string | null;
}

export interface ScenarioDelta {
  materials: number;
  labor: number;
  total: number;
  percent: number;
}

export interface ScenarioComparisonEntry {
  id: string;
  name: string;
  parent_id?: string | null;
  summary?: string | null;
  reasoning?: string | null;
  status: ScenarioStatus;
  created_at: string;
  materials_subtotal: number;
  labor_subtotal: number;
  total: number;
  delta_from_base: ScenarioDelta;
  delta_from_parent?: ScenarioDelta | null;
}

export interface ScenarioComparison {
  base: CostSummary;
  scenarios: ScenarioComparisonEntry[];
}

export interface ScenarioDetail {
  scenario: Scenario;
  line_items: EstimateLineItem[];
  cost_summary: CostSummary;
  anomaly_report: AnomalyReport;
  material_metadata: unknown[];
  labor_metadata: unknown[];
}

export interface ScenarioStatusResponse {
  scenario_id: string;
  status: ScenarioStatus;
  progress: number;
  error_message?: string | null;
  summary?: string | null;
}

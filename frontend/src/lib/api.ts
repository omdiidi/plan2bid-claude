/**
 * API client for Estim8r backend.
 *
 * All functions return typed data or throw errors.
 * The base URL is proxied through Vite (/api -> localhost:8000).
 * Auth headers are automatically attached from the Supabase session.
 */

import { supabase } from "@/integrations/supabase/client";
import type {
  AggregatedEstimate,
  BackendProject,
  ValidationResult,
  TranscriptionResult,
  ChatResponse,
  ChatMessage,
  ChatMode,
  ProjectDocument,
  DocumentPdfResponse,
  DocumentSearchResponse,
  OverallSummary,
  TradeSummary,
  SummaryResponse,
  MatchPresetsRequest,
  MatchPresetsResponse,
  ProjectShare,
  SharePermission,
  ProjectOverrides,
  ProjectFeedback,
} from "@/types";

const API_BASE = (import.meta.env.VITE_API_URL ?? "") + "/api";

async function getAuthHeaders(): Promise<Record<string, string>> {
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (session?.access_token) {
      return { Authorization: `Bearer ${session.access_token}` };
    }
    if (import.meta.env.DEV) console.warn("[Estim8r] No active session — API request will be unauthenticated");
  } catch (err) {
    if (import.meta.env.DEV) console.warn("[Estim8r] Failed to get auth session:", (err as Error).message);
  }
  return {};
}

class ApiError extends Error {
  status: number;
  details?: unknown;

  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.details = details;
  }
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const url = `${API_BASE}${path}`;
  try {
    const authHeaders = await getAuthHeaders();
    const res = await fetch(url, {
      ...options,
      headers: {
        ...authHeaders,
        ...(options?.headers || {}),
      },
    });

    if (!res.ok) {
      // Only 401 means the auth session is actually invalid/expired.
      if (res.status === 401) {
        const isAuthCritical = !path.includes("match-presets") && !path.includes("summary") && !path.includes("polish") && !path.includes("validate") && !path.includes("transcribe");
        if (isAuthCritical) {
          if (import.meta.env.DEV) console.warn(`[Estim8r] 401 on ${path} — session expired`);
          window.dispatchEvent(new CustomEvent("estim8r:auth-expired"));
        } else {
          if (import.meta.env.DEV) console.warn(`[Estim8r] 401 on ${path} — ignored (non-critical)`);
        }
      }
      const body = await res.text();
      throw new ApiError(res.status, `API error: ${res.status}`, body);
    }

    return (await res.json()) as T;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw new ApiError(0, `Network error: ${(err as Error).message}`);
  }
}

// ── Estimate Endpoints ──

export interface CreateEstimateResponse {
  job_id: string;
  queue_position: number;
}

export async function createEstimate(
  formData: FormData,
): Promise<CreateEstimateResponse> {
  const authHeaders = await getAuthHeaders();
  const res = await fetch(`${API_BASE}/estimate`, {
    method: "POST",
    headers: authHeaders,
    body: formData,
  });

  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      if (import.meta.env.DEV) console.warn(`[Estim8r] ${res.status} on /estimate — session may be expired`);
      window.dispatchEvent(new CustomEvent("estim8r:auth-expired"));
    }
    const body = await res.text();
    throw new ApiError(res.status, `Failed to create estimate`, body);
  }

  return (await res.json()) as CreateEstimateResponse;
}

export interface PipelineWarning {
  code: string;
  stage: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface EstimateStatus {
  status: "queued" | "running" | "completed" | "error";
  stage: string;
  message: string;
  progress: number;
  estimate_id?: string;
  error?: string;
  output_dir?: string;
  queue_position?: number;
  queued_at?: string;
  warnings?: PipelineWarning[];
  logs?: Array<{
    timestamp: number;
    level: string;
    message: string;
  }>;
}

export async function getEstimateStatus(
  jobId: string,
): Promise<EstimateStatus> {
  return request<EstimateStatus>(`/estimate/status/${jobId}`);
}

export async function getEstimate(
  estimateId: string,
): Promise<AggregatedEstimate> {
  return request<AggregatedEstimate>(`/estimate/${estimateId}`);
}

// ── Queue Endpoints ──

export interface QueueState {
  running: { job_id: string } | null;
  queued: Array<{ job_id: string; position: number }>;
  queue_length: number;
}

export async function getQueueState(): Promise<QueueState> {
  return request<QueueState>("/queue");
}

export async function cancelQueuedJob(jobId: string): Promise<{ cancelled: boolean }> {
  return request<{ cancelled: boolean }>(`/queue/${jobId}`, { method: "DELETE" });
}

// ── Line Item CRUD ──

export interface AddMaterialItemRequest {
  description: string;
  quantity: number;
  unit: string;
  unit_cost: number;
}

export interface AddMaterialItemResponse {
  item_id: string;
  description: string;
  quantity: number;
  unit: string;
  unit_cost: number;
  extended_cost: number;
  confidence: "high";
}

export interface AddLaborItemRequest {
  description: string;
  quantity: number;
  unit: string;
  hours: number;
  hourly_rate: number;
}

export interface AddLaborItemResponse {
  item_id: string;
  description: string;
  quantity: number;
  unit: string;
  hours: number;
  hourly_rate: number;
  labor_cost: number;
  confidence: "high";
}

// ── Line Item Update (PATCH) ──

export interface UpdateMaterialItemRequest {
  material_description?: string;
  description?: string;
}

export interface UpdateLaborItemRequest {
  description?: string;
}

export async function updateMaterialItem(
  projectId: string,
  itemId: string,
  data: UpdateMaterialItemRequest,
): Promise<{ updated: boolean; item_id: string; fields: string[] }> {
  return request(`/estimate/${projectId}/material/${encodeURIComponent(itemId)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export async function updateLaborItem(
  projectId: string,
  itemId: string,
  data: UpdateLaborItemRequest,
): Promise<{ updated: boolean; item_id: string; fields: string[] }> {
  return request(`/estimate/${projectId}/labor/${encodeURIComponent(itemId)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export async function deleteMaterialItem(
  projectId: string,
  itemId: string,
): Promise<{ deleted: boolean; item_id: string }> {
  return request(`/estimate/${projectId}/material/${encodeURIComponent(itemId)}`, {
    method: "DELETE",
  });
}

export async function deleteLaborItem(
  projectId: string,
  itemId: string,
): Promise<{ deleted: boolean; item_id: string }> {
  return request(`/estimate/${projectId}/labor/${encodeURIComponent(itemId)}`, {
    method: "DELETE",
  });
}

export async function addMaterialItem(
  projectId: string,
  body: AddMaterialItemRequest,
): Promise<AddMaterialItemResponse> {
  return request(`/estimate/${projectId}/material`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function addLaborItem(
  projectId: string,
  body: AddLaborItemRequest,
): Promise<AddLaborItemResponse> {
  return request(`/estimate/${projectId}/labor`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// ── Project Endpoints ──

export async function getProjects(): Promise<BackendProject[]> {
  return request<BackendProject[]>("/projects");
}

export async function getProject(projectId: string): Promise<BackendProject> {
  return request<BackendProject>(`/projects/${projectId}`);
}

export async function deleteProject(projectId: string): Promise<void> {
  await request<void>(`/projects/${projectId}`, { method: "DELETE" });
}

export async function renameProject(projectId: string, projectName: string): Promise<{ project_name: string }> {
  return request<{ project_name: string }>(`/projects/${projectId}/name`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ project_name: projectName }),
  });
}

export async function deleteProjectsBulk(projectIds: string[]): Promise<number> {
  const data = await request<{ deleted: number }>("/projects/bulk-delete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ project_ids: projectIds }),
  });
  return data.deleted;
}

// ── Export Endpoints ──

export function getExportUrl(
  estimateId: string,
  format: "csv" | "xlsx" | "pdf",
): string {
  return `${API_BASE}/estimate/${estimateId}/export/${format}`;
}

// ── Description Validation ──

export interface ValidateDescriptionRequest {
  project_name: string;
  street_address: string;
  city: string;
  state: string;
  zip_code: string;
  facility_type: string;
  project_type: string;
  trade: string;
  description: string;
}

export async function validateDescription(
  req: ValidateDescriptionRequest,
): Promise<ValidationResult> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return await request<ValidationResult>("/validate-description", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(req),
      });
    } catch (err) {
      if (attempt === 0) {
        await new Promise((r) => setTimeout(r, 1500));
        continue;
      }
      if (import.meta.env.DEV) console.warn("[Estim8r] Validation service unreachable:", err);
      return {
        valid: true,
        summary: "Validation service is unavailable. You can proceed.",
        questions: [],
        _error: true,
      };
    }
  }
  return { valid: true, summary: "", questions: [], _error: true };
}

// ── Voice Transcription ──

export async function transcribeVoice(
  audioBlob: Blob,
): Promise<TranscriptionResult> {
  const formData = new FormData();
  formData.append("audio", audioBlob, "recording.webm");

  const authHeaders = await getAuthHeaders();
  const url = `${API_BASE}/transcribe-voice`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: authHeaders,
      body: formData,
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timeout);
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new ApiError(0, "Transcription timed out — server may be busy. Try again in a moment.");
    }
    throw new ApiError(0, "Could not reach transcription service");
  }
  clearTimeout(timeout);

  if (!res.ok) {
    if (res.status === 401) {
      if (import.meta.env.DEV) console.warn(`[Estim8r] ${res.status} on /transcribe-voice — session may be expired`);
      window.dispatchEvent(new CustomEvent("estim8r:auth-expired"));
    }
    const body = await res.text();
    throw new ApiError(res.status, `Transcription failed`, body);
  }

  return (await res.json()) as TranscriptionResult;
}

// ── Document Intelligence Chat ──

export async function sendChatMessage(
  jobId: string,
  message: string,
  history: Pick<ChatMessage, "role" | "content">[],
  mode: ChatMode = "auto",
): Promise<ChatResponse> {
  return request<ChatResponse>(`/chat/${jobId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, history, mode }),
  });
}

/**
 * Build the URL for a page image from a parsed document.
 */
export function getPageImageUrl(
  jobId: string,
  docIndex: number,
  pageNumber: number,
): string {
  return `${API_BASE}/projects/${jobId}/documents/${docIndex}/pages/${pageNumber}`;
}

// ── Document Viewer Endpoints ──

export async function getDocuments(
  jobId: string,
): Promise<{ documents: ProjectDocument[] }> {
  return request<{ documents: ProjectDocument[] }>(
    `/projects/${jobId}/documents`,
  );
}

export async function getDocumentPdfUrl(
  jobId: string,
  docIndex: number,
): Promise<DocumentPdfResponse> {
  return request<DocumentPdfResponse>(
    `/projects/${jobId}/documents/${docIndex}/pdf`,
  );
}

export async function searchDocuments(
  jobId: string,
  query: string,
  options?: { docIndex?: number; limit?: number },
): Promise<DocumentSearchResponse> {
  const params = new URLSearchParams({ q: query });
  if (options?.docIndex !== undefined)
    params.set("doc_index", String(options.docIndex));
  if (options?.limit !== undefined)
    params.set("limit", String(options.limit));
  return request<DocumentSearchResponse>(
    `/projects/${jobId}/search?${params}`,
  );
}

// ── Summary Endpoints ──

export async function getOverallSummary(
  jobId: string,
  regenerate = false,
): Promise<SummaryResponse<OverallSummary>> {
  const params = regenerate ? "?regenerate=true" : "";
  return request<SummaryResponse<OverallSummary>>(
    `/projects/${jobId}/summary/overall${params}`,
  );
}

export async function getTradeSummary(
  jobId: string,
  regenerate = false,
): Promise<SummaryResponse<TradeSummary>> {
  const params = regenerate ? "?regenerate=true" : "";
  return request<SummaryResponse<TradeSummary>>(
    `/projects/${jobId}/summary/trade${params}`,
  );
}

// ── Preset Matching ──

export async function matchPresets(
  jobId: string,
  body: MatchPresetsRequest,
): Promise<MatchPresetsResponse> {
  return request<MatchPresetsResponse>(`/projects/${jobId}/match-presets`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// ── Project Sharing ──

export async function createEmailShare(
  projectId: string,
  email: string,
  permission: SharePermission,
): Promise<{ share_id: number; status: string }> {
  return request(`/projects/${projectId}/shares/email`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, permission }),
  });
}

export async function createLinkShare(
  projectId: string,
  permission: SharePermission,
): Promise<{ share_id: number; token: string; permission: string }> {
  return request(`/projects/${projectId}/shares/link`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ permission }),
  });
}

export async function acceptShareLink(
  token: string,
): Promise<{ status: string; project_id: string; permission?: string }> {
  return request(`/shares/accept/${token}`, { method: "POST" });
}

export async function listShares(projectId: string): Promise<ProjectShare[]> {
  return request<ProjectShare[]>(`/projects/${projectId}/shares`);
}

export async function updateShare(
  projectId: string,
  shareId: number,
  permission: SharePermission,
): Promise<void> {
  await request(`/projects/${projectId}/shares/${shareId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ permission }),
  });
}

export async function revokeShare(
  projectId: string,
  shareId: number,
): Promise<void> {
  await request(`/projects/${projectId}/shares/${shareId}`, {
    method: "DELETE",
  });
}

// ── Admin Endpoints ──

export async function adminGetProjects(): Promise<BackendProject[]> {
  return request<BackendProject[]>("/admin/projects");
}

export async function adminGetUsers(): Promise<
  Array<{
    id: string;
    user_id: string;
    email: string;
    display_name: string;
    company_name: string | null;
    created_at: string;
    last_sign_in_at: string | null;
    role: string;
    runs_total: number;
    runs_today: number;
  }>
> {
  return request("/admin/users");
}

// ── Feedback ──

export async function submitFeedback(
  projectId: string,
  rating: "high" | "low" | "spot_on",
  message?: string,
): Promise<void> {
  await request(`/projects/${projectId}/feedback`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ rating, message }),
  });
}

export async function getProjectFeedback(
  projectId: string,
): Promise<ProjectFeedback | null> {
  return request<ProjectFeedback | null>(`/projects/${projectId}/feedback`);
}

export async function adminGetFeedback(): Promise<ProjectFeedback[]> {
  return request<ProjectFeedback[]>("/admin/feedback");
}

export interface SignupToken {
  id: string;
  token: string;
  label: string | null;
  created_by: string;
  created_at: string;
  expires_at: string | null;
  used_by: string | null;
  used_at: string | null;
  is_active: boolean;
}

export async function adminGetTokens(): Promise<SignupToken[]> {
  return request<SignupToken[]>("/admin/tokens");
}

export async function adminCreateToken(label?: string, expires_at?: string): Promise<SignupToken> {
  return request<SignupToken>("/admin/tokens", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ label, expires_at }),
  });
}

export async function adminRevokeToken(tokenId: string): Promise<void> {
  await request(`/admin/tokens/${tokenId}`, { method: "DELETE" });
}

export async function adminDeleteUser(userId: string): Promise<void> {
  await request(`/admin/users/${userId}`, { method: "DELETE" });
}

export async function validateSignupToken(token: string): Promise<{ valid: boolean; error?: string }> {
  const res = await fetch(`${API_BASE}/auth/validate-signup-token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token }),
  });
  return res.json();
}

export async function claimSignupToken(token: string): Promise<void> {
  await request("/auth/claim-signup-token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token }),
  });
}

// ── Project Overrides ──

export async function getProjectOverrides(
  projectId: string,
): Promise<ProjectOverrides> {
  return request<ProjectOverrides>(`/projects/${projectId}/overrides`);
}

export async function saveProjectOverrides(
  projectId: string,
  overrides: ProjectOverrides,
): Promise<void> {
  await request(`/projects/${projectId}/overrides`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ overrides }),
  });
}

// ── User Settings ──

export async function getUserSettings(): Promise<{
  onboarding_complete: boolean;
  settings: Record<string, unknown>;
}> {
  return request("/settings");
}

export async function saveUserSettings(data: {
  settings?: Record<string, unknown>;
  onboarding_complete?: boolean;
}): Promise<void> {
  await request("/settings", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

// ── Health Check ──

export async function healthCheck(): Promise<{ status: string }> {
  return request<{ status: string }>("/health");
}
// ── Scenarios ──

import type {
  Scenario,
  ScenarioComparison,
  ScenarioDetail,
  ScenarioStatusResponse,
} from "@/types";

export async function createScenario(
  projectId: string,
  data: { name?: string; context: string; parent_scenario_id?: string },
): Promise<{ scenario_id: string; status: string }> {
  return request(`/projects/${projectId}/scenarios`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export async function getScenarios(
  projectId: string,
): Promise<Scenario[]> {
  return request<Scenario[]>(`/projects/${projectId}/scenarios`);
}

export async function getScenarioDetail(
  projectId: string,
  scenarioId: string,
): Promise<ScenarioDetail> {
  return request(`/projects/${projectId}/scenarios/${scenarioId}`);
}

export async function getScenarioStatus(
  projectId: string,
  scenarioId: string,
): Promise<ScenarioStatusResponse> {
  return request(`/projects/${projectId}/scenarios/${scenarioId}/status`);
}

export async function getScenarioComparison(
  projectId: string,
): Promise<ScenarioComparison> {
  return request(`/projects/${projectId}/scenarios/compare`);
}

export async function deleteScenario(
  projectId: string,
  scenarioId: string,
): Promise<{ deleted: boolean; scenario_id: string; children_deleted: number }> {
  return request(`/projects/${projectId}/scenarios/${scenarioId}`, {
    method: "DELETE",
  });
}

export async function updateScenario(
  projectId: string,
  scenarioId: string,
  data: { name?: string; context?: string },
): Promise<{ scenario_id: string; updated: boolean; regenerating: boolean }> {
  return request(`/projects/${projectId}/scenarios/${scenarioId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

// ── Subcontractors ──

import type {
  Subcontractor,
  BidInvite,
  SubBid,
  BidInviteData,
} from "@/types";

export async function listSubcontractors(): Promise<Subcontractor[]> {
  return request<Subcontractor[]>("/subcontractors");
}

export async function createSubcontractor(data: {
  company_name: string;
  contact_name: string;
  email: string;
  phone?: string;
  trades: string[];
  notes?: string;
}): Promise<Subcontractor> {
  return request<Subcontractor>("/subcontractors", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export async function updateSubcontractor(
  subId: string,
  data: {
    company_name: string;
    contact_name: string;
    email: string;
    phone?: string;
    trades: string[];
    notes?: string;
  },
): Promise<void> {
  await request(`/subcontractors/${subId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export async function deleteSubcontractor(subId: string): Promise<void> {
  await request(`/subcontractors/${subId}`, { method: "DELETE" });
}

// ── Bid Requests ──

export async function createBidRequest(
  projectId: string,
  data: {
    trades_scope: string[];
    allow_competitive_view?: boolean;
    send_documents?: boolean;
    email?: string;
  },
): Promise<{ invite_id: number; token: string; trades_scope: string[] }> {
  return request(`/projects/${projectId}/sub-invites`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export async function listBidRequests(
  projectId: string,
): Promise<BidInvite[]> {
  return request<BidInvite[]>(`/projects/${projectId}/sub-invites`);
}

export async function getBidInviteData(token: string): Promise<BidInviteData> {
  return request<BidInviteData>(`/sub-invites/${token}`);
}

export async function submitBid(
  token: string,
  data: {
    trade: string;
    company_name: string;
    contact_name: string;
    total_material: number;
    total_labor: number;
    total_bid: number;
    notes?: string;
    items?: Array<{
      item_id: string;
      material_unit_cost?: number;
      material_extended_cost?: number;
      labor_hours?: number;
      labor_hourly_rate?: number;
      labor_cost?: number;
      description?: string;
      quantity?: number;
      unit?: string;
      is_addition?: boolean;
    }>;
  },
): Promise<{ submission_id: number; status: string; trade: string }> {
  return request(`/sub-invites/${token}/submit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export async function getSubBids(
  projectId: string,
): Promise<{ bids_by_trade: Record<string, SubBid[]> }> {
  return request(`/projects/${projectId}/sub-bids`);
}

export async function getTradeSubBids(
  projectId: string,
  trade: string,
): Promise<SubBid[]> {
  return request<SubBid[]>(`/projects/${projectId}/sub-bids/${trade}`);
}

export async function getSubBidDetail(
  projectId: string,
  submissionId: number,
): Promise<import("@/types").SubBidDetail> {
  return request(`/projects/${projectId}/sub-submissions/${submissionId}/detail`);
}

export async function getCompetitorBids(
  token: string,
): Promise<{ competitors: Record<string, Array<{ company_name: string; total_bid: number; submitted_at: string }>> }> {
  return request(`/sub-invites/${token}/competitors`);
}

// ── Sub-Invite Helpers ──

export async function claimBidInvite(
  token: string,
): Promise<{ status: string; project_id: string }> {
  return request(`/sub-invites/${token}/claim`, { method: "PATCH" });
}

export async function getSubDocuments(
  token: string,
): Promise<{ documents: ProjectDocument[] }> {
  return request(`/sub-invites/${token}/documents`);
}

export function getSubPageImageUrl(token: string, docIndex: number, pageNumber: number): string {
  return `${API_BASE}/sub-invites/${token}/documents/${docIndex}/pages/${pageNumber}`;
}

export async function getSubPdfUrl(
  token: string,
  docIndex: number,
): Promise<{ url: string; filename: string; total_pages: number; expires_in: number }> {
  return request(`/sub-invites/${token}/documents/${docIndex}/pdf`);
}

// ── Text Polishing ──

export async function polishText(text: string): Promise<string> {
  const data = await request<{ text: string }>("/polish-text", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  return data.text;
}

// Re-export for components that need authenticated fetch (e.g., exports)
export { ApiError, getAuthHeaders };

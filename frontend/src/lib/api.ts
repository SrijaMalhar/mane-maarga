export const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000').replace(/\/$/, '')

export type Status = 'intake' | 'verified' | 'planning' | 'finance_review' | 'construction' | 'completed'
export const STATUSES: Status[] = ['intake', 'verified', 'planning', 'finance_review', 'construction', 'completed']
export type Role = 'admin' | 'operator' | 'viewer'

export type CaseItem = {
  id: number; beneficiary_name: string; village: string; taluk: string; phone_last4: string; status: Status
  sanctioned_amount: number; estimated_cost: number; existing_loan: number; gap_amount: number; consent_status: string; notes: string; plot_lat?: number | null; plot_lon?: number | null }
export type AuthUser = { id: number; username: string; email: string; role: Role; is_active: boolean }
export type ManagedUser = AuthUser & { created_at: string | null }
export type CaseDocument = { id: number; case_id: number; original_name: string; content_type: string; size_bytes: number; verification_status: 'pending' | 'verified' | 'rejected'; uploaded_by: string; uploaded_at: string | null }
export type ExtractionCheck = { field: string; status: string; extracted?: string; case_value?: string; severity?: string; message?: string }
export type Extraction = { id: number; document_id: number; extraction_status: string; document_type: string; extracted_fields: Record<string, string>; checks: ExtractionCheck[]; engine: string; confidence: number; extracted_at: string | null }
export type FundingStatus = 'proposed' | 'confirmed' | 'received' | 'rejected'
export type FundingType = 'subsidy' | 'loan' | 'savings' | 'wages' | 'grant' | 'other'
export type Funding = { id: number; case_id: number; source_type: FundingType; source_name: string; amount: number; status: FundingStatus; scheme_code: string | null; reference_number: string | null; evidence_document_id: number | null; notes: string; created_by: string; created_at: string | null }
export type StageStatus = 'planned' | 'in_progress' | 'verified' | 'completed' | 'blocked'
export type Stage = { id: number; case_id: number; stage_code: string; stage_name: string; planned_cost: number; planned_start: string | null; planned_end: string | null; notes: string; status: StageStatus; created_by: string; created_at: string | null }
export type FinanceSummary = { case_id: number; estimated_cost: number; funding_confirmed: number; funding_received: number; funding_proposed: number; funding_gap: number; existing_loans: number; stages: Array<{ id: number; stage_name: string; planned_cost: number; cumulative_cost: number; cash_shortfall_before_stage: number; status: string }>; warnings: string[] }
export type AgentAction = { agent: string; priority: string; action: string; reason: string; evidence: string[] }
export type AgentPlan = { case_id: number; mode: string; agent_version: string; disclaimer: string; case_manager: { summary: string; specialists: Array<{ agent: string; status: string; findings: Record<string, unknown>; recommended_actions: AgentAction[] }>; priority_actions: AgentAction[] }; approval_gate: { approved: boolean; message: string; required_for: string[] } }
export type AuditEntry = { id: number; case_id: number | null; actor: string; action: string; detail: string; created_at: string | null }
export type Consent = { id: number; consent_given: boolean; consent_scope: string; recorded_by: string; recorded_at: string | null }
export type Rung = { stage: string; label: string; cost: number; instalment_after: number; cum_cost: number; cum_instalments: number; cash_gap_before_instalment: number; timing_gap: number }
export type Ladder = { total_cost: number; subsidy: number; own_savings: number; scheme_loan: number; funding_gap: number; peak_timing_gap: number; rungs: Rung[]; assumptions: string[]; disclaimer: string; pack_id?: string; stages_verified?: boolean; citations?: string[] }
export type Evidence = { id: number; stage_id: number; original_name: string; caption: string; verification_status: 'pending_review' | 'accepted' | 'retake' | string; uploaded_by: string; uploaded_at: string | null; reviewed_by?: string | null; review_note?: string; reviewed_at?: string | null; taken_at?: string | null; gps?: [number, number] | null; checks?: import('./photo-check').Checks }
export type RecoveryTask = { id: number; title: string; description: string; category: string; status: string; owner: string; due_date: string | null }

export class ApiError extends Error {
  constructor(message: string, public status: number) { super(message) }
}

/** Turns FastAPI error bodies (string or validation list) into one readable sentence. */
export function errorText(body: unknown, fallback: string): string {
  const detail = (body as { detail?: unknown } | null)?.detail
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail) && detail[0]?.msg) return `${detail[0].loc?.slice(-1)[0] ?? 'Field'}: ${detail[0].msg}`
  return fallback
}

export function makeClient(token: string, onUnauthorized: () => void) {
  async function raw(path: string, init: RequestInit = {}) {
    const headers = new Headers(init.headers)
    if (token) headers.set('Authorization', `Bearer ${token}`)
    const r = await fetch(`${API_BASE}${path}`, { ...init, headers })
    if (r.status === 401) onUnauthorized()
    return r
  }
  async function json<T>(path: string, init: RequestInit = {}, fallback = 'Request failed'): Promise<T> {
    const headers = new Headers(init.headers)
    if (init.body && !(init.body instanceof FormData)) headers.set('Content-Type', 'application/json')
    const r = await raw(path, { ...init, headers })
    if (r.status === 204) return undefined as T
    const body = await r.json().catch(() => null)
    if (!r.ok) throw new ApiError(errorText(body, fallback), r.status)
    return body as T
  }
  return {
    raw, json,
    get: <T,>(path: string) => json<T>(path),
    post: <T,>(path: string, body?: unknown) => json<T>(path, { method: 'POST', body: body instanceof FormData ? body : JSON.stringify(body ?? {}) }),
    patch: <T,>(path: string, body?: unknown) => json<T>(path, { method: 'PATCH', body: JSON.stringify(body ?? {}) }),
    del: (path: string) => json<void>(path, { method: 'DELETE' }),
  }
}
export type Client = ReturnType<typeof makeClient>
export type AgentStep = { idx: number; phase: 'PLAN' | 'ACT' | 'CHECK' | 'RECOVER' | 'ASK' | 'DONE'; thought_summary: string; tool: string | null; args: Record<string, unknown>; result: Record<string, unknown>; error: string | null; message_en: string; message_kn: string; citations: string[]; ms: number }
export type AgentRun = { id: number; case_id: number; provider: string; goal: string; language: string; status: 'done' | 'asked' | 'blocked' | 'failed' | 'step_limit' | 'running'; message_en: string; message_kn: string; citations: string[]; created_by: string; steps: AgentStep[] }
export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'expired' | 'executing' | 'executed'
export type PublicApproval = { id: number; case_id: number; action: string; label_en: string; label_kn: string; summary_en: string; summary_kn: string; amount_inr: number | null; recipient: string; status: ApprovalStatus; approver: 'family' | 'admin'; expires_at: string | null; beneficiary_first_name?: string; phone_hint?: string }
export type Approval = PublicApproval & { payload: Record<string, unknown>; payload_hash: string; reason: string; citations: string[]; method: string | null; approver_ref: string | null; requested_by: string; decided_by: string | null; result: Record<string, unknown>; executed_at: string | null }
export type OutboxItem = { id: number; channel: string; to: string; subject: string; body: string; case_id: number | null; approval_id: number | null; simulated: boolean; created_at: string | null }
export type ProgressLink = { id: number; case_id: number; token: string; path: string; show_map: boolean; created_by: string; created_at: string | null; views: number; last_viewed_at: string | null }
export type ProgressStep = 'done' | 'ready_to_verify' | 'photo_in_review' | 'retake' | 'photo_needed' | 'not_started' | 'paused'
export type PublicProgress = {
  first_name: string; village: string; taluk: string; status: Status
  stages: Array<{ code: string; name: string; status: StageStatus; step: ProgressStep; done_at: string | null; photos: Array<{ id: number; taken_at: string | null; accepted_at: string | null }> }>
  plot: [number, number] | null; updated_at: string | null; checked_at: string
}

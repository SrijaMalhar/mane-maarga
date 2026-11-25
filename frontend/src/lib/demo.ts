/**
 * Demo mode: a small in-browser stand-in for the Mane Maarga API.
 *
 * It exists so the hosted preview can be explored without a server. It follows the
 * same rules as the real backend (no double counting, proposed money excluded,
 * the PMAY-G Karnataka rule pack for the money ladder, the 30% repayment cap), but
 * holds only invented "(sample)" records in this browser tab. Nothing is sent anywhere.
 * Whenever a real API is reachable, the app uses it instead.
 */
import type { AuthUser, Client } from './api'
import { ApiError } from './api'

const KEY = 'mm_demo_store_v1'
const now = () => new Date().toISOString()

/* The same PMAY-G Karnataka rule pack the API reads, synced from backend/app/engine/rules_data (see scripts/sync-rules.mjs). */
import { formatINR } from './money'
import KA_PMAYG from '../generated/rules/KA__pmayg__2024-25.json'
const amount = (key: string) => KA_PMAYG.amounts.find(a => a.key === key)!
const PACK = {
  pack_id: KA_PMAYG.pack_id,
  unit_assistance: amount('unit_assistance').value,
  scheme_loan_max: amount('scheme_loan_max').value,
  citations: [amount('unit_assistance').id, amount('scheme_loan_max').id],
  stages_verified: KA_PMAYG.stages.verified,
  stages: KA_PMAYG.stages.items.map(s => ({ ...s, label: s.label_en })),
  stage_note: KA_PMAYG.stages.note,
}
const DISCLAIMER = 'Indicative calculation from illustrative assumptions. Not an eligibility, credit or payment decision; verify current scheme rules and lender terms before relying on it.'

type Row = Record<string, any>  
type Store = { seq: number; cases: Row[]; consent: Row[]; docs: Row[]; docText: Record<number, string[]>; extractions: Row[]; funding: Row[]; stages: Row[]; evidence: Row[]; tasks: Row[]; audit: Row[]; users: Row[]; intake: Record<string, Row> }

export const DEMO_USER: AuthUser = { id: 1, username: 'demo_visitor', email: 'demo@example.test', role: 'admin', is_active: true }

/* ---------------- seed ---------------- */
function seed(): Store {
  const s: Store = { seq: 100, cases: [], consent: [], docs: [], docText: {}, extractions: [], funding: [], stages: [], evidence: [], tasks: [], audit: [], users: [{ ...DEMO_USER, created_at: now() }], intake: {} }
  const rows: Array<[string, string, string, string, number, number, number, string]> = [
    ['Lakshmamma (sample)', 'Hosahalli', 'Magadi', 'construction', 320000, 120000, 0, 'Widow, two school-going children. Roof stage pending.'],
    ['Nagaraju K (sample)', 'Kudur', 'Magadi', 'finance_review', 350000, 120000, 40000, 'Daily-wage farm worker; savings of about ₹20,000.'],
    ['Shivamma (sample)', 'Hosahalli', 'Magadi', 'verified', 300000, 0, 0, ''],
    ['Manjunath G (sample)', 'Bidadi', 'Ramanagara', 'planning', 280000, 0, 0, 'Needs plan approval from the gram panchayat.'],
    ['Gowramma (sample)', 'Kudur', 'Magadi', 'completed', 310000, 120000, 0, 'Keys handed over.'],
    ['Ravi Kumar (sample)', 'Harohalli', 'Kanakapura', 'intake', 0, 0, 0, 'First visit done; land record to be collected.'],
    ['Saroja B (sample)', 'Bidadi', 'Ramanagara', 'construction', 340000, 120000, 25000, ''],
    ['Thimmaiah (sample)', 'Harohalli', 'Kanakapura', 'intake', 0, 0, 0, ''],
    ['Kamala D (sample)', 'Hosahalli', 'Magadi', 'finance_review', 0, 120000, 0, 'Cost estimate not yet prepared.'],
  ]
  rows.forEach(([n, v, t, st, est, sanc, loan, notes], i) => {
    const id = i + 1
    s.cases.push({ id, beneficiary_name: n, village: v, taluk: t, phone_last4: '', status: st, estimated_cost: est, sanctioned_amount: sanc, existing_loan: loan, gap_amount: Math.max(0, est - sanc), consent_status: n.startsWith('Thimmaiah') ? 'pending' : 'given', notes, created_at: now() })
    if (!n.startsWith('Thimmaiah')) s.consent.push({ id: s.seq++, case_id: id, consent_given: true, consent_scope: 'case_processing', consent_text_version: 'v1', recorded_by: 'demo_visitor', notes: '', recorded_at: now() })
  })
  const doc = (case_id: number, name: string, lines: string[], status = 'pending') => { const id = s.seq++; s.docs.push({ id, case_id, original_name: name, content_type: 'application/pdf', size_bytes: 700 + lines.join('').length, verification_status: status, uploaded_by: 'demo_visitor', uploaded_at: now() }); s.docText[id] = lines; return id }
  const d1 = doc(1, 'rtc-pahani-hosahalli.pdf', ['RECORD OF RIGHTS (RTC) - SAMPLE', 'Survey No: 45/2', 'Village: Hosahalli', 'Taluk: Magadi', 'Owner: Lakshmamma (sample)', 'Extent: 0.10 acre'], 'verified')
  doc(1, 'pmayg-sanction-order.pdf', ['PMAY-G SANCTION ORDER - SAMPLE', 'Beneficiary: Lakshmamma (sample)', 'Reference No: KA-MGD-2025-0142', 'Unit assistance: Rs 1,20,000'])
  const d3 = doc(2, 'land-record-kudur.pdf', ['RECORD OF RIGHTS (RTC) - SAMPLE', 'Survey No: 112/1', 'Village: Kuduru', 'Taluk: Magadi', 'Owner: Nagaraju K (sample)'])
  doc(3, 'aadhaar-masked.pdf', ['IDENTITY PROOF - SAMPLE (masked)', 'Name: Shivamma (sample)', 'XXXX XXXX 4417'])
  ;[d1, d3].forEach(id => s.extractions.push(extract(s, id)))
  const fund = (case_id: number, source_type: string, source_name: string, amount: number, status: string, scheme_code: string | null = null, reference_number: string | null = null) => s.funding.push({ id: s.seq++, case_id, source_type, source_name, amount, status, scheme_code, reference_number, evidence_document_id: null, notes: '', created_by: 'demo_visitor', created_at: now() })
  fund(1, 'subsidy', 'PMAY-G unit assistance', 120000, 'confirmed', 'PMAY-G', 'KA-MGD-2025-0142')
  fund(1, 'savings', 'Self-help group savings', 25000, 'received')
  fund(1, 'loan', 'PMAY-G scheme loan (applied)', 70000, 'proposed')
  fund(2, 'wages', 'MGNREGA unskilled labour days', 27000, 'proposed')
  ;([[1, 2], [7, 1], [5, 4]] as const).forEach(([cid, done]) => {
    const est = s.cases[cid - 1].estimated_cost
    ;[['plinth', 'Plinth', .25], ['lintel', 'Walls to lintel', .3], ['roof', 'Roof', .3], ['finish', 'Finishing and keys', .15]].forEach(([code, name, share], i) => {
      s.stages.push({ id: s.seq++, case_id: cid, stage_code: code, stage_name: name, planned_cost: Math.round(est * (share as number)), planned_start: null, planned_end: null, notes: '', status: i < done ? 'verified' : i === done && done < 4 ? 'in_progress' : 'planned', created_by: 'demo_visitor', created_at: now() })
    })
  })
  s.tasks.push({ id: s.seq++, case_id: 1, title: 'Confirm roof material quote with mason', description: '', category: 'construction', status: 'open', owner: '', due_date: null, created_at: now() })
  s.cases.forEach(c => audit(s, 'case_created', c.id, 'Beneficiary case created'))
  return s
}

/* ---------------- persistence ---------------- */
let store: Store | null = null
function db(): Store {
  if (store) return store
  try { const raw = sessionStorage.getItem(KEY); if (raw) { store = JSON.parse(raw); return store! } } catch { /* fall through */ }
  store = seed(); save(); return store
}
function save() { try { sessionStorage.setItem(KEY, JSON.stringify(store)) } catch { /* quota or disabled */ } }
export function resetDemo() { store = seed(); save(); blobs.clear() }
const blobs = new Map<number, Blob>()

function audit(s: Store, action: string, case_id: number | null, detail = '') { s.audit.unshift({ id: s.seq++, case_id, actor: 'demo_visitor', action, detail, created_at: now() }) }

/* ---------------- rules, ported from the backend ---------------- */
function recalcGap(c: Row) { c.gap_amount = Math.max(0, Number(c.estimated_cost || 0) - Number(c.sanctioned_amount || 0)) }

function financeSummary(s: Store, c: Row) {
  const src = s.funding.filter(f => f.case_id === c.id)
  const stages = s.stages.filter(x => x.case_id === c.id)
  const confirmed = src.filter(f => ['confirmed', 'received'].includes(f.status)).reduce((a, f) => a + Number(f.amount), 0)
  const received = src.filter(f => f.status === 'received').reduce((a, f) => a + Number(f.amount), 0)
  const proposed = src.filter(f => f.status === 'proposed').reduce((a, f) => a + Number(f.amount), 0)
  const legacy = confirmed === 0 ? Number(c.sanctioned_amount || 0) : 0
  const committed = confirmed + legacy
  const est = Number(c.estimated_cost || 0)
  let cum = 0
  const rows = stages.map(st => { cum += Number(st.planned_cost); return { id: st.id, stage_code: st.stage_code, stage_name: st.stage_name, planned_cost: Number(st.planned_cost), cumulative_cost: cum, cash_received: received, cash_shortfall_before_stage: Math.max(0, cum - received), status: st.status } })
  const warnings: string[] = []
  if (c.existing_loan) warnings.push('Existing household loan is shown as a liability; do not treat it as construction funding unless its disbursement is explicitly verified.')
  if (proposed) warnings.push('Proposed funding is not counted toward confirmed funds or affordability.')
  if (legacy) warnings.push('Legacy sanctioned_amount is counted as confirmed funding because no detailed confirmed/received source exists. Reconcile to documents to avoid double counting.')
  if (committed > est) warnings.push('Recorded confirmed funding exceeds estimated cost; verify duplicate or restricted sources.')
  return { case_id: c.id, estimated_cost: est, funding_confirmed: committed, funding_received: received, funding_proposed: proposed, funding_gap: Math.max(0, est - committed), existing_loans: Number(c.existing_loan || 0), stages: rows, warnings, eligibility: 'NOT_ASSESSED', finance_recommendation: 'NOT_GENERATED' }
}

function ladder(total: number, savings = 0, loan = 0, grants = 0) {
  if (!(total > 0)) throw new ApiError('total_cost must be positive', 422)
  loan = Math.min(loan, PACK.scheme_loan_max)
  const base = savings + loan + grants
  let cumCost = 0, cumIn = 0
  const gaps: number[] = []
  const rungs: Row[] = PACK.stages.map(st => {
    const cost = total * st.cost_share, inst = PACK.unit_assistance * st.instalment_share
    cumCost += cost
    gaps.push(Math.max(0, cumCost - (base + cumIn)))
    cumIn += inst
    return { stage: st.id, label: st.label, cost: Math.round(cost), instalment_after: Math.round(inst), cum_cost: Math.round(cumCost), cum_instalments: Math.round(cumIn) }
  })
  const funding_gap = Math.max(0, total - (base + PACK.unit_assistance))
  rungs.forEach((r, i) => { r.cash_gap_before_instalment = Math.round(gaps[i]); r.timing_gap = Math.round(Math.max(0, gaps[i] - funding_gap)) })
  return { total_cost: Math.round(total), subsidy: PACK.unit_assistance, own_savings: savings, scheme_loan: loan, funding_gap: Math.round(funding_gap), peak_timing_gap: Math.max(...rungs.map(r => r.timing_gap)), rungs, assumptions: PACK.stages_verified ? [] : [PACK.stage_note], pack_id: PACK.pack_id, stages_verified: PACK.stages_verified, citations: PACK.citations, disclaimer: DISCLAIMER }
}

const emi = (p: number, rate: number, m: number) => { if (p <= 0) return 0; const r = rate / 12; return r === 0 ? p / m : (p * r) / (1 - (1 + r) ** -m) }
const maxPrincipal = (e: number, rate: number, m: number) => { if (e <= 0) return 0; const r = rate / 12; return r === 0 ? e * m : (e * (1 - (1 + r) ** -m)) / r }
function affordability(b: Row) {
  const xs = [...b.monthly_income].map(Number).sort((a, c) => a - c)
  if (!xs.length) throw new ApiError('income history required', 422)
  const k = Math.max(1, Math.round(xs.length * 0.75))
  const income = xs.slice(0, k).reduce((a, x) => a + x, 0) / k
  const cap = income * 0.3
  const existing = (b.existing_loans ?? []).reduce((a: number, l: Row) => a + emi(l.principal, l.rate_pa, l.months), 0)
  const headroom = Math.max(0, cap - existing)
  const max_new = maxPrincipal(headroom, b.rate_pa, b.months)
  const approved = Math.min(b.requested, max_new)
  const notes: string[] = []
  if (b.requested > max_new) notes.push('Requested loan exceeds the 30% cap; sized down. Offer the no-loan path (phase the build).')
  if (existing >= cap) notes.push('Existing repayments already at or above the cap; no new loan.')
  return { income, cap_amount: cap, existing_emi: existing, headroom, max_new_loan: max_new, indicative_loan_within_cap: approved, no_loan_path: approved < b.requested, notes, disclaimer: DISCLAIMER }
}

const norm = (v: string) => v.replace(/[^\p{L}\p{N}\s]/gu, '').trim().toLowerCase()
function extract(s: Store, docId: number): Row {
  const d = s.docs.find(x => x.id === docId)!
  const c = s.cases.find(x => x.id === d.case_id)!
  const lines = s.docText[docId]
  if (!lines) {
    return { id: s.seq++, document_id: docId, extraction_status: 'review_required', document_type: 'unknown', extracted_fields: {}, checks: [{ field: 'extraction', status: 'insufficient_data', severity: 'warning', message: 'Demo mode cannot read uploaded files. Text extraction runs on the API (pypdf + Tesseract).' }], engine: 'demo', confidence: 0, extracted_at: now() }
  }
  const text = lines.join('\n')
  const pick = (re: RegExp) => text.match(re)?.[1]?.trim()
  const fields: Record<string, string> = {}
  const add = (k: string, v?: string) => { if (v) fields[k] = v }
  add('survey_number', pick(/survey\s*(?:no\.?|number)?\s*[:#-]?\s*([\w/-]+)/i))
  add('village', pick(/village\s*[:#-]?\s*([A-Za-z][A-Za-z .'-]{1,60})/i))
  add('taluk', pick(/taluk\s*[:#-]?\s*([A-Za-z][A-Za-z .'-]{1,60})/i))
  add('extent', pick(/extent\s*[:#-]?\s*([\d.]+\s*\w*)/i))
  add('beneficiary_name', pick(/(?:beneficiary|owner|name)\s*[:#-]?\s*([A-Za-z][A-Za-z .'-]{1,80})/i))
  add('document_number', pick(/reference\s*(?:no\.?|number)?\s*[:#-]?\s*([A-Z0-9/-]{3,30})/i))
  const lower = text.toLowerCase()
  const type = /rtc|record of rights|survey/.test(lower) ? 'land_record' : /sanction|pmay/.test(lower) ? 'scheme_sanction' : 'unknown'
  const checks = (['beneficiary_name', 'village', 'taluk'] as const).filter(k => fields[k]).map(k => {
    const match = norm(fields[k]) === norm(String(c[k]))
    return { field: k, status: match ? 'match' : 'mismatch', extracted: fields[k], case_value: c[k], severity: match ? 'info' : 'review' }
  })
  return { id: s.seq++, document_id: docId, extraction_status: checks.some(x => x.status === 'mismatch') ? 'review_required' : 'extracted', document_type: type, extracted_fields: fields, checks, engine: 'demo-text', confidence: 0.55, extracted_at: now() }
}

/** Mirrors the backend's scripted agent (app/agents/scripts/case_review.yaml): same steps, same tools, same guard. */
function agentRun(s: Store, c: Row) {
  const steps: Row[] = []
  const step = (phase: string, extra: Row = {}) => steps.push({ idx: steps.length + 1, phase, thought_summary: '', tool: null, args: {}, result: {}, error: null, message_en: '', message_kn: '', citations: [], ms: 0, ...extra })
  const docs = s.docs.filter(d => d.case_id === c.id)
  step('PLAN', { thought_summary: 'Read the case, check its documents, then build the money ladder and tell the family what cash they will need.' })
  step('ACT', { tool: 'get_case', args: { case_id: c.id }, result: { beneficiary_name: c.beneficiary_name } })
  step('ACT', { tool: 'check_documents', args: { case_id: c.id }, result: { document_count: docs.length } })
  const est = Number(c.estimated_cost || 0)
  const run: Row = { id: s.seq++, case_id: c.id, provider: 'mock (in-browser)', goal: 'Review this case and say what to do next.', language: 'en', created_by: 'demo_visitor', citations: [] }
  if (est <= 0) {
    step('ACT', { tool: 'build_money_ladder', args: { case_id: c.id }, error: 'missing_cost_estimate' })
    const t = { id: s.seq++, case_id: c.id, title: 'Record a construction cost estimate', category: 'finance', description: 'The money ladder needs a cost estimate from the taluk engineer.', owner: '', due_date: null, status: 'open', created_at: now() }
    s.tasks.push(t)
    step('RECOVER', { tool: 'create_task', args: { case_id: c.id, title: t.title }, result: { task_id: t.id } })
    step('CHECK')
    Object.assign(run, { status: 'asked', message_en: 'This case has no cost estimate, so I cannot work out the cash needed per stage. I created a task to record one. Can you get the estimate from the engineer?', message_kn: 'ಈ ಕಡತದಲ್ಲಿ ವೆಚ್ಚದ ಅಂದಾಜು ಇಲ್ಲ, ಆದ್ದರಿಂದ ಪ್ರತಿ ಹಂತಕ್ಕೆ ಬೇಕಾದ ಹಣ ಲೆಕ್ಕಿಸಲು ಆಗುವುದಿಲ್ಲ. ಅದಕ್ಕಾಗಿ ಕಾರ್ಯ ರಚಿಸಿದ್ದೇನೆ. ಎಂಜಿನಿಯರ್‌ನಿಂದ ಅಂದಾಜು ಪಡೆಯಬಹುದೇ?' })
    step('ASK', { message_en: run.message_en, message_kn: run.message_kn })
  } else {
    const l = ladder(est)
    const peak = Math.max(...l.rungs.map((r: Row) => r.cash_gap_before_instalment))
    step('ACT', { tool: 'build_money_ladder', args: { case_id: c.id }, result: { peak_cash_before_instalment: peak, peak_timing_gap: l.peak_timing_gap, funding_gap: l.funding_gap } })
    step('ACT', { tool: 'draft_message', args: { case_id: c.id, kind: 'cash_needed', language: 'kn' }, result: { sent: false } })
    step('CHECK')
    const name = c.beneficiary_name
    Object.assign(run, {
      status: 'done', citations: [PACK.citations[0]],
      message_en: `${name} will need about ${formatINR(peak)} in hand before an instalment arrives; the largest timing gap is ${formatINR(l.peak_timing_gap)} and the gap no scheme money covers is ${formatINR(l.funding_gap)}. Unit assistance is ${formatINR(PACK.unit_assistance)} (cited). The stage split is illustrative. A Kannada message to the family is drafted, not sent.`,
      message_kn: `${name} ಅವರಿಗೆ ಕಂತು ಬರುವ ಮೊದಲು ಸುಮಾರು ${formatINR(peak)} ಕೈಯಲ್ಲಿ ಬೇಕು; ದೊಡ್ಡ ಸಮಯದ ಅಂತರ ${formatINR(l.peak_timing_gap)}, ಯೋಜನೆಯ ಹಣ ತುಂಬದ ಕೊರತೆ ${formatINR(l.funding_gap)}. ಘಟಕ ನೆರವು ${formatINR(PACK.unit_assistance)}. ಹಂತಗಳ ಹಂಚಿಕೆ ಉದಾಹರಣೆ ಮಾತ್ರ. ಕುಟುಂಬಕ್ಕೆ ಕನ್ನಡ ಸಂದೇಶ ಸಿದ್ಧವಾಗಿದೆ, ಕಳುಹಿಸಿಲ್ಲ.`,
    })
    step('DONE', { message_en: run.message_en, message_kn: run.message_kn, citations: run.citations })
  }
  audit(s, 'agent_run_finished', c.id, `run ${run.id}: ${run.status} via mock`)
  return { ...run, steps }
}

function agentPlan(s: Store, c: Row) {
  const docs = s.docs.filter(d => d.case_id === c.id)
  const ex = s.extractions.filter(e => docs.some(d => d.id === e.document_id))
  const missing = docs.filter(d => !ex.some(e => e.document_id === d.id)).map(d => d.original_name)
  const review = docs.filter(d => ex.find(e => e.document_id === d.id)?.extraction_status === 'review_required').map(d => d.original_name)
  const fin = financeSummary(s, c)
  const confirmed = s.funding.filter(f => f.case_id === c.id && ['confirmed', 'received'].includes(f.status)).reduce((a, f) => a + Number(f.amount), 0)
  const proposed = fin.funding_proposed
  const cost = Number(c.estimated_cost || 0)
  // Same rule as the API: the sanctioned amount counts only when no confirmed source exists.
  const gap = Math.max(0, cost - (confirmed > 0 ? confirmed : Number(c.sanctioned_amount || 0)))
  const stages = s.stages.filter(x => x.case_id === c.id)
  const stalled = stages.filter(x => ['planned', 'delayed'].includes(x.status)).map(x => x.stage_name)
  const act = (agent: string, priority: string, action: string, reason: string, evidence: string[] = []) => ({ agent, priority, action, reason, evidence })
  const docA = [...(missing.length ? [act('document_agent', 'high', 'Run extraction and review uploaded documents', `${missing.length} uploaded document(s) have no extraction record.`, missing)] : []), ...(review.length ? [act('document_agent', 'high', 'Resolve document mismatch flags', 'Extraction indicates fields requiring human review.', review)] : []), ...(!docs.length ? [act('document_agent', 'high', 'Collect required land and sanction documents', 'No documents are attached to this case yet.')] : [])]
  const finA = [...(cost <= 0 ? [act('finance_agent', 'medium', 'Record a construction cost estimate', 'A funding gap cannot be estimated without a cost estimate.')] : gap > 0 ? [act('finance_agent', 'high', 'Review funding gap and stage-wise cash needs', `Estimated unfunded amount is ₹${Math.round(gap).toLocaleString('en-IN')}; proposed funding is not counted as confirmed.`)] : []), ...(proposed ? [act('finance_agent', 'medium', 'Verify proposed funding sources', `₹${proposed.toLocaleString('en-IN')} is proposed and not treated as confirmed/received.`)] : [])]
  const conA = !stages.length ? [act('construction_agent', 'medium', 'Create a construction stage plan', 'No stages are recorded for this case.')] : stalled.length ? [act('construction_agent', 'medium', 'Review planned or delayed construction stages', `${stalled.length} stage(s) need progress review.`, stalled)] : []
  const blockers = [...new Set([...review, ...missing, ...(!docs.length ? ['no documents'] : []), ...(cost <= 0 ? ['no cost estimate'] : gap > 0 ? ['funding gap'] : []), ...(!stages.length ? ['no construction stages'] : []), ...stalled])]
  const recA = blockers.length ? [act('recovery_agent', 'high', 'Create a recovery checklist with owner and due date', 'Multiple unresolved blockers may delay the case.', blockers)] : []
  const spec = (agent: string, a: Row[]) => ({ agent, status: a.length ? 'attention_required' : 'no_action', findings: {}, recommended_actions: a })
  audit(s, 'agent_plan_generated', c.id, 'Deterministic prototype agent plan generated (demo)')
  return { case_id: c.id, agent_version: '0.1.0-deterministic (demo)', mode: 'deterministic_prototype', disclaimer: 'These are workflow suggestions, not legal, scheme-eligibility, credit, or payment decisions. Verify evidence and obtain beneficiary approval before submissions or payments.', case_manager: { summary: '', case_status: c.status, specialists: [spec('document_agent', docA), spec('finance_agent', finA), spec('construction_agent', conA), spec('recovery_agent', recA)], priority_actions: [...docA, ...finA, ...conA, ...recA] }, approval_gate: { required_for: ['government_or_bank_submission', 'financial_offer_or_loan', 'payment_or_disbursement', 'case_status_change'], approved: false, message: 'No external action was performed. Operator review and beneficiary consent are required.' } }
}

const SCHEMES = [
  { code: 'PMAY-G', name: 'Pradhan Mantri Awaas Yojana - Gramin', level: 'central', type: 'rural housing assistance', source_url: 'https://pmayg.nic.in/', documents_common: ['identity proof', 'land/household records', 'bank details', 'local verification records'], note: 'Reference catalogue only. Current eligibility, amount, availability and process must be verified with official sources and local authorities.' },
  { code: 'PMAY-U-2.0-BLC', name: 'PMAY Urban 2.0 - Beneficiary Led Construction', level: 'central', type: 'urban housing assistance', source_url: 'https://pmay-urban.gov.in/', documents_common: ['identity proof', 'land ownership/tenure proof', 'income documents', 'bank details'], note: 'Reference catalogue only. Do not infer eligibility or benefit amounts from this prototype.' },
  { code: 'BASAVA-VASATI', name: 'Basava Vasati Yojana', level: 'state', type: 'Karnataka housing scheme', source_url: 'https://ashraya.karnataka.gov.in/', documents_common: ['identity proof', 'residence records', 'income records', 'land/household details'], note: "State scheme reference. Verify active rules and availability with Karnataka's official housing department." },
  { code: 'AMBEDKAR-NIVAS', name: 'Dr. B.R. Ambedkar Nivas Yojana', level: 'state', type: 'Karnataka housing scheme', source_url: 'https://ashraya.karnataka.gov.in/', documents_common: ['identity proof', 'residence records', 'category documents where applicable', 'land/household details'], note: 'Reference only; no caste/category inference or eligibility determination is performed.' },
]
const INTAKE_FIELDS = ['beneficiary_name', 'village', 'taluk', 'land_status', 'household_size', 'housing_need', 'phone_last4']
const PROMPTS: Record<string, Record<string, string>> = {
  en: { start: "Hello. I'll collect a few details to help plan your house-building journey. What is your name?", beneficiary_name: 'Which village are you from?', village: 'Which taluk are you in?', taluk: 'Do you have land/site for building? (yes/no/unsure)', land_status: 'How many people are in your household?', household_size: 'What help do you need first: documents, scheme information, budget estimate, or construction steps?', housing_need: 'If you want, enter the last four digits of your phone number. Otherwise type skip.', phone_last4: 'Thank you. An operator can review these details and create a case. This is prototype intake; no government application was submitted.' },
  kn: {start: "ನಮಸ್ಕಾರ. ನಿಮ್ಮ ಮನೆ ಕೆಲಸಕ್ಕೆ ಸಹಾಯ ಮಾಡೋಕೆ ಕೆಲವು ವಿಷಯ ಕೇಳ್ತೀನಿ. ಮೊದಲು, ನಿಮ್ಮ ಹೆಸರು ಹೇಳಿ.", beneficiary_name: "ಸರಿ. ನಿಮ್ಮ ಊರು ಯಾವುದು?", village: "ಆ ಊರು ಯಾವ ತಾಲ್ಲೂಕಿಗೆ ಸೇರುತ್ತೆ?", taluk: "ಮನೆ ಕಟ್ಟೋಕೆ ನಿಮ್ಮದೇ ಜಾಗ ಇದೆಯಾ? ಹೌದು, ಇಲ್ಲ, ಅಥವಾ ಗೊತ್ತಿಲ್ಲ ಅಂತ ಹೇಳಿ.", land_status: "ಮನೆಯಲ್ಲಿ ಒಟ್ಟು ಎಷ್ಟು ಜನ ಇದ್ದೀರಿ?", household_size: "ಈಗ ಮೊದಲು ಯಾವ ಸಹಾಯ ಬೇಕು? ದಾಖಲೆ ಕೆಲಸ, ಯೋಜನೆಯ ಮಾಹಿತಿ, ಖರ್ಚಿನ ಅಂದಾಜು, ಅಥವಾ ಕಟ್ಟಡದ ಹಂತಗಳು?", housing_need: "ನಿಮಗೆ ಇಷ್ಟ ಇದ್ದರೆ ಮಾತ್ರ, ಫೋನ್ ನಂಬರಿನ ಕೊನೆಯ ನಾಲ್ಕು ಅಂಕಿ ಹೇಳಿ. ಬೇಡ ಅಂದರೆ, ಬೇಡ ಅನ್ನಿ.", phone_last4: "ತುಂಬಾ ಧನ್ಯವಾದ. ನಮ್ಮ ಸಿಬ್ಬಂದಿ ಈ ವಿವರ ನೋಡಿ ನಿಮ್ಮ ಕಡತ ತೆರೆಯುತ್ತಾರೆ. ಇನ್ನೂ ಯಾವ ಸರ್ಕಾರಿ ಅರ್ಜಿಯನ್ನೂ ಹಾಕಿಲ್ಲ."},
}
PROMPTS.te = PROMPTS.en

/** A tiny valid PDF with real text, so the preview shows a document. */
function pdf(lines: string[]): Blob {
  const esc = (l: string) => l.replace(/[\\()]/g, m => '\\' + m)
  const text = 'BT /F1 13 Tf 50 760 Td 18 TL ' + lines.map(l => `(${esc(l)}) Tj T*`).join(' ') + ' ET'
  const objs = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>', '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>', `<< /Length ${text.length} >>\nstream\n${text}\nendstream`, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>']
  let out = '%PDF-1.4\n'; const offs: number[] = []
  objs.forEach((b, i) => { offs.push(out.length); out += `${i + 1} 0 obj\n${b}\nendobj\n` })
  const x = out.length
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + offs.map(o => `${String(o).padStart(10, '0')} 00000 n \n`).join('') + `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${x}\n%%EOF\n`
  return new Blob([out], { type: 'application/pdf' })
}

/* ---------------- router ---------------- */
type Handler = (m: RegExpMatchArray, body: Row, q: URLSearchParams) => unknown
function routes(s: Store): Array<[string, RegExp, Handler]> {
  const caseOr404 = (id: string) => { const c = s.cases.find(x => x.id === Number(id)); if (!c) throw new ApiError('Case not found', 404); return c }
  const docOr404 = (id: string) => { const d = s.docs.find(x => x.id === Number(id)); if (!d) throw new ApiError('Document not found', 404); return d }
  return [
    ['GET', /^\/api\/auth\/me$/, () => DEMO_USER],
    ['GET', /^\/api\/auth\/users$/, () => s.users],
    ['POST', /^\/api\/auth\/users$/, (_, b) => { if (s.users.some(u => u.username === b.username)) throw new ApiError('Username or email already exists', 409); const u = { id: s.seq++, username: b.username, email: b.email, role: b.role, is_active: true, created_at: now() }; s.users.unshift(u); audit(s, 'user_created', null, `username=${u.username}; role=${u.role}`); return u }],
    ['GET', /^\/api\/cases$/, () => [...s.cases].reverse()],
    ['POST', /^\/api\/cases$/, (_, b) => { const c = { id: s.seq++, phone_last4: '', status: 'intake', notes: '', ...b, consent_status: 'pending', created_at: now() }; recalcGap(c); s.cases.push(c); audit(s, 'case_created', c.id, 'Beneficiary case created'); return c }],
    ['GET', /^\/api\/cases\/(\d+)$/, m => caseOr404(m[1])],
    ['PATCH', /^\/api\/cases\/(\d+)$/, (m, b) => { const c = caseOr404(m[1]); Object.assign(c, b); recalcGap(c); audit(s, 'case_updated', c.id, Object.keys(b).sort().join(',')); return c }],
    ['DELETE', /^\/api\/cases\/(\d+)$/, m => { const c = caseOr404(m[1]); s.cases = s.cases.filter(x => x !== c); audit(s, 'case_deleted', c.id, 'Beneficiary case deleted'); return undefined }],
    ['GET', /^\/api\/cases\/(\d+)\/consent$/, m => s.consent.filter(x => x.case_id === caseOr404(m[1]).id).reverse()],
    ['POST', /^\/api\/cases\/(\d+)\/consent$/, (m, b) => { const c = caseOr404(m[1]); const r = { id: s.seq++, case_id: c.id, consent_scope: 'case_processing', consent_text_version: 'v1', notes: '', ...b, recorded_by: 'demo_visitor', recorded_at: now() }; c.consent_status = b.consent_given ? 'given' : 'withdrawn'; s.consent.push(r); audit(s, 'consent_recorded', c.id, `consent_given=${b.consent_given}`); return r }],
    ['GET', /^\/api\/cases\/(\d+)\/documents$/, m => s.docs.filter(d => d.case_id === caseOr404(m[1]).id).reverse()],
    ['POST', /^\/api\/cases\/(\d+)\/documents$/, (m, b) => {
      const c = caseOr404(m[1]); const f = b.__file as File
      if (!/\.(pdf|png|jpe?g)$/i.test(f.name)) throw new ApiError('Only PDF, PNG, and JPEG files are accepted', 415)
      if (f.size > 10 * 1048576) throw new ApiError('File exceeds 10 MB limit', 413)
      const d = { id: s.seq++, case_id: c.id, original_name: f.name, content_type: f.type || 'application/octet-stream', size_bytes: f.size, verification_status: 'pending', uploaded_by: 'demo_visitor', uploaded_at: now() }
      s.docs.push(d); blobs.set(d.id, f); audit(s, 'document_uploaded', c.id, `document_id=${d.id}; size=${f.size}`); return d
    }],
    ['GET', /^\/api\/documents\/(\d+)\/extraction$/, m => { const e = s.extractions.find(x => x.document_id === Number(m[1])); if (!e) throw new ApiError('Extraction not found', 404); return e }],
    ['POST', /^\/api\/documents\/(\d+)\/extract$/, (m, b) => { const d = docOr404(m[1]); const prev = s.extractions.find(x => x.document_id === d.id); if (prev && !b.force) return prev; s.extractions = s.extractions.filter(x => x !== prev); const e = extract(s, d.id); s.extractions.push(e); audit(s, 'document_extracted', d.case_id, `document_id=${d.id}; status=${e.extraction_status}`); return e }],
    ['PATCH', /^\/api\/documents\/(\d+)\/verification$/, (m, _b, q) => { const st = q.get('status') ?? ''; if (!['pending', 'verified', 'rejected'].includes(st)) throw new ApiError('Status must be pending, verified, or rejected', 422); const d = docOr404(m[1]); d.verification_status = st; audit(s, 'document_verification_updated', d.case_id, `document_id=${d.id}; status=${st}`); return d }],
    ['GET', /^\/api\/cases\/(\d+)\/finance-summary$/, m => financeSummary(s, caseOr404(m[1]))],
    ['GET', /^\/api\/cases\/(\d+)\/funding$/, m => s.funding.filter(f => f.case_id === caseOr404(m[1]).id).reverse()],
    ['POST', /^\/api\/cases\/(\d+)\/funding$/, (m, b) => {
      const c = caseOr404(m[1])
      if (b.scheme_code && b.reference_number && ['confirmed', 'received'].includes(b.status) && s.funding.some(f => f.case_id === c.id && f.scheme_code === b.scheme_code && f.reference_number === b.reference_number && ['confirmed', 'received'].includes(f.status))) throw new ApiError('This scheme/reference is already recorded as confirmed or received', 409)
      if (!(Number(b.amount) > 0)) throw new ApiError('amount: must be greater than 0', 422)
      const f: Row = { id: s.seq++, case_id: c.id, evidence_document_id: null, notes: '', ...b, created_by: 'demo_visitor', created_at: now() }; s.funding.push(f); audit(s, 'funding_source_added', c.id, `source_id=${f.id}; type=${f.source_type}; status=${f.status}; amount=${f.amount}`); return f
    }],
    ['GET', /^\/api\/cases\/(\d+)\/stages$/, m => s.stages.filter(x => x.case_id === caseOr404(m[1]).id)],
    ['POST', /^\/api\/cases\/(\d+)\/stages$/, (m, b) => { const c = caseOr404(m[1]); if (!(Number(b.planned_cost) > 0)) throw new ApiError('planned_cost: must be greater than 0', 422); const st: Row = { id: s.seq++, case_id: c.id, planned_start: null, planned_end: null, notes: '', ...b, status: 'planned', created_by: 'demo_visitor', created_at: now() }; s.stages.push(st); audit(s, 'construction_stage_created', c.id, `stage_id=${st.id}; code=${st.stage_code}`); return st }],
    ['PATCH', /^\/api\/stages\/(\d+)\/status$/, (m, b) => { const st = s.stages.find(x => x.id === Number(m[1])); if (!st) throw new ApiError('Construction stage not found', 404); st.status = b.status; audit(s, 'construction_stage_status_updated', st.case_id, `stage_id=${st.id}; status=${b.status}`); return st }],
    ['GET', /^\/api\/cases\/(\d+)\/construction-evidence$/, m => s.evidence.filter(e => e.case_id === caseOr404(m[1]).id)],
    ['POST', /^\/api\/cases\/(\d+)\/stages\/(\d+)\/evidence$/, (m, b) => { const c = caseOr404(m[1]); const f = b.__file as File; if (!['image/jpeg', 'image/png', 'image/webp'].includes(f.type)) throw new ApiError('Evidence must be JPEG, PNG or WebP', 415); const e = { id: s.seq++, case_id: c.id, stage_id: Number(m[2]), original_name: f.name, caption: '', verification_status: 'pending_review', uploaded_by: 'demo_visitor', uploaded_at: now() }; s.evidence.unshift(e); audit(s, 'construction_evidence_uploaded', c.id, `stage_id=${m[2]}; review_required`); return e }],
    ['GET', /^\/api\/cases\/(\d+)\/agent-plan$/, m => agentPlan(s, caseOr404(m[1]))],
    ['POST', /^\/api\/cases\/(\d+)\/agent\/run$/, m => agentRun(s, caseOr404(m[1]))],
    ['GET', /^\/api\/audit$/, (_, _b, q) => { const id = q.get('case_id'); return s.audit.filter(a => !id || a.case_id === Number(id)).slice(0, 500) }],
    ['POST', /^\/api\/engine\/ladder$/, (_, b) => ladder(Number(b.total_cost), Number(b.own_savings || 0), Number(b.scheme_loan || 0), Number(b.extra_grants || 0))],
    ['POST', /^\/api\/engine\/affordability$/, (_, b) => affordability(b)],
    ['GET', /^\/api\/intelligence\/schemes$/, () => ({ items: SCHEMES, count: SCHEMES.length })],
    ['POST', /^\/api\/intelligence\/intake$/, (_, b) => { const tok = Math.random().toString(36).slice(2); const lang = ['kn', 'en', 'te'].includes(b.language) ? b.language : 'kn'; s.intake[tok] = { language: lang, next: 'beneficiary_name', fields: {}, status: 'in_progress' }; return { session_token: tok, language: lang, status: 'in_progress', message: PROMPTS[lang].start, next_field: 'beneficiary_name' } }],
    ['POST', /^\/api\/intelligence\/intake\/([\w-]+)\/message$/, (m, b) => {
      const it = s.intake[m[1]]; if (!it) throw new ApiError('Intake session not found', 404); if (it.status !== 'in_progress') throw new ApiError('Intake session is already complete', 409)
      const field = it.next as string; let ans = String(b.message || '').trim()
      if (field === 'phone_last4') { ans = ans.replace(/[೦-೯]/g, d => String('೦೧೨೩೪೫೬೭೮೯'.indexOf(d))).replace(/\s/g, ''); if (['skip', 'no', 'ಬೇಡ', 'ಬೇಡಾ', 'ಬೇಡ್ಲ', 'ಇಲ್ಲ'].includes(ans.toLowerCase().replace(/\.$/, ''))) ans = '' }
      if (field === 'phone_last4' && ans && !/^\d{4}$/.test(ans)) return { status: 'in_progress', message: it.language === 'kn' ? 'ದಯವಿಟ್ಟು ನಾಲ್ಕು ಅಂಕಿ ಹೇಳಿ, ಅಥವಾ ಬೇಡ ಅನ್ನಿ.' : 'Please enter exactly four digits or type skip.', next_field: field, fields: it.fields }
      it.fields[field] = ans; const i = INTAKE_FIELDS.indexOf(field); it.next = INTAKE_FIELDS[i + 1] ?? null; if (!it.next) it.status = 'completed'
      return { status: it.status, message: PROMPTS[it.language][field] ?? 'Thank you.', next_field: it.next, fields: it.fields }
    }],
    ['POST', /^\/api\/cases\/(\d+)\/budget-plan$/, (m, b) => {
      const c = caseOr404(m[1]); const rates: Record<string, number> = { basic: 1450, standard: 1850, improved: 2350 }
      if (Math.abs(b.labor_percent + b.materials_percent + b.other_percent - 100) > 0.01) throw new ApiError('Labor, materials and other percentages must total 100', 422)
      const base = b.built_up_sqft * rates[b.quality_tier]; const cont = (base * b.contingency_percent) / 100; const total = base + cont
      const confirmed = s.funding.filter(f => f.case_id === c.id && ['confirmed', 'received'].includes(f.status)).reduce((a, f) => a + Number(f.amount), 0)
      audit(s, 'budget_plan_created', c.id, 'Indicative budget plan created')
      return { assumptions: { indicative_cost_per_sqft: rates[b.quality_tier] }, base_cost: base, contingency: cont, estimated_total: total, allocation: { labor: (base * b.labor_percent) / 100, materials: (base * b.materials_percent) / 100, other: (base * b.other_percent) / 100, contingency: cont }, confirmed_funding: confirmed, funding_gap: Math.max(0, total - confirmed), warnings: ['Indicative estimate only; actual costs vary by location, design, material prices and labor.', 'No loan eligibility, creditworthiness, subsidy eligibility or affordability decision is made.', 'Proposed funding is excluded from confirmed funding.'] }
    }],
    ['GET', /^\/api\/cases\/(\d+)\/recovery-tasks$/, m => s.tasks.filter(t => t.case_id === caseOr404(m[1]).id).reverse()],
    ['POST', /^\/api\/cases\/(\d+)\/recovery-tasks$/, (m, b) => { const c = caseOr404(m[1]); const t = { id: s.seq++, case_id: c.id, description: '', category: 'document', owner: '', due_date: null, ...b, status: 'open', created_at: now() }; s.tasks.push(t); audit(s, 'recovery_task_created', c.id, b.title); return t }],
    ['PATCH', /^\/api\/recovery-tasks\/(\d+)$/, (m, b) => { const t = s.tasks.find(x => x.id === Number(m[1])); if (!t) throw new ApiError('Task not found', 404); Object.assign(t, b); audit(s, 'recovery_task_updated', t.case_id, `task_id=${t.id}; status=${b.status}`); return t }],
    ['POST', /^\/api\/intelligence\/evaluation\/synthetic$/, () => { const cases = [['missing_land_record', 'flag_missing_document'], ['proposed_funding_not_confirmed', 'exclude_from_confirmed'], ['consent_withdrawn', 'block_processing'], ['scheme_eligibility_unknown', 'avoid_eligibility_claim'], ['human_approval_gate', 'no_auto_submission']].map(([name, e]) => ({ name, expected: e, actual: e })); return { suite: 'mane-maarga-safety-smoke-v1', cases, passed: 5, score: 1, note: 'Fixed demo scenarios.' } }],
  ]
}

export function makeDemoClient(): Client {
  async function dispatch(method: string, path: string, body: unknown): Promise<unknown> {
    const s = db()
    const [p, query = ''] = path.split('?')
    for (const [m, re, h] of routes(s)) {
      if (m !== method) continue
      const match = p.match(re)
      if (match) { const out = h(match, (body ?? {}) as Row, new URLSearchParams(query)); save(); return structuredClone(out) }
    }
    throw new ApiError('Not available in demo mode', 404)
  }
  const parse = (init: RequestInit): unknown => {
    if (init.body instanceof FormData) return { __file: init.body.get('file') }
    return init.body ? JSON.parse(String(init.body)) : undefined
  }
  async function json<T>(path: string, init: RequestInit = {}): Promise<T> {
    await new Promise(r => setTimeout(r, 120)) // feel like a network call
    return dispatch((init.method ?? 'GET').toUpperCase(), path, parse(init)) as Promise<T>
  }
  async function raw(path: string, init: RequestInit = {}): Promise<Response> {
    const dl = path.match(/^\/api\/documents\/(\d+)\/download$/)
    if (dl) {
      const id = Number(dl[1]); const lines = db().docText[id]; const blob = blobs.get(id) ?? (lines ? pdf(lines) : null)
      return blob ? new Response(blob, { status: 200 }) : new Response(null, { status: 404 })
    }
    try { return new Response(JSON.stringify(await json(path, init)), { status: 200 }) } catch (e) { return new Response(JSON.stringify({ detail: (e as Error).message }), { status: (e as ApiError).status ?? 500 }) }
  }
  return {
    raw, json,
    get: <T,>(path: string) => json<T>(path),
    post: <T,>(path: string, body?: unknown) => json<T>(path, { method: 'POST', body: body instanceof FormData ? body : JSON.stringify(body ?? {}) }),
    patch: <T,>(path: string, body?: unknown) => json<T>(path, { method: 'PATCH', body: JSON.stringify(body ?? {}) }),
    del: (path: string) => json<void>(path, { method: 'DELETE' }),
  }
}

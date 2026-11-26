/* Gated actions for one case: what is waiting, who must approve, and what ran.
   Family actions are approved only on the family's own page with a one-time code; staff cannot approve them. */
import { useCallback, useEffect, useState } from 'react'
import { Link2, MessageSquareText, Plus, ShieldCheck, Smartphone } from 'lucide-react'
import { Notice, Tag } from './ui'
import { Stamp } from './ledger'
import FamilyApproval from '../pages/FamilyApproval'
import type { Approval, OutboxItem } from '../lib/api'
import { useApp } from '../lib/app-context'
import { formatINR } from '../lib/money'

const TONE: Record<string, 'confirmed' | 'estimate' | 'warn' | undefined> = { executed: 'confirmed', approved: 'confirmed', pending: 'estimate', rejected: 'warn', expired: 'warn' }

type Field = { key: string; label: string; type?: 'number' | 'text' | 'select'; options?: string[] }
const FORMS: Record<string, { label: string; fields: Field[] }> = {
  pay_any_amount: { label: 'Make a payment', fields: [{ key: 'amount_inr', label: 'Amount (₹)', type: 'number' }, { key: 'payee', label: 'Paid to' }, { key: 'purpose', label: 'For' }] },
  request_tranche: { label: 'Ask for an instalment', fields: [{ key: 'stage', label: 'Stage' }, { key: 'amount_inr', label: 'Amount (₹)', type: 'number' }] },
  accept_loan: { label: 'Accept a loan', fields: [{ key: 'lender', label: 'Lender' }, { key: 'amount_inr', label: 'Amount (₹)', type: 'number' }] },
  submit_to_portal: { label: 'Submit to the portal', fields: [] },
  change_case_status: { label: 'Change case status', fields: [{ key: 'new_status', label: 'New status', type: 'select', options: ['intake', 'verified', 'planning', 'finance_review', 'construction', 'completed'] }] },
}

function NewRequest({ caseId, onDone }: { caseId: number; onDone: (link: string | null) => void }) {
  const { api } = useApp()
  const [action, setAction] = useState('pay_any_amount')
  const [vals, setVals] = useState<Record<string, string>>({})
  const [reason, setReason] = useState('')
  const [err, setErr] = useState('')
  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const payload: Record<string, unknown> = {}
    for (const f of FORMS[action].fields) payload[f.key] = f.type === 'number' ? Number(vals[f.key] || 0) : (vals[f.key] ?? (f.options?.[0] || ''))
    try {
      const r = await api.post<Approval & { family_link: string | null }>(`/api/cases/${caseId}/approvals`, { action, payload, reason })
      setErr(''); setVals({}); setReason(''); onDone(r.family_link)
    } catch (ex) { setErr(ex instanceof Error ? ex.message : 'Could not create the request') }
  }
  return (
    <form className="appr-form" onSubmit={submit}>
      <label className="field"><span>Action</span><select value={action} onChange={e => { setAction(e.target.value); setVals({}) }}>{Object.entries(FORMS).map(([k, f]) => <option key={k} value={k}>{f.label}</option>)}</select></label>
      {FORMS[action].fields.map(f => (
        <label className="field" key={f.key}><span>{f.label}</span>
          {f.type === 'select'
            ? <select value={vals[f.key] ?? f.options![0]} onChange={e => setVals({ ...vals, [f.key]: e.target.value })}>{f.options!.map(o => <option key={o}>{o}</option>)}</select>
            : <input type={f.type ?? 'text'} min={f.type === 'number' ? 1 : undefined} required value={vals[f.key] ?? ''} onChange={e => setVals({ ...vals, [f.key]: e.target.value })} />}
        </label>
      ))}
      <label className="field"><span>Why</span><input required minLength={5} value={reason} onChange={e => setReason(e.target.value)} placeholder="Reason the family will be shown" /></label>
      <button className="btn">Send for approval</button>
      {err && <Notice tone="error">{err}</Notice>}
    </form>
  )
}

export default function ApprovalsPanel({ caseId }: { caseId: number }) {
  const { api, canEdit, isAdmin, demo, toast } = useApp()
  const [rows, setRows] = useState<Approval[]>([])
  const [outbox, setOutbox] = useState<OutboxItem[]>([])
  const [adding, setAdding] = useState(false)
  const [preview, setPreview] = useState<string | null>(null)
  const load = useCallback(async () => {
    setRows(await api.get<Approval[]>(`/api/cases/${caseId}/approvals`))
    try { setOutbox(await api.get<OutboxItem[]>(`/api/outbox?case_id=${caseId}`)) } catch { setOutbox([]) }
  }, [api, caseId])
  useEffect(() => { void load() }, [load])

  async function link(a: Approval) {
    const { family_link } = await api.post<{ family_link: string }>(`/api/approvals/${a.id}/link`)
    const token = family_link.split('/approve/')[1]
    if (demo) { setPreview(token); return }
    const url = `${window.location.origin}${family_link}`
    try { await navigator.clipboard.writeText(url); toast('Family link copied. Send it by SMS or WhatsApp.') } catch { window.prompt('Family link', url) }
  }
  async function decide(a: Approval, approve: boolean) {
    try { await api.post(`/api/approvals/${a.id}/decide`, { approve }); await load() } catch (e) { toast(e instanceof Error ? e.message : 'Not allowed') }
  }

  return (
    <section className="panel cf-approvals" aria-labelledby="ap-h">
      <div className="panel-head">
        <h2 id="ap-h"><ShieldCheck size={18} /> Approvals <span className="count-chip">{rows.filter(r => r.status === 'pending').length} waiting</span></h2>
        {canEdit && <button className="link-btn" onClick={() => setAdding(v => !v)}><Plus size={14} /> {adding ? 'Close' : 'New request'}</button>}
      </div>
      <p className="muted">Money, loans, submissions and document sharing need the family's one-time code. Staff cannot approve these for them. Each approved action runs once, through one place in the code.</p>
      {adding && <NewRequest caseId={caseId} onDone={l => { setAdding(false); void load(); if (l && demo) setPreview(l.split('/approve/')[1]) }} />}
      {rows.length === 0 ? <p className="muted">No gated actions yet.</p> : (
        <ul className="appr-list">
          {rows.map(a => (
            <li key={a.id}>
              <div className="appr-top"><b>{a.label_en}</b> <Tag tone={TONE[a.status]}>{a.status}</Tag> <span className="muted tiny">{a.approver === 'family' ? 'Family approves (OTP)' : 'Administrator approves'}</span></div>
              <p lang="kn" className="appr-kn">{a.summary_kn}</p>
              <p className="muted">{a.summary_en}{a.amount_inr != null && <> · <span className="mono">{formatINR(a.amount_inr)}</span></>}</p>
              {a.citations?.length > 0 && <p>{a.citations.map(c => <Stamp key={c}>{c}</Stamp>)}</p>}
              <p className="tiny muted">Requested by {a.requested_by}{a.approver_ref && <> · approved by {a.approver_ref} via {a.method}</>}{a.executed_at && <> · ran once</>}</p>
              {a.status === 'pending' && canEdit && (
                <div className="appr-actions">
                  {a.approver === 'family'
                    ? <button className="btn ghost" onClick={() => void link(a)}>{demo ? <><Smartphone size={15} /> Open the family's phone view</> : <><Link2 size={15} /> Copy family link</>}</button>
                    : isAdmin && <><button className="btn" onClick={() => void decide(a, true)}>Approve</button><button className="btn ghost" onClick={() => void decide(a, false)}>Reject</button></>}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {outbox.length > 0 && (
        <details className="outbox" open={demo}>
          <summary><MessageSquareText size={15} /> Outbox <Tag>Simulated</Tag> <span className="muted tiny">Messages and actions that would leave the system. Nothing is actually sent yet.</span></summary>
          <ul>{outbox.slice(0, 6).map(m => <li key={m.id}><span className="mono tiny">{m.channel.toUpperCase()} → {m.to}</span><span>{m.body}</span></li>)}</ul>
        </details>
      )}
      {preview && (
        <div className="phone-preview" role="dialog" aria-label="Family's phone view">
          <div className="phone-frame"><FamilyApproval token={preview} client={api} demoSms onClose={() => { setPreview(null); void load() }} /></div>
          <aside className="phone-hint"><b>Demo:</b> this is what the family sees on their phone. When they agree, the one-time code arrives by SMS. Here the SMS is simulated, so it pops up at the top of the phone.</aside>
        </div>
      )}
    </section>
  )
}

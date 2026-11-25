import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Plus } from 'lucide-react'
import { CasePicker, Empty, Notice, PageHead, Skeleton, Tag } from '../components/ui'
import { type CaseItem, type FinanceSummary, type Funding, type FundingStatus, type FundingType, type Ladder } from '../lib/api'
import { href, useApp } from '../lib/app-context'
import { useI18n } from '../lib/i18n'
import { dateShort, inr } from '../lib/format'

const statusTone: Record<FundingStatus, 'confirmed' | 'estimate' | 'warn' | 'neutral'> = { confirmed: 'confirmed', received: 'confirmed', proposed: 'estimate', rejected: 'warn' }

export default function Finance({ initialCase }: { initialCase?: number }) {
  const { cases } = useApp()
  const { t } = useI18n()
  const [caseId, setCaseId] = useState<number | null>(initialCase ?? null)
  useEffect(() => { if (!caseId && cases[0]) setCaseId(initialCase ?? cases[0].id) }, [cases, caseId, initialCase])
  const c = cases.find(x => x.id === caseId) ?? null
  return (
    <div className="finance">
      <PageHead eyebrow={c ? `${c.beneficiary_name} · ${c.village}` : undefined} title={t('finance.title')} lead={t('finance.lead')}
        actions={<CasePicker cases={cases} value={caseId} onChange={id => { setCaseId(id); if (id) history.replaceState(null, '', href({ name: 'finance', caseId: id })) }} />} />
      {!c ? <div className="panel"><Empty title={cases.length ? t('common.selectCase') : t('list.empty')} /></div> : <CaseFinance key={c.id} c={c} />}
    </div>
  )
}

function CaseFinance({ c }: { c: CaseItem }) {
  const { api, canEdit, toast, reloadCases } = useApp()
  const { lang, t } = useI18n()
  const [sum, setSum] = useState<FinanceSummary | null>(null)
  const [sources, setSources] = useState<Funding[]>([])
  const [err, setErr] = useState('')
  const load = useCallback(async () => {
    try { const [s, f] = await Promise.all([api.get<FinanceSummary>(`/api/cases/${c.id}/finance-summary`), api.get<Funding[]>(`/api/cases/${c.id}/funding`)]); setSum(s); setSources(f); setErr('') }
    catch (e) { setErr(e instanceof Error ? e.message : 'Could not load finance') }
  }, [api, c.id])
  useEffect(() => { void load() }, [load])

  const [form, setForm] = useState({ source_type: 'subsidy' as FundingType, source_name: '', amount: '', status: 'proposed' as FundingStatus, scheme_code: '', reference_number: '' })
  const [adding, setAdding] = useState(false)
  async function add(e: FormEvent) {
    e.preventDefault()
    try {
      await api.post(`/api/cases/${c.id}/funding`, { ...form, amount: Number(form.amount), scheme_code: form.scheme_code || null, reference_number: form.reference_number || null })
      setForm(f => ({ ...f, source_name: '', amount: '', reference_number: '' })); setAdding(false); await load(); await reloadCases(); toast('Funding source recorded')
    } catch (e2) { toast(e2 instanceof Error ? e2.message : 'Could not add', 'error') }
  }

  if (err) return <Notice tone="error">{err}</Notice>
  if (!sum) return <div className="panel"><Skeleton lines={6} /></div>
  const est = sum.estimated_cost
  const pct = (v: number) => (est ? Math.min(100, (v / est) * 100) : 0)

  return (
    <div className="fin-layout">
      <section className="panel fin-compose" aria-labelledby="comp-h">
        <div className="panel-head"><h2 id="comp-h">Funding composition</h2><span className="muted">Estimate {inr(est)}</span></div>
        {est <= 0 ? <Empty mood="calm" title="No construction cost estimate yet." sub="Edit the case to add one, or use the budget planner in Intelligence." /> : (
          <>
            <div className="compose-bar" role="img" aria-label={`Received ${inr(sum.funding_received)}, confirmed ${inr(sum.funding_confirmed)}, proposed ${inr(sum.funding_proposed)}, gap ${inr(sum.funding_gap)}`}>
              <i className="received" style={{ width: `${pct(sum.funding_received)}%` }}><span>Received</span></i>
              <i className="confirmed" style={{ width: `${pct(sum.funding_confirmed - sum.funding_received)}%` }}><span>Confirmed</span></i>
              <i className="proposed" style={{ width: `${Math.min(pct(sum.funding_proposed), 100 - pct(sum.funding_confirmed))}%` }}><span>Proposed</span></i>
            </div>
            <dl className="fin-rows wide">
              <div><dt><span className="key received" />Received</dt><dd>{inr(sum.funding_received)}</dd></div>
              <div><dt><span className="key confirmed" />Confirmed (incl. received)</dt><dd>{inr(sum.funding_confirmed)}</dd></div>
              <div><dt><span className="key proposed" />Proposed — not counted</dt><dd>{inr(sum.funding_proposed)}</dd></div>
              <div className="ledger-gap"><dt><span className="key gap" />Gap against confirmed</dt><dd>{inr(sum.funding_gap)}</dd></div>
            </dl>
            {sum.warnings.map(w => <p key={w} className="fine warn-line">{w}</p>)}
          </>
        )}
      </section>

      <section className="panel fin-sources" aria-labelledby="src-h">
        <div className="panel-head"><h2 id="src-h">Sources <span className="count-chip">{sources.length}</span></h2>{canEdit && <button className="btn ghost small" onClick={() => setAdding(a => !a)}><Plus size={15} />Add source</button>}</div>
        {adding && (
          <form className="form inline-form" onSubmit={add}>
            <div className="grid-3">
              <label className="field"><span>Type</span><select value={form.source_type} onChange={e => setForm({ ...form, source_type: e.target.value as FundingType })}>{['subsidy', 'loan', 'savings', 'wages', 'grant', 'other'].map(x => <option key={x}>{x}</option>)}</select></label>
              <label className="field span-2"><span>Name</span><input required minLength={2} value={form.source_name} onChange={e => setForm({ ...form, source_name: e.target.value })} placeholder="e.g. PMAY-G unit assistance" /></label>
              <label className="field"><span>Amount (₹)</span><input required type="number" min="1" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} /></label>
              <label className="field"><span>Status</span><select value={form.status} onChange={e => setForm({ ...form, status: e.target.value as FundingStatus })}><option value="proposed">proposed</option><option value="confirmed">confirmed</option><option value="received">received</option><option value="rejected">rejected</option></select></label>
              <label className="field"><span>Scheme code</span><input value={form.scheme_code} onChange={e => setForm({ ...form, scheme_code: e.target.value })} placeholder="PMAY-G" /></label>
              <label className="field span-2"><span>Sanction / reference number</span><input value={form.reference_number} onChange={e => setForm({ ...form, reference_number: e.target.value })} /><small>Confirmed sources with the same scheme and reference are rejected as duplicates.</small></label>
            </div>
            <div className="form-actions"><button type="button" className="btn ghost" onClick={() => setAdding(false)}>Cancel</button><button className="btn primary">Record source</button></div>
          </form>
        )}
        {sources.length === 0 ? <p className="muted">No detailed sources yet.{Number(c.sanctioned_amount) > 0 && ` The case's sanctioned amount (${inr(c.sanctioned_amount)}) is used until sources are recorded.`}</p> : (
          <ul className="src-list">
            {sources.map(s => (
              <li key={s.id}>
                <span><b>{s.source_name}</b><small>{s.source_type}{s.scheme_code ? ` · ${s.scheme_code}` : ''}{s.reference_number ? ` · ref ${s.reference_number}` : ''} · {s.created_by}, {dateShort(s.created_at, lang)}</small></span>
                <span className="num">{inr(s.amount)}</span>
                <Tag tone={statusTone[s.status]}>{t(`funding.${s.status}` as never)}</Tag>
              </li>
            ))}
          </ul>
        )}
      </section>

      <MoneyLadder c={c} estimate={est} />
      <Affordability />
    </div>
  )
}

/** The money ladder: the cash a family must find before each instalment arrives. */
function MoneyLadder({ c, estimate }: { c: CaseItem; estimate: number }) {
  const { api } = useApp()
  const { t } = useI18n()
  const [cost, setCost] = useState(estimate || 300000)
  const [savings, setSavings] = useState(20000)
  const [loan, setLoan] = useState(0)
  const [ladder, setLadder] = useState<Ladder | null>(null)
  const [err, setErr] = useState('')
  useEffect(() => {
    if (!(cost > 0)) return
    const id = setTimeout(() => {
      api.post<Ladder>('/api/engine/ladder', { total_cost: cost, own_savings: savings, scheme_loan: loan }).then(l => { setLadder(l); setErr('') }).catch(e => { setLadder(null); setErr(e.message) })
    }, 250)
    return () => clearTimeout(id)
  }, [api, cost, savings, loan])
  const max = ladder ? Math.max(...ladder.rungs.map(r => r.cum_cost), 1) : 1

  return (
    <section className="panel fin-ladder" aria-labelledby="lad-h">
      <div className="panel-head"><h2 id="lad-h">Money ladder · {c.beneficiary_name}</h2><Tag tone="estimate">Indicative · PMAY-G Karnataka rule pack</Tag></div>
      <div className="grid-3 compact">
        <label className="field"><span>Total cost (₹)</span><input type="number" min="1" value={cost} onChange={e => setCost(Number(e.target.value))} /></label>
        <label className="field"><span>Own savings (₹)</span><input type="number" min="0" value={savings} onChange={e => setSavings(Number(e.target.value))} /></label>
        <label className="field"><span>PMAY-G scheme loan (₹)</span><input type="number" min="0" max="70000" value={loan} onChange={e => setLoan(Number(e.target.value))} /><small>Up to ₹70,000 at a 3-point reduced rate. Count it in affordability below.</small></label>
      </div>
      {err && <Notice tone="error">{err}</Notice>}
      {ladder && (
        <>
          <div className="ladder-summary">
            <div><span>{t('ladder.peakCash')}</span><b className="warn-text">{inr(Math.max(0, ...ladder.rungs.map(r => r.cash_gap_before_instalment)))}</b></div>
            <div><span>{t('ladder.timingGap')}</span><b>{inr(ladder.peak_timing_gap)}</b></div>
            <div><span>{t('ladder.fundingGap')}</span><b>{inr(ladder.funding_gap)}</b></div>
          </div>
          <ol className="ladder">
            {[...ladder.rungs].reverse().map(r => (
              <li key={r.stage}>
                <span className="lad-label">{r.label}</span>
                <span className="lad-bars" aria-hidden>
                  <i className="lad-cost" style={{ width: `${(r.cum_cost / max) * 100}%` }} />
                  <i className="lad-in" style={{ width: `${(Math.min(r.cum_cost, r.cum_cost - r.cash_gap_before_instalment) / max) * 100}%` }} />
                </span>
                <span className="lad-gap"><b>{inr(r.cash_gap_before_instalment)}</b><small>to find before the {inr(r.instalment_after)} instalment</small></span>
              </li>
            ))}
          </ol>
          <p className="fine">{ladder.disclaimer} {ladder.assumptions.slice(0, 1).join(' ')}</p>
        </>
      )}
    </section>
  )
}

/** Repayment cap: all loans together stay within 30% of a cautious monthly income. */
function Affordability() {
  const { api } = useApp()
  const [income, setIncome] = useState('9000, 12000, 7000, 11000, 6000, 10000')
  const [schemeLoan, setSchemeLoan] = useState(70000)
  const [requested, setRequested] = useState(80000)
  const [res, setRes] = useState<{ income: number; cap_amount: number; existing_emi: number; headroom: number; max_new_loan: number; indicative_loan_within_cap: number; no_loan_path: boolean; notes: string[] } | null>(null)
  const [err, setErr] = useState('')
  async function run(e?: FormEvent) {
    e?.preventDefault()
    const months = income.split(/[,\s]+/).map(Number).filter(n => n >= 0 && !Number.isNaN(n))
    try {
      setRes(await api.post('/api/engine/affordability', {
        monthly_income: months, requested, rate_pa: 0.11, months: 60,
        existing_loans: schemeLoan > 0 ? [{ name: 'PMAY-G scheme loan', principal: schemeLoan, rate_pa: 0.08, months: 120 }] : [],
      })); setErr('')
    } catch (e2) { setErr(e2 instanceof Error ? e2.message : 'Check the values') }
  }
  return (
    <section className="panel fin-afford" aria-labelledby="aff-h">
      <div className="panel-head"><h2 id="aff-h">Repayment check</h2><Tag tone="estimate">Not a credit decision</Tag></div>
      <form className="form" onSubmit={run}>
        <label className="field"><span>Monthly income, last months (₹)</span><input value={income} onChange={e => setIncome(e.target.value)} /><small>Irregular income is averaged over the leaner months.</small></label>
        <div className="grid-2">
          <label className="field"><span>Existing PMAY-G loan (₹)</span><input type="number" min="0" value={schemeLoan} onChange={e => setSchemeLoan(Number(e.target.value))} /></label>
          <label className="field"><span>Gap loan requested (₹)</span><input type="number" min="1" value={requested} onChange={e => setRequested(Number(e.target.value))} /></label>
        </div>
        <button className="btn ghost small">Check against the 30% cap</button>
        <p className="fine">Assumes the gap loan at 11% over 5 years and the scheme loan at 8% over 10 years.</p>
      </form>
      {err && <Notice tone="error">{err}</Notice>}
      {res && (
        <dl className="fin-rows">
          <div><dt>Cautious monthly income</dt><dd>{inr(res.income)}</dd></div>
          <div><dt>30% repayment cap</dt><dd>{inr(res.cap_amount)}</dd></div>
          <div><dt>Already committed (incl. scheme loan)</dt><dd>{inr(res.existing_emi)}</dd></div>
          <div className="ledger-gap"><dt>Gap loan within the cap</dt><dd>{inr(res.indicative_loan_within_cap)}</dd></div>
          {res.no_loan_path && <p className="fine warn-line">No loan fits within the cap. Look at grants, staged construction or a smaller first phase.</p>}
          {res.notes.map(n => <p key={n} className="fine">{n}</p>)}
        </dl>
      )}
    </section>
  )
}

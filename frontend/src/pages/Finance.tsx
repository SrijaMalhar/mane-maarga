import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Plus } from 'lucide-react'
import { CasePicker, Empty, Notice, PageHead, Skeleton, Tag } from '../components/ui'
import { Footnote, Stamp } from '../components/ledger'
import Answer from '../components/Answer'
import { type CaseItem, type FinanceSummary, type Funding, type FundingStatus, type FundingType, type Ladder } from '../lib/api'
import { href, useApp } from '../lib/app-context'
import { useI18n } from '../lib/i18n'
import { dateShort, inr } from '../lib/format'

const statusTone: Record<FundingStatus, 'confirmed' | 'estimate' | 'warn' | 'neutral'> = { confirmed: 'confirmed', received: 'confirmed', proposed: 'estimate', rejected: 'warn' }

export default function Finance({ initialCase }: { initialCase?: number }) {
  const { cases } = useApp()
  const { t } = useI18n()
  const [caseId, setCaseId] = useState<number | null>(initialCase ?? null)
  useEffect(() => { if (!caseId && cases[0]) setCaseId(initialCase ?? (cases.find(x => Number(x.estimated_cost) > 0 && x.status !== 'completed') ?? cases[0]).id) }, [cases, caseId, initialCase])
  const c = cases.find(x => x.id === caseId) ?? null
  return (
    <div className="finance">
      <PageHead eyebrow={c ? `${c.beneficiary_name}, ${c.village}` : undefined} title={t('finance.title')}
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
  const counted = (types: FundingType[]) => sources.filter(x => types.includes(x.source_type) && (x.status === 'confirmed' || x.status === 'received')).reduce((a, x) => a + Number(x.amount), 0)

  return (
    <>
      <LadderAnswer c={c} estimate={est} savings={counted(['savings', 'wages'])} loan={counted(['loan'])} confirmed={sum.funding_confirmed} />


      <section className="fin-sources-wide" aria-labelledby="src-h">
        <div className="fin-src-head">
          <h2 id="src-h" className="ov-h">Where the money comes from</h2>
          {canEdit && <button className="btn ghost small" onClick={() => setAdding(a => !a)}><Plus size={15} />Add source</button>}
        </div>
        {est > 0 && (
          <div className="fin-compose-row">
            <div className="compose-bar slim" role="img" aria-label={`Received ${inr(sum.funding_received)}, confirmed ${inr(sum.funding_confirmed)}, proposed ${inr(sum.funding_proposed)}, gap ${inr(sum.funding_gap)}`}>
              <i className="received" style={{ width: `${pct(sum.funding_received)}%` }} />
              <i className="confirmed" style={{ width: `${pct(sum.funding_confirmed - sum.funding_received)}%` }} />
              <i className="proposed" style={{ width: `${Math.min(pct(sum.funding_proposed), 100 - pct(sum.funding_confirmed))}%` }} />
            </div>
            <dl className="fin-keys">
              <div><dt><span className="key received" />Received</dt><dd>{inr(sum.funding_received)}</dd></div>
              <div><dt><span className="key confirmed" />Confirmed</dt><dd>{inr(sum.funding_confirmed)}</dd></div>
              <div><dt><span className="key proposed" />Proposed, not counted</dt><dd>{inr(sum.funding_proposed)}</dd></div>
              <div className="ledger-gap"><dt><span className="key gap" />Gap</dt><dd>{inr(sum.funding_gap)}</dd></div>
            </dl>
          </div>
        )}
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
        {sources.length === 0 ? <p className="muted">No sources recorded yet.{Number(c.sanctioned_amount) > 0 && ` The sanctioned ${inr(c.sanctioned_amount)} is used until they are.`}</p> : (
          <table className="src-table">
            <thead><tr><th>Source</th><th>Type</th><th>Reference</th><th>Status</th><th className="m">Amount</th></tr></thead>
            <tbody>
              {sources.map(s => (
                <tr key={s.id} className={s.status}>
                  <td><b>{s.source_name}</b><small>{s.created_by}, {dateShort(s.created_at, lang)}</small></td>
                  <td>{s.source_type}</td>
                  <td>{[s.scheme_code, s.reference_number].filter(Boolean).join(' · ') || '—'}</td>
                  <td><Tag tone={statusTone[s.status]}>{t(`funding.${s.status}` as never)}</Tag></td>
                  <td className="m">{inr(s.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {sum.warnings.map(w => <p key={w} className="fine warn-line">{w}</p>)}
      </section>

      <details className="fin-more">
        <summary>Can the family repay a loan for the gap? <span className="muted">Check against the 30% repayment cap</span></summary>
        <Affordability />
      </details>
    </>
  )
}

/** The answer and the money ladder: the cash a family must find before each instalment arrives. */
function LadderAnswer({ c, estimate, savings, loan, confirmed }: { c: CaseItem; estimate: number; savings: number; loan: number; confirmed: number }) {
  const { api, openCaseForm, canEdit } = useApp()
  const [cost, setCost] = useState(estimate || 300000)
  const [own, setOwn] = useState(savings)
  const [schemeLoan, setSchemeLoan] = useState(Math.min(loan, 70000))
  const [ladder, setLadder] = useState<Ladder | null>(null)
  const [err, setErr] = useState('')
  useEffect(() => {
    if (!(cost > 0)) return
    const id = setTimeout(() => {
      api.post<Ladder>('/api/engine/ladder', { total_cost: cost, own_savings: own, scheme_loan: schemeLoan }).then(l => { setLadder(l); setErr('') }).catch(e => { setLadder(null); setErr(e.message) })
    }, 250)
    return () => clearTimeout(id)
  }, [api, cost, own, schemeLoan])
  const first = c.beneficiary_name.replace(' (sample)', '').split(' ')[0]
  const peakRung = ladder ? ladder.rungs.reduce((a, r) => (r.cash_gap_before_instalment > a.cash_gap_before_instalment ? r : a), ladder.rungs[0]) : null
  const max = ladder ? Math.max(...ladder.rungs.map(r => r.cum_cost), 1) : 1

  return (
    <>
      {estimate <= 0 ? (
        <Answer kn="ಖರ್ಚಿನ ಅಂದಾಜು ಇನ್ನೂ ಇಲ್ಲ" action={canEdit && <button className="btn primary" onClick={() => openCaseForm(c)}>Add the estimate</button>}>
          {first} has no construction cost estimate yet, so the ladder below uses a cost you type in.
        </Answer>
      ) : ladder && peakRung && (
        <Answer kn={`${first} ಅವರಿಗೆ ಕಂತು ಬರುವ ಮೊದಲು ಹಣ ಬೇಕು`}
          figs={[
            { label: 'Only late: comes back as instalments', value: inr(ladder.peak_timing_gap) },
            { label: 'Never covered by the scheme', value: inr(ladder.funding_gap), tone: ladder.funding_gap > 0 ? 'warn' : 'good' },
            { label: `Confirmed so far, of ${inr(estimate)}`, value: inr(confirmed), tone: 'good' },
          ]}>
          {first} needs <span className="num">{inr(peakRung.cash_gap_before_instalment)}</span> in hand before the {peakRung.label.toLowerCase()} instalment arrives.
        </Answer>
      )}

      <section className="fin-ladder-wide" aria-labelledby="lad-h">
        <div className="fin-ladder-head">
          <h2 id="lad-h" className="ov-h">Money ladder <Tag tone="estimate">Indicative</Tag></h2>
          <div className="fin-inputs">
            <label><span>Total cost</span><input type="number" min="1" value={cost} onChange={e => setCost(Number(e.target.value))} /></label>
            <label><span>Own savings</span><input type="number" min="0" value={own} onChange={e => setOwn(Number(e.target.value))} /></label>
            <label><span>Scheme loan (max ₹70,000)</span><input type="number" min="0" max="70000" value={schemeLoan} onChange={e => setSchemeLoan(Number(e.target.value))} /></label>
          </div>
        </div>
        {err && <Notice tone="error">{err}</Notice>}
        {ladder && (
          <>
            <ol className="ladder">
              {[...ladder.rungs].reverse().map(r => (
                <li key={r.stage} className={r === peakRung ? 'peak' : undefined}>
                  <span className="lad-label">{r.label}</span>
                  <span className="lad-bars" aria-hidden>
                    <i className="lad-cost" style={{ width: `${(r.cum_cost / max) * 100}%` }} />
                    <i className="lad-in" style={{ width: `${(Math.min(r.cum_cost, r.cum_cost - r.cash_gap_before_instalment) / max) * 100}%` }} />
                  </span>
                  <span className="lad-gap"><b>{inr(r.cash_gap_before_instalment)}</b><small>before the {inr(r.instalment_after)} instalment</small></span>
                </li>
              ))}
            </ol>
            <p className="lad-key"><span><i className="cost" /> Spent by the end of the stage</span><span><i className="in" /> Money in hand by then</span></p>
            <div className="fin-cite">
              {ladder.citations && ladder.citations.length > 0 && <span>Amounts from {ladder.citations.map(x => <Stamp key={x}>{x}</Stamp>)}</span>}
              {ladder.stages_verified === false && <Footnote n={1}>Stage split is illustrative until Karnataka's official instalment order is in the rule pack.</Footnote>}
            </div>
          </>
        )}
      </section>
    </>
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
    <section className="fin-afford" aria-label="Repayment check">
      <p className="muted">Indicative, not a credit decision. Irregular income is averaged over the leaner months.</p>
      <form className="form" onSubmit={run}>
        <label className="field"><span>Monthly income, last months (₹)</span><input value={income} onChange={e => setIncome(e.target.value)} /></label>
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

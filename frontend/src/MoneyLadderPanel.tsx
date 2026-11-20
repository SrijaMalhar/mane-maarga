import { useEffect, useState } from 'react'

type CaseItem = { id: number; beneficiary_name: string; village: string; estimated_cost?: number }
type Props = { cases: CaseItem[]; apiFetch: (path: string, options?: RequestInit) => Promise<Response> }
type Rung = { stage: string; label: string; cost: number; instalment_after: number; cash_gap_before_instalment: number; timing_gap: number }
type Ladder = { subsidy: number; funding_gap: number; peak_timing_gap: number; rungs: Rung[]; assumptions: string[]; disclaimer: string }

const inr = (n: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n)

export default function MoneyLadderPanel({ cases, apiFetch }: Props) {
  const [caseId, setCaseId] = useState('')
  const [cost, setCost] = useState(500000)
  const [savings, setSavings] = useState(20000)
  const [loan, setLoan] = useState(70000)
  const [ladder, setLadder] = useState<Ladder | null>(null)
  const [error, setError] = useState('')

  function pickCase(id: string) {
    setCaseId(id)
    const c = cases.find(x => String(x.id) === id)
    if (c?.estimated_cost && c.estimated_cost > 0) setCost(Number(c.estimated_cost))
  }

  useEffect(() => {
    if (!(cost > 0)) { setLadder(null); return }
    const timer = setTimeout(async () => {
      try {
        const r = await apiFetch('/api/engine/ladder', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ total_cost: cost, own_savings: savings, scheme_loan: loan }),
        })
        const d = await r.json()
        if (!r.ok) throw new Error(typeof d.detail === 'string' ? d.detail : 'Check the amounts entered')
        setLadder(d); setError('')
      } catch (e) {
        setLadder(null); setError(e instanceof Error ? e.message : 'Money ladder failed')
      }
    }, 250)
    return () => clearTimeout(timer)
  }, [cost, savings, loan])

  const max = ladder ? Math.max(...ladder.rungs.map(r => r.cash_gap_before_instalment), 1) : 1

  return (
    <div className="intelligence-content">
      <div className="budget-form">
        <label>Case (optional, fills the house cost)
          <select value={caseId} onChange={e => pickCase(e.target.value)}>
            <option value="">Standalone calculation</option>
            {cases.map(c => <option value={c.id} key={c.id}>#{c.id} · {c.beneficiary_name} — {c.village}</option>)}
          </select>
        </label>
        <label>House cost (₹)<input type="number" min="1" step="10000" value={cost} onChange={e => setCost(Number(e.target.value))} /></label>
        <label>Family savings (₹)<input type="number" min="0" step="5000" value={savings} onChange={e => setSavings(Number(e.target.value))} /></label>
        <label>PMAY-G scheme loan (₹, max 70,000)<input type="number" min="0" step="5000" value={loan} onChange={e => setLoan(Number(e.target.value))} /></label>
      </div>

      {error && <div className="alert error">{error}</div>}

      {ladder && (
        <div className="budget-result">
          <h3>Cash gap before each instalment</h3>
          <div className="budget-breakdown">
            <div><span>Subsidy</span><b>{inr(ladder.subsidy)}</b></div>
            <div><span>Funding gap (needs a loan)</span><b>{inr(ladder.funding_gap)}</b></div>
            <div><span>Peak timing gap (bridge only)</span><b>{inr(ladder.peak_timing_gap)}</b></div>
          </div>
          <div className="table-scroll">
            <table className="ladder-table">
              <thead><tr><th>Stage</th><th>Stage cost</th><th>Instalment after</th><th>Cash gap before it lands</th><th>Of which timing</th></tr></thead>
              <tbody>
                {ladder.rungs.map(r => (
                  <tr key={r.stage}>
                    <td>{r.label}</td><td>{inr(r.cost)}</td><td>{inr(r.instalment_after)}</td>
                    <td><div className="ladder-bar" style={{ width: `${(r.cash_gap_before_instalment / max) * 100}%` }} />{inr(r.cash_gap_before_instalment)}</td>
                    <td>{inr(r.timing_gap)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {ladder.assumptions.map(a => <p className="disclaimer" key={a}>⚠ {a}</p>)}
          <p className="disclaimer">{ladder.disclaimer}</p>
        </div>
      )}
    </div>
  )
}

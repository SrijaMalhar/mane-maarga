import { useState } from 'react'
import { Play } from 'lucide-react'
import { Notice } from './ui'
import { Stamp } from './ledger'
import type { AgentRun, AgentStep } from '../lib/api'
import { useApp } from '../lib/app-context'
import { useI18n } from '../lib/i18n'

const STATUS: Record<AgentRun['status'], string> = { done: 'Answered', asked: 'Needs your input', blocked: 'Withheld by the citation guard', failed: 'Model unavailable', step_limit: 'Stopped at the step limit', running: 'Running' }

function line(s: AgentStep) {
  if (s.tool) return <><code>{s.tool}</code>{s.error ? <span className="err"> → {s.error}</span> : <span className="muted"> → ok</span>}</>
  if (s.phase === 'CHECK') return s.error ? <span className="err">{String((s.result.problems as string[] | undefined)?.join('; ') ?? s.error)}</span> : <span>Every figure and clause traced</span>
  return <span>{s.thought_summary || (s.phase === 'ASK' ? 'Asks the operator (below)' : s.phase === 'DONE' ? 'Answer (below)' : '')}</span>
}

/** Runs the case agent and shows its trace: each step, the tool it called, and the guarded answer. */
export default function AgentRunPanel({ caseId }: { caseId: number }) {
  const { api, canEdit } = useApp()
  const { lang } = useI18n()
  const [run, setRun] = useState<AgentRun | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  async function start() {
    setBusy(true)
    try { setRun(await api.post<AgentRun>(`/api/cases/${caseId}/agent/run`, { language: lang })); setErr('') } catch (e) { setErr(e instanceof Error ? e.message : 'Run failed') } finally { setBusy(false) }
  }
  return (
    <section className="panel pad" aria-labelledby="ar-h">
      <div className="panel-head">
        <div><p className="eyebrow">Agent run</p><h2 id="ar-h">Plan, act, check</h2></div>
        {canEdit && <button className="btn" onClick={start} disabled={busy}><Play size={15} />{busy ? 'Running…' : run ? 'Run again' : 'Run the agent'}</button>}
      </div>
      <p className="muted">The agent picks tools; the server runs them. Every rupee in its answer must come from a tool result or a cited clause, or the answer is withheld. It can only request approval, never grant it.</p>
      {err && <Notice tone="error">{err}</Notice>}
      {run && <>
        <ol className="trace">
          {run.steps.map(s => <li key={`${s.idx}-${s.phase}`}><span className="idx">{s.idx}</span><span className={`ph ph-${s.phase}`}>{s.phase}</span><span>{line(s)}</span></li>)}
        </ol>
        <div className={`run-answer${run.status === 'blocked' ? ' blocked' : ''}`}>
          <p className="eyebrow">{STATUS[run.status]} · {run.provider}</p>
          <p lang="en">{run.message_en}</p>
          <p lang="kn">{run.message_kn}</p>
          {run.citations.length > 0 && <p>{run.citations.map(c => <Stamp key={c}>{c}</Stamp>)}</p>}
        </div>
      </>}
    </section>
  )
}

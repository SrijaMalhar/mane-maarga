import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Download, Link2, Link2Off, Pause, Play, RotateCcw, ScanSearch, StepBack, StepForward } from 'lucide-react'
import Answer from '../components/Answer'
import { Stamp } from '../components/ledger'
import { CasePicker, Empty, Notice, PageHead, Skeleton } from '../components/ui'
import type { AgentRun, AgentStep } from '../lib/api'
import { useApp } from '../lib/app-context'
import { human } from '../lib/format'

type Verification = { state: 'intact' | 'broken' | 'unsealed'; checked: number; of: number; broken_at: number | 'outcome' | null; seal: string | null }
type RecStep = AgentStep & { seal?: string | null; side_effect?: 'none' | 'write' | 'gated' | null }
type Recording = AgentRun & { steps: RecStep[]; seal: string | null; created_at?: string | null; rule_pack: { id: string; effective_from?: string }; verification: Verification }
type ReplayRow = { idx: number; phase: string; tool: string | null; outcome: 'same' | 'differs' | 'not_rerun' | 'no_tool'; why?: string; changed?: string[]; error_then?: string | null; error_now?: string | null }
type Replay = { run_id: number; summary: { reran: number; same: number; differs: number }; steps: ReplayRow[] }

const short = (h?: string | null) => (h ? h.slice(0, 8) : '—')
const PHASE_KN: Record<string, string> = { PLAN: 'ಯೋಜನೆ', ACT: 'ಕ್ರಿಯೆ', CHECK: 'ಪರಿಶೀಲನೆ', RECOVER: 'ಸರಿಪಡಿಸು', ASK: 'ಕೇಳು', DONE: 'ಮುಗಿಯಿತು' }
const EFFECT: Record<string, string> = { none: 'Reads only', write: 'Changes data', gated: 'Needs approval' }

function Value({ v }: { v: unknown }) {
  if (v === null || v === undefined || v === '') return <span className="muted">—</span>
  if (typeof v === 'number') return <>{v.toLocaleString('en-IN')}</>
  if (typeof v === 'boolean') return <>{v ? 'yes' : 'no'}</>
  if (typeof v === 'string') return <>{v}</>
  return <>{JSON.stringify(v)}</>
}

function Pairs({ data, mark = [] }: { data: Record<string, unknown>; mark?: string[] }) {
  const rows = Object.entries(data).filter(([k]) => !k.startsWith('_'))
  if (!rows.length) return <p className="muted">Nothing</p>
  return <dl className="fr-pairs">{rows.map(([k, v]) => <div key={k} className={mark.includes(k) ? 'changed' : undefined}><dt>{human(k)}</dt><dd><Value v={v} /></dd></div>)}</dl>
}

/** The Flight Recorder: replay an agent run step by step, prove it was not edited, and run its reads again. */
export default function FlightRecorder({ runId, initialCase }: { runId?: number; initialCase?: number }) {
  const { api, cases, demo, go } = useApp()
  const [caseId, setCaseId] = useState<number | null>(initialCase ?? null)
  const [runs, setRuns] = useState<AgentRun[] | null>(null)
  const [rec, setRec] = useState<Recording | null>(null)
  const [at, setAt] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [rep, setRep] = useState<Replay | null>(null)
  const [busy, setBusy] = useState('')
  const [err, setErr] = useState('')

  const load = useCallback(async (id: number) => {
    try { const r = await api.get<Recording>(`/api/agent/runs/${id}/recording`); setRec(r); setCaseId(r.case_id); setErr('') } catch (e) { setErr(e instanceof Error ? e.message : 'Could not open the recording') }
  }, [api])

  useEffect(() => { if (runId) { setRep(null); setAt(0); void load(runId) } }, [runId, load])
  useEffect(() => { if (!caseId && !runId && cases[0]) setCaseId(cases[0].id) }, [cases, caseId, runId])
  useEffect(() => {
    if (!caseId) return
    api.get<AgentRun[]>(`/api/cases/${caseId}/agent/runs`).then(r => { setRuns(r); if (!runId && r[0]) go({ name: 'recorder', runId: r[0].id }) }).catch(() => setRuns([]))
  }, [api, caseId, runId, go])

  const steps = rec?.steps ?? []
  const cur = steps[at]
  useEffect(() => {
    if (!playing) return
    if (at >= steps.length - 1) { setPlaying(false); return }
    const id = setTimeout(() => setAt(a => a + 1), 900)
    return () => clearTimeout(id)
  }, [playing, at, steps.length])
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input, select, textarea')) return
      if (e.key === 'ArrowRight') setAt(a => Math.min(steps.length - 1, a + 1))
      if (e.key === 'ArrowLeft') setAt(a => Math.max(0, a - 1))
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [steps.length])

  const tape = useRef<HTMLOListElement>(null)
  useEffect(() => {
    // Keep the current step in view on narrow screens, scrolling only the tape.
    const box = tape.current; const el = box?.children[at] as HTMLElement | undefined
    if (box && el && (el.offsetLeft < box.scrollLeft || el.offsetLeft + el.offsetWidth > box.scrollLeft + box.clientWidth)) box.scrollTo({ left: el.offsetLeft - 24 })
  }, [at])

  const repBy = useMemo(() => new Map((rep?.steps ?? []).map(r => [r.idx, r])), [rep])
  const v = rec?.verification
  const brokenIdx = v?.state === 'broken' ? v.broken_at : null
  const tools = steps.filter(s => s.tool).length
  const totalMs = steps.reduce((a, s) => a + Number(s.ms || 0), 0)

  async function replay() {
    if (!rec) return
    setBusy('replay')
    try { setRep(await api.post<Replay>(`/api/agent/runs/${rec.id}/replay`, {})); setErr('') } catch (e) { setErr(e instanceof Error ? e.message : 'Replay failed') } finally { setBusy('') }
  }
  async function tamper() {
    if (!rec) return
    setBusy('tamper')
    try { await api.post(`/api/agent/runs/${rec.id}/demo-tamper`, {}); await load(rec.id); setRep(null) } catch (e) { setErr(e instanceof Error ? e.message : 'Could not change the record') } finally { setBusy('') }
  }
  function exportJson() {
    if (!rec) return
    const url = URL.createObjectURL(new Blob([JSON.stringify({ ...rec, replay: rep ?? undefined }, null, 2)], { type: 'application/json' }))
    const a = document.createElement('a'); a.href = url; a.download = `mane-maarga-run-${rec.id}.json`; a.click(); URL.revokeObjectURL(url)
  }

  const head = <PageHead eyebrow={rec ? `Run #${rec.id} · ${cases.find(c => c.id === rec.case_id)?.beneficiary_name ?? `case #${rec.case_id}`}` : 'Agent runs'} title="Flight recorder" actions={<CasePicker cases={cases} value={caseId} onChange={id => { setCaseId(id); setRec(null); setRuns(null); go({ name: 'recorder', caseId: id ?? undefined }) }} />} />
  if (err && !rec) return <>{head}<Notice tone="error">{err}</Notice></>
  if (!rec) {
    if (runs && runs.length === 0) return <>{head}<div className="panel"><Empty title="No agent runs on this case yet" sub="Run the agent from Decision support. Every run is recorded and sealed here." /></div></>
    return <>{head}<div className="panel"><Skeleton lines={6} /></div></>
  }

  return (
    <div className="fr">
      {head}
      {v?.state === 'intact' && (
        <Answer kn="ದಾಖಲೆ ಮುದ್ರೆ ಸರಿಯಾಗಿದೆ" figs={[{ label: 'Steps sealed', value: `${v.checked} of ${v.of}`, tone: 'good' }, { label: 'Tools called', value: String(tools) }, { label: 'Seal', value: short(v.seal), note: 'sha-256 chain' }]}>
          Nothing in this run has changed since it was recorded. <span className="num good">{v.of}</span> steps, each sealed to the one before.
        </Answer>
      )}
      {v?.state === 'broken' && (
        <Answer kn="ದಾಖಲೆ ಬದಲಾಗಿದೆ" figs={[{ label: 'Steps that still match', value: `${v.checked} of ${v.of}`, tone: 'warn' }, { label: 'First changed', value: v.broken_at === 'outcome' ? 'Outcome' : `Step ${v.broken_at}`, tone: 'warn' }, { label: 'Seal on record', value: short(v.seal) }]}>
          This record was changed after it was sealed, at <span className="num">{v.broken_at === 'outcome' ? 'the outcome' : `step ${v.broken_at}`}</span>. Treat it as untrusted.
        </Answer>
      )}
      {v?.state === 'unsealed' && <Answer kn="ಮುದ್ರೆ ಇಲ್ಲ">This run was recorded before sealing began, so it cannot be checked for edits.</Answer>}

      <section className="fr-tape-wrap" aria-label="Run timeline">
        <div className="fr-controls">
          <button className="btn ghost small" onClick={() => setAt(a => Math.max(0, a - 1))} aria-label="Previous step"><StepBack size={16} /></button>
          <button className="btn small" onClick={() => { if (at >= steps.length - 1) setAt(0); setPlaying(p => !p) }}>{playing ? <><Pause size={15} />Pause</> : <><Play size={15} />Play the run</>}</button>
          <button className="btn ghost small" onClick={() => setAt(a => Math.min(steps.length - 1, a + 1))} aria-label="Next step"><StepForward size={16} /></button>
          <span className="fr-time">{steps.length} steps · {totalMs.toFixed(0)} ms of tool time · {rec.provider}</span>
        </div>
        <ol className="fr-tape" ref={tape}>
          {steps.map((s, i) => {
            const r = repBy.get(s.idx)
            const broken = brokenIdx === s.idx
            const after = typeof brokenIdx === 'number' && s.idx > brokenIdx
            return (
              <li key={`${s.idx}-${s.phase}`} className={[`ph-${s.phase}`, i === at ? 'on' : '', i < at ? 'past' : '', broken ? 'broken' : '', after ? 'after' : ''].join(' ')}>
                {i > 0 && <span className={`fr-link${broken ? ' cut' : ''}`} aria-hidden>{broken ? <Link2Off size={14} /> : <Link2 size={14} />}</span>}
                <button onClick={() => { setAt(i); setPlaying(false) }} aria-current={i === at} aria-label={`Step ${s.idx}, ${s.phase}${s.tool ? `, ${s.tool}` : ''}`}>
                  <span className="fr-ph">{s.phase}<i lang="kn">{PHASE_KN[s.phase]}</i></span>
                  <span className="fr-tool">{s.tool ? human(s.tool) : s.phase === 'CHECK' ? 'Citation guard' : s.phase === 'PLAN' ? 'Plan' : 'Message'}</span>
                  {r && r.outcome !== 'no_tool' && <span className={`fr-rep ${r.outcome}`}>{r.outcome === 'same' ? 'Same today' : r.outcome === 'differs' ? 'Differs today' : 'Not re-run'}</span>}
                  {s.error && <span className="fr-err">{human(s.error)}</span>}
                </button>
              </li>
            )
          })}
        </ol>
        <div className="fr-scrub" aria-hidden><i style={{ width: `${steps.length > 1 ? (at / (steps.length - 1)) * 100 : 100}%` }} /></div>
      </section>

      {cur && (
        <section className="fr-step" aria-live="polite" aria-label={`Step ${cur.idx}`}>
          <div className="fr-col">
            <h2 className="ov-h">Step {cur.idx} · what the agent did</h2>
            {cur.thought_summary && <p className="fr-thought">{cur.thought_summary}</p>}
            {cur.tool ? (
              <>
                <p className="fr-call"><code>{cur.tool}</code>{cur.side_effect && <span className={`fr-fx ${cur.side_effect}`}>{EFFECT[cur.side_effect]}</span>}</p>
                <Pairs data={cur.args} />
              </>
            ) : cur.phase === 'CHECK' ? <p>Before the answer reaches a person, every rupee and rule in it must trace to a tool result or a cited clause.</p> : null}
            {(cur.message_en || cur.message_kn) && <div className="fr-msg"><p>{cur.message_en}</p>{cur.message_kn && <p lang="kn">{cur.message_kn}</p>}{cur.citations.length > 0 && <p>{cur.citations.map(c => <Stamp key={c}>{c}</Stamp>)}</p>}</div>}
          </div>
          <div className="fr-col">
            <h2 className="ov-h">What it got back</h2>
            {cur.error ? <p className="fr-err-line">{human(cur.error)}</p> : cur.phase === 'CHECK' ? <p className={(cur.result as { ok?: boolean }).ok ? 'fr-ok' : 'fr-err-line'}>{(cur.result as { ok?: boolean }).ok ? 'Every figure and clause traced' : ((cur.result as { problems?: string[] }).problems ?? []).join('; ')}</p> : <Pairs data={cur.result} mark={repBy.get(cur.idx)?.changed ?? []} />}
            {repBy.get(cur.idx)?.outcome === 'differs' && <p className="fr-diff">Run again today, this tool gives a different answer for: {(repBy.get(cur.idx)?.changed ?? []).map(human).join(', ')}.</p>}
            {repBy.get(cur.idx)?.outcome === 'not_rerun' && <p className="muted">Not run again: this tool {repBy.get(cur.idx)?.why}.</p>}
            <p className="fr-seal"><span>Seal</span><code>{short(cur.seal)}</code>{at > 0 && <><span>follows</span><code>{short(steps[at - 1].seal)}</code></>}</p>
          </div>
        </section>
      )}

      <section className="fr-actions" aria-label="Check this run">
        <div>
          <h2 className="ov-h">Would the agent see the same thing today?</h2>
          {rep ? (
            <p className="fr-rep-line">{rep.summary.differs === 0 ? <>All <b>{rep.summary.reran}</b> read-only tool calls give the same answer today.</> : <><b className="warn">{rep.summary.differs}</b> of {rep.summary.reran} read-only tool calls give a different answer today. The case changed after this run, so its advice may be out of date.</>} Tools that change data or need approval are never run again.</p>
          ) : <p className="muted">Replay runs each read-only tool again with the same arguments and compares the answer. Tools that change data or need approval are never run again.</p>}
          <div className="fr-btns">
            <button className="btn primary" onClick={replay} disabled={!!busy}><RotateCcw size={16} />{busy === 'replay' ? 'Replaying…' : rep ? 'Replay again' : 'Replay the reads'}</button>
            <button className="btn ghost" onClick={exportJson}><Download size={16} />Export the record</button>
            {demo && v?.state === 'intact' && <button className="btn ghost danger" onClick={tamper} disabled={!!busy}><ScanSearch size={16} />Edit a stored figure (demo)</button>}
          </div>
        </div>
        <p className="fr-pack">Rules in force: <Stamp>{rec.rule_pack.id}</Stamp>{rec.rule_pack.effective_from && <> from {rec.rule_pack.effective_from}</>}</p>
      </section>
      {err && <Notice tone="error">{err}</Notice>}

      {runs && runs.length > 1 && (
        <section className="fr-runs" aria-label="Other runs on this case">
          <h2 className="ov-h">Other runs on this case</h2>
          <ul>{runs.map(r => <li key={r.id}><a href={`#/recorder/${r.id}`} aria-current={r.id === rec.id}>Run #{r.id}</a><span className="muted">{human(r.status)} · {r.steps.length} steps</span></li>)}</ul>
        </section>
      )}
    </div>
  )
}

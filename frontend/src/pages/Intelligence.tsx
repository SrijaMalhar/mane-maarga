import { useEffect, useRef, useState } from 'react'
import { Mic, Send, Volume2, ClipboardCheck, ExternalLink, ShieldAlert } from 'lucide-react'
import Mascot from '../components/Mascot'
import AgentRunPanel from '../components/AgentRunPanel'
import { CasePicker, Empty, Notice, PageHead, Skeleton, Tag } from '../components/ui'
import { type AgentPlan, type RecoveryTask } from '../lib/api'
import { href, useApp } from '../lib/app-context'
import { useI18n } from '../lib/i18n'
import { inr, human } from '../lib/format'

type Tool = 'intake' | 'schemes' | 'budget' | 'tasks' | 'lab'

export default function Intelligence({ initialCase }: { initialCase?: number }) {
  const { cases, isAdmin } = useApp()
  const { t } = useI18n()
  const [caseId, setCaseId] = useState<number | null>(initialCase ?? null)
  const [tool, setTool] = useState<Tool>('intake')
  useEffect(() => { if (!caseId && cases[0]) setCaseId(cases[0].id) }, [cases, caseId])
  const tools: Array<[Tool, string]> = [['intake', 'Conversational intake'], ['schemes', 'Scheme reference'], ['budget', 'Budget estimate'], ['tasks', 'Follow-up tasks'], ...(isAdmin ? [['lab', 'Safety checks'] as [Tool, string]] : [])]

  return (
    <div className="intel">
      <PageHead eyebrow="Decision support" title={t('intel.title')} lead={t('intel.lead')} actions={<CasePicker cases={cases} value={caseId} onChange={setCaseId} />} />
      <div className="intel-banner"><ShieldAlert size={18} aria-hidden /><p>{t('banner.intel')}</p></div>
      {caseId ? <><CaseAnalysis key={caseId} caseId={caseId} /><AgentRunPanel key={`run-${caseId}`} caseId={caseId} /></> : <div className="panel"><Empty title={t('list.empty')} /></div>}
      <section className="intel-tools">
        <div className="seg" role="tablist" aria-label="Tools">
          {tools.map(([k, label]) => <button key={k} role="tab" aria-selected={tool === k} aria-pressed={tool === k} onClick={() => setTool(k)}>{label}</button>)}
        </div>
        <div className="panel" role="tabpanel">
          {tool === 'intake' && <Intake />}
          {tool === 'schemes' && <Schemes />}
          {tool === 'budget' && (caseId ? <Budget caseId={caseId} /> : <p className="muted">{t('common.selectCase')}</p>)}
          {tool === 'tasks' && (caseId ? <Tasks caseId={caseId} /> : <p className="muted">{t('common.selectCase')}</p>)}
          {tool === 'lab' && <Lab />}
        </div>
      </section>
    </div>
  )
}

function CaseAnalysis({ caseId }: { caseId: number }) {
  const { api, cases } = useApp()
  const c = cases.find(x => x.id === caseId)
  const [plan, setPlan] = useState<AgentPlan | null>(null)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  async function run() { setBusy(true); try { setPlan(await api.get<AgentPlan>(`/api/cases/${caseId}/agent-plan`)); setErr('') } catch (e) { setErr(e instanceof Error ? e.message : 'Analysis failed') } finally { setBusy(false) } }

  return (
    <section className="analysis" aria-labelledby="an-h">
      <div className="analysis-head">
        <div><p className="eyebrow">Case analysis</p><h2 id="an-h">{c?.beneficiary_name ?? `Case #${caseId}`}</h2>{c && <p className="muted">{c.village}, {c.taluk} · <a href={href({ name: 'case', id: caseId })}>open case file</a></p>}</div>
        <button className="btn primary" onClick={run} disabled={busy}><ClipboardCheck size={16} />{busy ? 'Reviewing records…' : plan ? 'Review again' : 'Review this case'}</button>
      </div>
      {err && <Notice tone="error">{err}</Notice>}
      {!plan ? <p className="muted">Runs four checks — documents, finance, construction and blockers — and lists recommended actions with the records behind them. Each run is written to the audit trail.</p> : (
        <div className="analysis-grid">
          <div className="analysis-actions">
            <h3>Recommended next steps</h3>
            {plan.case_manager.priority_actions.length === 0 ? <p className="muted">No open actions found.</p> : (
              <ol className="insight-list">
                {plan.case_manager.priority_actions.map((a, i) => (
                  <li key={i} className={`ins-${a.priority}`}>
                    <span className="ins-pri">{a.priority}</span>
                    <div><b>{a.action}</b><p>{a.reason}</p>{a.evidence.length > 0 && <small>Evidence: {a.evidence.join(', ')}</small>}<small className="ins-src">from {human(a.agent)}</small></div>
                  </li>
                ))}
              </ol>
            )}
          </div>
          <div className="analysis-checks">
            <h3>Checks run</h3>
            <ul className="check-grid">
              {plan.case_manager.specialists.map(s => (
                <li key={s.agent} className={s.status === 'no_action' ? 'ok' : 'attn'}>
                  <b>{s.agent.replace('_agent', '').replace('_', ' ')}</b>
                  <span>{s.status === 'no_action' ? '✓ nothing found' : `${s.recommended_actions.length} to review`}</span>
                </li>
              ))}
            </ul>
            <div className="gate"><b>Human approval required for</b><ul>{plan.approval_gate.required_for.map(r => <li key={r}>{human(r)}</li>)}</ul></div>
            <p className="fine">{plan.disclaimer} · {plan.agent_version}</p>
          </div>
        </div>
      )}
    </section>
  )
}

function Intake() {
  const { api } = useApp()
  const [language, setLanguage] = useState<'kn' | 'en' | 'te'>('kn')
  const [session, setSession] = useState('')
  const [chat, setChat] = useState<Array<{ role: 'assistant' | 'user'; text: string }>>([])
  const [fields, setFields] = useState<Record<string, string>>({})
  const [msg, setMsg] = useState('')
  const [done, setDone] = useState(false)
  const [note, setNote] = useState('')
  const end = useRef<HTMLDivElement>(null)
  useEffect(() => { end.current?.scrollIntoView({ block: 'nearest' }) }, [chat])
  const w = window as unknown as { SpeechRecognition?: new () => SpeechLike; webkitSpeechRecognition?: new () => SpeechLike }
  const Speech = w.SpeechRecognition ?? w.webkitSpeechRecognition
  const bcp = language === 'kn' ? 'kn-IN' : language === 'te' ? 'te-IN' : 'en-IN'

  async function start() {
    try { const d = await api.post<{ session_token: string; message: string }>('/api/intelligence/intake', { language }); setSession(d.session_token); setChat([{ role: 'assistant', text: d.message }]); setFields({}); setDone(false) } catch (e) { setNote(e instanceof Error ? e.message : 'Could not start') }
  }
  async function send(text = msg) {
    if (!session || !text.trim()) return
    setChat(c => [...c, { role: 'user', text }]); setMsg('')
    try { const d = await api.post<{ message: string; fields: Record<string, string>; status: string }>(`/api/intelligence/intake/${session}/message`, { message: text }); setChat(c => [...c, { role: 'assistant', text: d.message }]); setFields(d.fields || {}); if (d.status === 'completed') setDone(true) } catch (e) { setNote(e instanceof Error ? e.message : 'Message failed') }
  }
  function listen() {
    if (!Speech) return
    const rec = new Speech(); rec.lang = bcp
    rec.onresult = ev => setMsg(ev.results[0][0].transcript); rec.onerror = () => setNote('Voice input failed — please type instead.'); rec.start()
  }
  function speak(text: string) {
    if (!('speechSynthesis' in window)) return
    const u = new SpeechSynthesisUtterance(text); u.lang = bcp; window.speechSynthesis.cancel(); window.speechSynthesis.speak(u)
  }

  return (
    <div className="intake">
      <div className="intake-side">
        <Mascot size={72} mood="guide" />
        <p>A guided conversation to collect household details in the family's language. An operator reviews the answers before any case is created.</p>
        <label className="field"><span>Language</span><select value={language} onChange={e => setLanguage(e.target.value as 'kn')} disabled={!!session && !done}><option value="kn">ಕನ್ನಡ Kannada</option><option value="en">English</option><option value="te">తెలుగు Telugu</option></select></label>
        <button className="btn primary" onClick={start}>{session ? 'Start over' : 'Start conversation'}</button>
        <p className="fine"><b>Voice:</b> uses your browser's built-in speech recognition and playback where available (beta). Audio is not sent to or stored by Mane Maarga. <Tag tone="soon">Bhashini integration · coming soon</Tag></p>
        {note && <Notice tone="warn" onClose={() => setNote('')}>{note}</Notice>}
      </div>
      <div className="intake-chat">
        {!session ? <Empty mood="calm" title="Start a conversation to begin intake." /> : (
          <>
            <div className="chat" aria-live="polite">
              {chat.map((m, i) => (
                <div key={i} className={`bubble ${m.role}`} lang={m.role === 'assistant' ? language : undefined}>
                  {m.text}
                  {m.role === 'assistant' && 'speechSynthesis' in window && <button className="bubble-play" onClick={() => speak(m.text)} aria-label="Read aloud"><Volume2 size={14} /></button>}
                </div>
              ))}
              <div ref={end} />
            </div>
            {!done && (
              <form className="chat-input" onSubmit={e => { e.preventDefault(); void send() }}>
                {Speech ? <button type="button" className="icon-btn" onClick={listen} aria-label="Speak your answer"><Mic size={18} /></button> : <span className="muted tiny">Voice not available in this browser</span>}
                <input value={msg} onChange={e => setMsg(e.target.value)} placeholder="Type the answer…" aria-label="Answer" />
                <button className="icon-btn primary" aria-label="Send"><Send size={16} /></button>
              </form>
            )}
            {Object.keys(fields).length > 0 && (
              <div className="intake-fields"><b>Collected so far — needs operator review</b><dl className="kv">{Object.entries(fields).map(([k, v]) => <div key={k}><dt>{human(k)}</dt><dd>{v || '—'}</dd></div>)}</dl></div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
type SpeechLike = { lang: string; start: () => void; onresult: (e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void; onerror: () => void }

function Schemes() {
  const { api } = useApp()
  const [items, setItems] = useState<Array<{ code: string; name: string; level: string; type: string; source_url: string; documents_common: string[]; note: string }> | null>(null)
  useEffect(() => { api.get<{ items: typeof items }>('/api/intelligence/schemes').then(d => setItems(d.items)).catch(() => setItems([])) }, [api])
  if (!items) return <Skeleton lines={4} />
  return (
    <div>
      <p className="muted">Reference material with official links. Mane Maarga does not decide eligibility or benefit amounts.</p>
      <ul className="schemes">
        {items.map(s => (
          <li key={s.code}>
            <div className="scheme-top"><Tag>{s.level}</Tag><code>{s.code}</code></div>
            <h3>{s.name}</h3><p className="muted">{s.type}</p>
            <p className="tiny"><b>Commonly asked for:</b> {s.documents_common.join(', ')}</p>
            <a href={s.source_url} target="_blank" rel="noreferrer" className="link-btn">Official source <ExternalLink size={13} /></a>
            <p className="fine">{s.note}</p>
          </li>
        ))}
      </ul>
    </div>
  )
}

function Budget({ caseId }: { caseId: number }) {
  const { api, canEdit } = useApp()
  const [b, setB] = useState({ built_up_sqft: 300, quality_tier: 'standard', contingency_percent: 8, labor_percent: 35, materials_percent: 55, other_percent: 10 })
  const [res, setRes] = useState<{ estimated_total: number; allocation: Record<string, number>; confirmed_funding: number; funding_gap: number; warnings: string[]; assumptions: { indicative_cost_per_sqft: number } } | null>(null)
  const [err, setErr] = useState('')
  async function run() { try { setRes(await api.post(`/api/cases/${caseId}/budget-plan`, b)); setErr('') } catch (e) { setErr(e instanceof Error ? e.message : 'Failed') } }
  return (
    <div className="budget">
      <div className="grid-3 compact">
        <label className="field"><span>Built-up area (sq ft)</span><input type="number" min="101" value={b.built_up_sqft} onChange={e => setB({ ...b, built_up_sqft: Number(e.target.value) })} /></label>
        <label className="field"><span>Finish</span><select value={b.quality_tier} onChange={e => setB({ ...b, quality_tier: e.target.value })}><option value="basic">Basic</option><option value="standard">Standard</option><option value="improved">Improved</option></select></label>
        <label className="field"><span>Contingency %</span><input type="number" min="0" max="25" value={b.contingency_percent} onChange={e => setB({ ...b, contingency_percent: Number(e.target.value) })} /></label>
      </div>
      {canEdit ? <button className="btn ghost small" onClick={run}>Estimate</button> : <p className="muted">Read-only access</p>}
      {err && <Notice tone="error">{err}</Notice>}
      {res && (
        <div className="budget-out">
          <p className="fin-big">{inr(res.estimated_total)}<small>indicative total at {inr(res.assumptions.indicative_cost_per_sqft)}/sq ft</small></p>
          <dl className="fin-rows">{Object.entries(res.allocation).map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{inr(v)}</dd></div>)}<div className="ledger-gap"><dt>Gap against confirmed funding ({inr(res.confirmed_funding)})</dt><dd>{inr(res.funding_gap)}</dd></div></dl>
          {res.warnings.map(w => <p key={w} className="fine">{w}</p>)}
        </div>
      )}
    </div>
  )
}

function Tasks({ caseId }: { caseId: number }) {
  const { api, canEdit } = useApp()
  const { t } = useI18n()
  const [tasks, setTasks] = useState<RecoveryTask[] | null>(null)
  const [title, setTitle] = useState('')
  const load = () => api.get<RecoveryTask[]>(`/api/cases/${caseId}/recovery-tasks`).then(setTasks).catch(() => setTasks([]))
  useEffect(() => { void load() }, [caseId]) // eslint-disable-line react-hooks/exhaustive-deps
  async function add() { if (!title.trim()) return; await api.post(`/api/cases/${caseId}/recovery-tasks`, { title, category: 'follow_up' }); setTitle(''); void load() }
  async function update(id: number, status: string) { await api.patch(`/api/recovery-tasks/${id}`, { status }); void load() }
  if (!tasks) return <Skeleton lines={3} />
  return (
    <div>
      {canEdit && <form className="chat-input" onSubmit={e => { e.preventDefault(); void add() }}><input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Collect RTC copy from the village accountant" aria-label="New task" /><button className="btn ghost small">Add task</button></form>}
      {tasks.length === 0 ? <p className="muted">No follow-up tasks for this case.</p> : (
        <ul className="src-list">{tasks.map(tk => (
          <li key={tk.id}><span><b>{tk.title}</b><small>{human(tk.category)}{tk.description ? ` · ${tk.description}` : ''}</small></span>
            {canEdit ? <select aria-label={`Status of ${tk.title}`} value={tk.status} onChange={e => update(tk.id, e.target.value)}>{['open', 'in_progress', 'blocked', 'completed', 'cancelled'].map(s => <option key={s} value={s}>{t(`task.${s}` as never)}</option>)}</select> : <Tag>{tk.status}</Tag>}
          </li>))}
        </ul>
      )}
    </div>
  )
}

function Lab() {
  const { api } = useApp()
  const [res, setRes] = useState<{ passed: number; score: number; cases: Array<{ name: string; expected: string; actual: string }>; note: string } | null>(null)
  return (
    <div>
      <p className="muted">Five fixed safety scenarios: missing documents, proposed money, withdrawn consent, eligibility claims and approval gates.</p>
      <Notice tone="warn">Prototype: these scenarios return fixed results and are not yet executed against the rules engine. The real coverage is the backend test suite.</Notice>
      <button className="btn ghost small" onClick={() => api.post<typeof res>('/api/intelligence/evaluation/synthetic').then(setRes)}>Run safety checks</button>
      {res && <ul className="src-list">{res.cases.map(x => <li key={x.name}><span><b>{human(x.name)}</b><small>expected {human(x.expected)}</small></span><Tag tone={x.expected === x.actual ? 'confirmed' : 'warn'}>{x.expected === x.actual ? 'pass' : 'fail'}</Tag></li>)}</ul>}
    </div>
  )
}

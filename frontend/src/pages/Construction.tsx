import { useCallback, useEffect, useState, type ChangeEvent } from 'react'
import { AlertTriangle, Camera, CheckCircle2, Clock3, Copy, Hammer, ImagePlus, MapPin, RotateCcw, ShieldCheck } from 'lucide-react'
import House from '../components/House'
import PlotPanel from '../components/PlotPanel'
import ProgressShare from '../components/ProgressShare'
import SiteVisits from '../components/SiteVisits'
import { CasePicker, Dialog, Empty, Notice, PageHead, Skeleton, Tag } from '../components/ui'
import { type CaseItem, type Evidence, type Stage, type StageStatus } from '../lib/api'
import { href, useApp } from '../lib/app-context'
import { useI18n } from '../lib/i18n'
import { samplePhoto } from '../lib/demo'
import type { Checks } from '../lib/photo-check'
import { dateShort, inr } from '../lib/format'
import type { Client } from '../lib/api'

/** Illustrative PMAY-G split used by the finance engine's Karnataka rule pack. */
const PLAN = [
  { stage_code: 'plinth', stage_name: 'Plinth', share: 0.25 },
  { stage_code: 'lintel', stage_name: 'Walls to lintel', share: 0.3 },
  { stage_code: 'roof', stage_name: 'Roof', share: 0.3 },
  { stage_code: 'finish', stage_name: 'Finishing and keys', share: 0.15 },
]
const STAGE_STATUSES: StageStatus[] = ['planned', 'in_progress', 'blocked', 'verified', 'completed']

export default function Construction({ initialCase }: { initialCase?: number }) {
  const { cases } = useApp()
  const { t } = useI18n()
  const [caseId, setCaseId] = useState<number | null>(initialCase ?? null)
  useEffect(() => { if (!caseId && cases.length) setCaseId((cases.find(c => c.status === 'construction') ?? cases[0]).id) }, [cases, caseId])
  const c = cases.find(x => x.id === caseId) ?? null
  const [view, setView] = useState<'family' | 'visits'>('family')
  const views = (
    <div className="seg" role="group" aria-label="View">
      <button type="button" aria-pressed={view === 'family'} onClick={() => setView('family')}><Hammer size={14} aria-hidden />One family</button>
      <button type="button" aria-pressed={view === 'visits'} onClick={() => setView('visits')}><MapPin size={14} aria-hidden />Site visits</button>
    </div>
  )
  if (view === 'visits') {
    return (
      <div>
        <PageHead eyebrow="Every pinned plot" title="Site visits" lead="Where each family's house is, what it needs from you today, and the shortest way round." actions={views} />
        <SiteVisits onOpen={id => { setCaseId(id); setView('family'); history.replaceState(null, '', href({ name: 'construction', caseId: id })); window.scrollTo({ top: 0 }) }} />
      </div>
    )
  }
  return (
    <div>
      <PageHead eyebrow={c ? `${c.beneficiary_name} · ${c.village}` : undefined} title={t('construction.title')} lead={t('construction.lead')}
        actions={<>{views}<CasePicker cases={cases} value={caseId} onChange={id => { setCaseId(id); if (id) history.replaceState(null, '', href({ name: 'construction', caseId: id })) }} /></>} />
      {!c ? <div className="panel"><Empty title={cases.length ? t('common.selectCase') : t('list.empty')} /></div> : <CaseBuild key={c.id} c={c} />}
    </div>
  )
}

const PHOTO_STATUS: Record<string, string> = { pending_review: 'Waiting for review', accepted: 'Accepted', retake: 'Retake asked' }

/** Loads a photo through the API (so the session is checked) and gives back an object URL. */
function usePhoto(api: Client, id: number) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    let u: string | null = null; let live = true
    if (id < 0) { setUrl(null); return }
    api.raw(`/api/construction-evidence/${id}/file`).then(async r => { if (!r.ok || !live) return; u = URL.createObjectURL(await r.blob()); setUrl(u) }).catch(() => {})
    return () => { live = false; if (u) URL.revokeObjectURL(u) }
  }, [api, id])
  return url
}

const fmtDist = (m: number) => (m >= 1000 ? `${(m / 1000).toFixed(m >= 10000 ? 0 : 1)} km` : `${m} m`)
const fmtWhen = (iso: string) => new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' })

/** The plot at the centre, 150 m and 1 km rings, and where the photo says it was taken. */
function DistanceRing({ w }: { w: Checks['where'] }) {
  const d = w.distance_m ?? 0
  const r = d <= 150 ? (d / 150) * 34 : d <= 1000 ? 34 + ((d - 150) / 850) * 30 : Math.min(84, 64 + Math.log10(d / 1000 + 1) * 20)
  const a = (((w.bearing_deg ?? 0) - 90) * Math.PI) / 180
  const x = 90 + r * Math.cos(a), y = 90 + r * Math.sin(a)
  const far = w.state === 'far'
  return (
    <svg viewBox="0 0 180 180" className="ev-ring" role="img" aria-label={w.distance_m != null ? `Photo taken ${fmtDist(d)} from the plot pin` : 'No location in the photo'}>
      <circle cx="90" cy="90" r="64" className="ring-km" /><circle cx="90" cy="90" r="34" className="ring-near" />
      <text x="90" y="21" className="ring-l">1 km</text><text x="90" y="51" className="ring-l">150 m</text>
      <rect x="84" y="84" width="12" height="12" className="ring-plot" />
      {w.distance_m != null && <><line x1="90" y1="90" x2={x} y2={y} className={far ? 'ring-line far' : 'ring-line'} /><circle cx={x} cy={y} r="6" className={far ? 'ring-photo far' : 'ring-photo'} /></>}
    </svg>
  )
}

function CheckRows({ c }: { c: Checks }) {
  const where = c.where.state === 'no_plot' ? 'Plot not pinned on the case, so distance is not checked'
    : c.where.state === 'no_gps' ? 'The photo has no location in it' : `${fmtDist(c.where.distance_m!)} from the plot pin${c.where.state === 'at_plot' ? ': at the plot' : c.where.state === 'near' ? ': nearby, not on it' : ': far from the plot'}`
  const when = c.when.state === 'no_time' ? 'The photo has no capture time' : c.when.state === 'future' ? `Says it was taken ${fmtWhen(c.when.taken_at!)}, after it was uploaded` : `Taken ${fmtWhen(c.when.taken_at!)}${c.when.state === 'stale' ? `, ${Math.round(c.when.days_before_upload!)} days before it was uploaded` : ''}`
  const reused = c.reused.state === 'reused' ? `Same picture as ${c.reused.matches.map(m => `${m.same_case ? 'this family' : m.who}'s ${m.stage_name.toLowerCase()} photo${m.same_case ? '' : ` (${m.village})`}`).join('; ')}` : c.reused.state === 'unique' ? 'Not seen before on any family\'s file' : 'Could not compare this image'
  const row = (flag: boolean, Icon: typeof MapPin, label: string, text: string) => <li className={flag ? 'flag' : 'ok'}><Icon size={16} aria-hidden /><span><b>{label}</b>{text}</span>{flag ? <AlertTriangle size={15} className="ev-flag-i" aria-label="Warning" /> : <CheckCircle2 size={15} className="ev-ok-i" aria-label="No warning" />}</li>
  return (
    <ul className="ev-checks">
      {row(c.where.flag, MapPin, 'Where', where)}
      {row(c.when.flag, Clock3, 'When', when)}
      {row(c.reused.flag, Copy, 'Used before?', reused)}
    </ul>
  )
}

function Thumb({ e, onOpen }: { e: Evidence; onOpen: () => void }) {
  const { api } = useApp()
  const url = usePhoto(api, e.id)
  return (
    <button className={`ev-thumb ev-${e.verification_status}`} onClick={onOpen} aria-label={`Open photo ${e.original_name}, ${PHOTO_STATUS[e.verification_status] ?? e.verification_status}`}>
      {url ? <img src={url} alt="" /> : <span className="ev-ph" />}
      {e.verification_status === 'pending_review' && (e.checks?.flags.length ?? 0) > 0 && <span className="ev-warn" aria-hidden><AlertTriangle size={12} />{e.checks!.flags.length}</span>}
      <span className="ev-badge">{PHOTO_STATUS[e.verification_status] ?? e.verification_status}</span>
    </button>
  )
}

/** A person looks at the photo and decides. The system never judges the image. */
function ReviewPhoto({ e, stage, onClose, onDone }: { e: Evidence; stage: Stage; onClose: () => void; onDone: (msg: string) => void }) {
  const { api, canEdit } = useApp()
  const { lang } = useI18n()
  const url = usePhoto(api, e.id)
  const [note, setNote] = useState('')
  const [asking, setAsking] = useState(false)
  const [reason, setReason] = useState('')
  const flags = e.checks?.flags ?? []
  const match = e.checks?.reused.matches[0]
  const matchUrl = usePhoto(api, match?.evidence_id ?? -1)
  const [err, setErr] = useState('')
  async function decide(status: 'accepted' | 'retake') {
    try { await api.patch(`/api/construction-evidence/${e.id}/review`, { status, note: status === 'accepted' ? reason : note }); onDone(status === 'accepted' ? `Photo accepted. ${stage.stage_name} can now be marked verified.` : 'Retake asked') } catch (er) { setErr(er instanceof Error ? er.message : 'Could not save the review') }
  }
  return (
    <Dialog title={stage.stage_name} eyebrow="Site photo" onClose={onClose} wide>
      <div className="ev-review">
        <div className="ev-left">
          <div className={`ev-pair${match && matchUrl ? ' two' : ''}`}>
            <figure className="ev-big">{url ? <img src={url} alt={`Site photo for ${stage.stage_name}: ${e.original_name}`} /> : <Skeleton lines={8} />}{match && <figcaption>This photo</figcaption>}</figure>
            {match && matchUrl && <figure className="ev-big match"><img src={matchUrl} alt={`The same picture already filed for ${match.who}`} /><figcaption>Already on file: {match.who}, {match.stage_name.toLowerCase()} ({match.village})</figcaption></figure>}
          </div>
          {e.checks && (
            <div className="ev-checkbox">
              <CheckRows c={e.checks} />
              {e.checks.where.distance_m != null && <DistanceRing w={e.checks.where} />}
            </div>
          )}
        </div>
        <div className="ev-side">
          <dl className="ev-meta">
            <div><dt>Taken for</dt><dd>{stage.stage_name}</dd></div>
            <div><dt>Uploaded by</dt><dd>{e.uploaded_by}, {dateShort(e.uploaded_at, lang)}</dd></div>
            <div><dt>Review</dt><dd>{PHOTO_STATUS[e.verification_status]}{e.reviewed_by && `, by ${e.reviewed_by}`}</dd></div>
            {e.review_note && <div><dt>Retake should show</dt><dd>{e.review_note}</dd></div>}
          </dl>
          {flags.length > 0 && e.verification_status === 'pending_review' && <p className="ev-alert"><AlertTriangle size={16} aria-hidden />{flags.length === 1 ? 'One check needs a look' : `${flags.length} checks need a look`} before you accept.</p>}
          <p className="ev-ask">Does this photo show <b>{stage.stage_name.toLowerCase()}</b> finished, on this family's plot?</p>
          <p className="fine">You decide, not the software. Accepting it lets you mark the stage verified, which moves the house drawing and the money ladder on.</p>
          {err && <Notice tone="error">{err}</Notice>}
          {canEdit && (asking ? (
            <div className="ev-retake">
              <label className="field"><span>What should the retake show?</span><textarea rows={3} value={note} onChange={x => setNote(x.target.value)} placeholder="e.g. Stand back so the whole plinth and the neighbour's wall are in frame" /></label>
              <div className="form-actions"><button className="btn ghost" onClick={() => setAsking(false)}>Back</button><button className="btn primary" onClick={() => decide('retake')} disabled={!note.trim()}>Ask for a retake</button></div>
            </div>
          ) : (
            <div className="form-actions start ev-decide">
              {flags.length > 0 && <label className="field"><span>Why accept it despite the warnings? (kept in the audit trail)</span><textarea rows={2} value={reason} onChange={x => setReason(x.target.value)} placeholder="e.g. Visited the plot on 26 Nov; the officer's phone had location off" /></label>}
              <button className={`btn ${flags.length ? 'ghost' : 'primary'}`} onClick={() => decide('accepted')} disabled={flags.length > 0 && !reason.trim()}><CheckCircle2 size={16} />{flags.length ? 'Accept anyway' : 'Accept the photo'}</button>
              <button className={`btn ${flags.length ? 'primary' : 'ghost'}`} onClick={() => setAsking(true)}><RotateCcw size={16} />Ask for a retake</button>
            </div>
          ))}
        </div>
      </div>
    </Dialog>
  )
}

function CaseBuild({ c }: { c: CaseItem }) {
  const { api, canEdit, toast, demo } = useApp()
  const [open, setOpen] = useState<number | null>(null)
  const { t } = useI18n()
  const [stages, setStages] = useState<Stage[] | null>(null)
  const [evidence, setEvidence] = useState<Evidence[]>([])
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const load = useCallback(async () => {
    try { const [s, e] = await Promise.all([api.get<Stage[]>(`/api/cases/${c.id}/stages`), api.get<Evidence[]>(`/api/cases/${c.id}/construction-evidence`)]); setStages(s); setEvidence(e); setErr('') }
    catch (e) { setErr(e instanceof Error ? e.message : 'Could not load stages') }
  }, [api, c.id])
  useEffect(() => { void load() }, [load])

  async function createPlan() {
    setBusy(true)
    try { for (const p of PLAN) await api.post(`/api/cases/${c.id}/stages`, { stage_code: p.stage_code, stage_name: p.stage_name, planned_cost: Math.round(Number(c.estimated_cost) * p.share) }); await load(); toast('Stage plan created') }
    catch (e) { toast(e instanceof Error ? e.message : 'Could not create plan', 'error') } finally { setBusy(false) }
  }
  async function setStatus(s: Stage, status: StageStatus) {
    try { await api.patch(`/api/stages/${s.id}/status`, { status }); await load(); toast(`${s.stage_name}: ${t(`stage.${status}` as never)}`) } catch (e) { toast(e instanceof Error ? e.message : 'Update failed', 'error') }
  }
  async function upload(s: Stage, e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; e.target.value = ''
    if (!file) return
    try { const fd = new FormData(); fd.append('file', file); await api.post(`/api/cases/${c.id}/stages/${s.id}/evidence`, fd); await load(); toast('Photo added. It waits for a reviewer.') } catch (er) { toast(er instanceof Error ? er.message : 'Upload failed', 'error') }
  }
  async function sample(s: Stage, kind: 'good' | 'problem') {
    try { await api.post(`/api/cases/${c.id}/stages/${s.id}/evidence`, { sample: kind }); await load(); toast(kind === 'good' ? 'Sample photo added. Open it to review.' : 'A problem photo arrived. Open it to see what the checks found.') } catch (er) { toast(er instanceof Error ? er.message : 'Could not add the sample', 'error') }
  }

  if (err) return <Notice tone="error">{err}</Notice>
  if (!stages) return <div className="panel"><Skeleton lines={5} /></div>

  if (stages.length === 0) {
    return (
      <>
        <div className="panel">
          <Empty title={t('case.noStages')} sub={Number(c.estimated_cost) > 0 ? `Create the four standard stages, costed from the ${inr(c.estimated_cost)} estimate. The split is illustrative — adjust to the sanction order.` : 'Add a construction cost estimate to the case first, so each stage can be costed.'}
            action={canEdit && Number(c.estimated_cost) > 0 ? <button className="btn primary" onClick={createPlan} disabled={busy}><Hammer size={16} />{busy ? 'Creating…' : 'Create stage plan'}</button> : undefined} />
        </div>
        <PlotPanel c={c} stages={stages} evidence={evidence} onPinSaved={() => void load()} />
      </>
    )
  }

  const doneCount = stages.filter(s => ['verified', 'completed'].includes(s.status)).length
  const level = doneCount === 0 ? (stages.some(s => s.status === 'in_progress') ? 1 : 0) : Math.min(5, 1 + Math.round((doneCount / stages.length) * 4))
  const pct = Math.round((doneCount / stages.length) * 100)

  return (
    <div className="build">
      <section className="build-hero panel">
        <House level={level} size={300} label={`House drawing at ${pct}% complete`} />
        <div>
          <p className="build-pct">{pct}<span>%</span></p>
          <p className="muted">{doneCount} of {stages.length} stages verified or complete</p>
          <p className="fine">A stage counts once a reviewer has accepted a site photo and marked it verified. The software never judges a photo; a person does.</p>
          <ol className="ev-flow" aria-label="How a stage is verified"><li><Camera size={15} aria-hidden />Field officer adds a site photo</li><li><ShieldCheck size={15} aria-hidden />Reviewer accepts it or asks for a retake</li><li><CheckCircle2 size={15} aria-hidden />Stage marked verified; the house fills in</li></ol>
        </div>
      </section>
      <ol className="stage-track">
        {stages.map((s, i) => {
          const ev = evidence.filter(e => e.stage_id === s.id)
          return (
            <li key={s.id} className={`stage-card st-${s.status}`}>
              <div className="stage-top"><span className="stage-n">{i + 1}</span><Tag tone={s.status === 'completed' || s.status === 'verified' ? 'confirmed' : s.status === 'blocked' ? 'warn' : 'neutral'}>{t(`stage.${s.status}` as never)}</Tag></div>
              <h3>{s.stage_name}</h3>
              <p className="num">{inr(s.planned_cost)}</p>
              {canEdit && (
                <label className="field compact"><span className="sr-only">Status for {s.stage_name}</span>
                  <select value={s.status} onChange={e => setStatus(s, e.target.value as StageStatus)}>{STAGE_STATUSES.map(x => <option key={x} value={x}>{t(`stage.${x}` as never)}</option>)}</select>
                </label>
              )}
              <div className="stage-ev">
                {ev.length > 0 && <div className="ev-row">{ev.slice(0, 3).map(e => <Thumb key={e.id} e={e} onOpen={() => setOpen(e.id)} />)}</div>}
                {(() => {
                  const accepted = ev.some(e => e.verification_status === 'accepted')
                  const pending = ev.find(e => e.verification_status === 'pending_review')
                  const retake = ev.find(e => e.verification_status === 'retake')
                  if (s.status === 'verified' || s.status === 'completed') return <p className="ev-next done"><CheckCircle2 size={15} aria-hidden />Verified against {ev.filter(e => e.verification_status === 'accepted').length || 'an'} accepted photo</p>
                  if (pending) return canEdit ? <button className={`btn small${pending.checks?.flags.length ? ' danger-outline' : ''}`} onClick={() => setOpen(pending.id)}>{pending.checks?.flags.length ? <><AlertTriangle size={15} />Review: {pending.checks.flags.length} warning{pending.checks.flags.length > 1 ? 's' : ''}</> : 'Review the photo'}</button> : <p className="ev-next">Waiting for review</p>
                  if (accepted) return canEdit ? <button className="btn primary small" onClick={() => setStatus(s, 'verified')}><ShieldCheck size={15} />Mark verified</button> : <p className="ev-next">Photo accepted</p>
                  if (retake) return <p className="ev-next warn">Retake asked: {retake.review_note}</p>
                  return <p className="ev-next muted">{s.status === 'planned' ? 'Not started' : 'Needs a site photo'}</p>
                })()}
                {canEdit && s.status !== 'verified' && s.status !== 'completed' && (
                  <div className="ev-add">
                    <label className="link-btn"><Camera size={14} />Add photo<input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={e => upload(s, e)} /></label>
                    {demo && samplePhoto(c.village, s.stage_code) && <>
                      <button className="link-btn" onClick={() => sample(s, 'good')}><ImagePlus size={14} />Sample photo</button>
                      <button className="link-btn warn" onClick={() => sample(s, 'problem')}><AlertTriangle size={14} />Problem photo</button>
                    </>}
                  </div>
                )}
              </div>
            </li>
          )
        })}
      </ol>
      <PlotPanel c={c} stages={stages} evidence={evidence} onOpenPhoto={setOpen} onPinSaved={() => void load()} />
      <ProgressShare c={c} />
      {open !== null && (() => { const e = evidence.find(x => x.id === open); const st = e && stages.find(x => x.id === e.stage_id); return e && st ? <ReviewPhoto e={e} stage={st} onClose={() => setOpen(null)} onDone={msg => { setOpen(null); toast(msg); void load() }} /> : null })()}
    </div>
  )
}

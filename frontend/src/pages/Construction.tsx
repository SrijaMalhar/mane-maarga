import { useCallback, useEffect, useState, type ChangeEvent } from 'react'
import { Camera, CheckCircle2, Hammer, ImagePlus, RotateCcw, ShieldCheck } from 'lucide-react'
import House from '../components/House'
import { CasePicker, Dialog, Empty, Notice, PageHead, Skeleton, Tag } from '../components/ui'
import { type CaseItem, type Evidence, type Stage, type StageStatus } from '../lib/api'
import { href, useApp } from '../lib/app-context'
import { useI18n } from '../lib/i18n'
import { SAMPLE_PHOTO } from '../lib/demo'
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
  return (
    <div>
      <PageHead eyebrow={c ? `${c.beneficiary_name} · ${c.village}` : undefined} title={t('construction.title')} lead={t('construction.lead')}
        actions={<CasePicker cases={cases} value={caseId} onChange={id => { setCaseId(id); if (id) history.replaceState(null, '', href({ name: 'construction', caseId: id })) }} />} />
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
    api.raw(`/api/construction-evidence/${id}/file`).then(async r => { if (!r.ok || !live) return; u = URL.createObjectURL(await r.blob()); setUrl(u) }).catch(() => {})
    return () => { live = false; if (u) URL.revokeObjectURL(u) }
  }, [api, id])
  return url
}

function Thumb({ e, onOpen }: { e: Evidence; onOpen: () => void }) {
  const { api } = useApp()
  const url = usePhoto(api, e.id)
  return (
    <button className={`ev-thumb ev-${e.verification_status}`} onClick={onOpen} aria-label={`Open photo ${e.original_name}, ${PHOTO_STATUS[e.verification_status] ?? e.verification_status}`}>
      {url ? <img src={url} alt="" /> : <span className="ev-ph" />}
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
  const [err, setErr] = useState('')
  async function decide(status: 'accepted' | 'retake') {
    try { await api.patch(`/api/construction-evidence/${e.id}/review`, { status, note }); onDone(status === 'accepted' ? `Photo accepted. ${stage.stage_name} can now be marked verified.` : 'Retake asked') } catch (er) { setErr(er instanceof Error ? er.message : 'Could not save the review') }
  }
  return (
    <Dialog title={stage.stage_name} eyebrow="Site photo" onClose={onClose} wide>
      <div className="ev-review">
        <div className="ev-big">{url ? <img src={url} alt={`Site photo for ${stage.stage_name}: ${e.original_name}`} /> : <Skeleton lines={8} />}</div>
        <div className="ev-side">
          <dl className="ev-meta">
            <div><dt>Taken for</dt><dd>{stage.stage_name}</dd></div>
            <div><dt>Uploaded by</dt><dd>{e.uploaded_by}, {dateShort(e.uploaded_at, lang)}</dd></div>
            <div><dt>Review</dt><dd>{PHOTO_STATUS[e.verification_status]}{e.reviewed_by && `, by ${e.reviewed_by}`}</dd></div>
            {e.review_note && <div><dt>Retake should show</dt><dd>{e.review_note}</dd></div>}
          </dl>
          <p className="ev-ask">Does this photo show <b>{stage.stage_name.toLowerCase()}</b> finished, on this family's plot?</p>
          <p className="fine">You decide, not the software. Accepting it lets you mark the stage verified, which moves the house drawing and the money ladder on.</p>
          {err && <Notice tone="error">{err}</Notice>}
          {canEdit && (asking ? (
            <div className="ev-retake">
              <label className="field"><span>What should the retake show?</span><textarea rows={3} value={note} onChange={x => setNote(x.target.value)} placeholder="e.g. Stand back so the whole plinth and the neighbour's wall are in frame" /></label>
              <div className="form-actions"><button className="btn ghost" onClick={() => setAsking(false)}>Back</button><button className="btn primary" onClick={() => decide('retake')} disabled={!note.trim()}>Ask for a retake</button></div>
            </div>
          ) : (
            <div className="form-actions start">
              <button className="btn primary" onClick={() => decide('accepted')}><CheckCircle2 size={16} />Accept the photo</button>
              <button className="btn ghost" onClick={() => setAsking(true)}><RotateCcw size={16} />Ask for a retake</button>
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
  async function sample(s: Stage) {
    try { await api.post(`/api/cases/${c.id}/stages/${s.id}/evidence`, {}); await load(); toast('Sample photo added from the field officer. Open it to review.') } catch (er) { toast(er instanceof Error ? er.message : 'Could not add the sample', 'error') }
  }

  if (err) return <Notice tone="error">{err}</Notice>
  if (!stages) return <div className="panel"><Skeleton lines={5} /></div>

  if (stages.length === 0) {
    return (
      <div className="panel">
        <Empty title={t('case.noStages')} sub={Number(c.estimated_cost) > 0 ? `Create the four standard stages, costed from the ${inr(c.estimated_cost)} estimate. The split is illustrative — adjust to the sanction order.` : 'Add a construction cost estimate to the case first, so each stage can be costed.'}
          action={canEdit && Number(c.estimated_cost) > 0 ? <button className="btn primary" onClick={createPlan} disabled={busy}><Hammer size={16} />{busy ? 'Creating…' : 'Create stage plan'}</button> : undefined} />
      </div>
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
                  if (accepted) return canEdit ? <button className="btn primary small" onClick={() => setStatus(s, 'verified')}><ShieldCheck size={15} />Mark verified</button> : <p className="ev-next">Photo accepted</p>
                  if (pending) return canEdit ? <button className="btn small" onClick={() => setOpen(pending.id)}>Review the photo</button> : <p className="ev-next">Waiting for review</p>
                  if (retake) return <p className="ev-next warn">Retake asked: {retake.review_note}</p>
                  return <p className="ev-next muted">{s.status === 'planned' ? 'Not started' : 'Needs a site photo'}</p>
                })()}
                {canEdit && s.status !== 'verified' && s.status !== 'completed' && (
                  <div className="ev-add">
                    <label className="link-btn"><Camera size={14} />Add photo<input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={e => upload(s, e)} /></label>
                    {demo && SAMPLE_PHOTO[s.stage_code] && <button className="link-btn" onClick={() => sample(s)}><ImagePlus size={14} />Use a sample photo</button>}
                  </div>
                )}
              </div>
            </li>
          )
        })}
      </ol>
      {open !== null && (() => { const e = evidence.find(x => x.id === open); const st = e && stages.find(x => x.id === e.stage_id); return e && st ? <ReviewPhoto e={e} stage={st} onClose={() => setOpen(null)} onDone={msg => { setOpen(null); toast(msg); void load() }} /> : null })()}
    </div>
  )
}

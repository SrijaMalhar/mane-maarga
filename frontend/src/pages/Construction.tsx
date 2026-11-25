import { useCallback, useEffect, useState, type ChangeEvent } from 'react'
import { Camera, Hammer } from 'lucide-react'
import House from '../components/House'
import { CasePicker, Empty, Notice, PageHead, Skeleton, Tag } from '../components/ui'
import { type CaseItem, type Evidence, type Stage, type StageStatus } from '../lib/api'
import { href, useApp } from '../lib/app-context'
import { useI18n } from '../lib/i18n'
import { dateShort, inr, human } from '../lib/format'

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

function CaseBuild({ c }: { c: CaseItem }) {
  const { api, canEdit, toast } = useApp()
  const { t, lang } = useI18n()
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
    try { const fd = new FormData(); fd.append('file', file); await api.post(`/api/cases/${c.id}/stages/${s.id}/evidence`, fd); await load(); toast('Photo added — pending review') } catch (er) { toast(er instanceof Error ? er.message : 'Upload failed', 'error') }
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
          <p className="fine">Progress counts only stages a reviewer marked verified or complete. Photos are evidence for review — the system does not judge construction from images.</p>
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
                <span className="muted">{ev.length} photo{ev.length === 1 ? '' : 's'}</span>
                {ev.slice(0, 2).map(e => <small key={e.id}>{e.original_name} · {human(e.verification_status)} · {dateShort(e.uploaded_at, lang)}</small>)}
                {canEdit && <label className="link-btn"><Camera size={14} />Add photo<input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={e => upload(s, e)} /></label>}
              </div>
            </li>
          )
        })}
      </ol>
    </div>
  )
}

import { useCallback, useEffect, useState, type ChangeEvent } from 'react'
import { ArrowLeft, ArrowRight, FileUp, Pencil, Trash2, ClipboardCheck, FileText, ShieldCheck, ShieldOff } from 'lucide-react'
import House, { statusLevel } from '../components/House'
import { ConsentTag, DocStatus, Empty, Journey, Notice, Skeleton, StageTag, Tag } from '../components/ui'
import { STATUSES, type AgentPlan, type CaseDocument, type CaseItem, type Consent, type FinanceSummary, type Stage } from '../lib/api'
import { href, useApp } from '../lib/app-context'
import { useI18n } from '../lib/i18n'
import { bytes, dateShort, inr, human } from '../lib/format'

type Bundle = { c: CaseItem; docs: CaseDocument[]; fin: FinanceSummary; stages: Stage[]; consent: Consent[] }

export default function CaseFile({ id }: { id: number }) {
  const { api, canEdit, openCaseForm, reloadCases, go, toast, cases } = useApp()
  const { t, lang } = useI18n()
  const [data, setData] = useState<Bundle | null>(null)
  const [error, setError] = useState('')
  const [plan, setPlan] = useState<AgentPlan | null>(null)
  const [planBusy, setPlanBusy] = useState(false)
  const [uploading, setUploading] = useState(false)

  const load = useCallback(async () => {
    try {
      const [c, docs, fin, stages, consent] = await Promise.all([
        api.get<CaseItem>(`/api/cases/${id}`), api.get<CaseDocument[]>(`/api/cases/${id}/documents`),
        api.get<FinanceSummary>(`/api/cases/${id}/finance-summary`), api.get<Stage[]>(`/api/cases/${id}/stages`),
        api.get<Consent[]>(`/api/cases/${id}/consent`),
      ])
      setData({ c, docs, fin, stages, consent }); setError('')
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not load this case') }
  }, [api, id])
  // Reload when the shared list changes (e.g. after editing in the form dialog).
  useEffect(() => { void load() }, [load, cases])

  if (error) return <div><a className="back" href={href({ name: 'beneficiaries' })}><ArrowLeft size={16} />{t('case.back')}</a><Notice tone="error">{error}</Notice></div>
  if (!data) return <div className="panel"><Skeleton lines={8} height={18} /></div>
  const { c, docs, fin, stages, consent } = data
  const idx = STATUSES.indexOf(c.status)
  const next = STATUSES[idx + 1]

  async function advance() {
    if (!next || !window.confirm(`Move ${c.beneficiary_name} to “${t(`status.${next}` as never)}”? This is recorded in the audit trail.`)) return
    try { await api.patch(`/api/cases/${c.id}`, { status: next }); await reloadCases(); toast('Stage updated') } catch (e) { toast(e instanceof Error ? e.message : 'Update failed', 'error') }
  }
  async function remove() {
    if (!window.confirm(`Delete the case for ${c.beneficiary_name}? Documents and history for this case will be removed. This cannot be undone.`)) return
    try { await api.del(`/api/cases/${c.id}`); await reloadCases(); toast('Case deleted'); go({ name: 'beneficiaries' }) } catch (e) { toast(e instanceof Error ? e.message : 'Delete failed', 'error') }
  }
  async function setConsent(given: boolean) {
    if (!given && !window.confirm('Record that the family has withdrawn consent? Processing should stop until it is given again.')) return
    try { await api.post(`/api/cases/${c.id}/consent`, { consent_given: given, consent_scope: 'case_processing', consent_text_version: 'v1' }); await reloadCases(); toast(given ? 'Consent recorded' : 'Withdrawal recorded') } catch (e) { toast(e instanceof Error ? e.message : 'Could not record consent', 'error') }
  }
  async function upload(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; e.target.value = ''
    if (!file) return
    setUploading(true)
    try { const fd = new FormData(); fd.append('file', file); await api.post(`/api/cases/${c.id}/documents`, fd); await load(); toast('Document uploaded — pending review') }
    catch (err) { toast(err instanceof Error ? err.message : 'Upload failed', 'error') } finally { setUploading(false) }
  }
  async function insights() {
    setPlanBusy(true)
    try { setPlan(await api.get<AgentPlan>(`/api/cases/${c.id}/agent-plan`)) } catch (e) { toast(e instanceof Error ? e.message : 'Could not generate insights', 'error') } finally { setPlanBusy(false) }
  }

  const covered = fin.estimated_cost ? Math.min(100, (fin.funding_confirmed / fin.estimated_cost) * 100) : 0
  const proposedPct = fin.estimated_cost ? Math.min(100 - covered, (fin.funding_proposed / fin.estimated_cost) * 100) : 0
  const stagesDone = stages.filter(s => ['completed', 'verified'].includes(s.status)).length

  return (
    <article className="casefile">
      <a className="back" href={href({ name: 'beneficiaries' })}><ArrowLeft size={16} />{t('case.back')}</a>

      <header className="cf-identity">
        <div className="cf-id-text">
          <p className="eyebrow">Case file · #{c.id}</p>
          <h1>{c.beneficiary_name}</h1>
          <p className="cf-place">{c.village}, {c.taluk} taluk{c.phone_last4 ? <> · phone ending {c.phone_last4}</> : null}</p>
          <div className="cf-tags"><StageTag status={c.status} /><ConsentTag status={c.consent_status} /></div>
          {canEdit && (
            <div className="cf-actions">
              {next && <button className="btn primary" onClick={advance} disabled={c.consent_status !== 'given'} title={c.consent_status !== 'given' ? 'Record consent before moving the case forward' : undefined}>Move to {t(`status.${next}` as never)} <ArrowRight size={16} /></button>}
              <button className="btn ghost" onClick={() => openCaseForm(c)}><Pencil size={15} />{t('common.edit')}</button>
              <button className="btn ghost danger" onClick={remove}><Trash2 size={15} />{t('common.delete')}</button>
            </div>
          )}
          {c.notes && <p className="cf-notes">“{c.notes}”</p>}
        </div>
        <div className="cf-house"><House level={statusLevel[c.status]} size={240} label={`House at stage: ${t(`status.${c.status}` as never)}`} /></div>
      </header>

      <section className="cf-journey" aria-labelledby="j-h">
        <h2 id="j-h" className="sec-title">{t('case.journey')}</h2>
        <Journey status={c.status} />
      </section>

      <div className="cf-grid">
        <section className="panel cf-docs" aria-labelledby="d-h">
          <div className="panel-head">
            <h2 id="d-h">{t('case.documents')} <span className="count-chip">{docs.length}</span></h2>
            {canEdit && <label className={`btn ghost small ${uploading ? 'busy' : ''}`}><FileUp size={15} />{uploading ? 'Uploading…' : t('case.upload')}<input type="file" accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg" onChange={upload} className="sr-only" /></label>}
          </div>
          {docs.length === 0 ? <Empty title={t('case.noDocs')} sub="Land records (RTC/pahani), sanction letters and bank details. PDF, PNG or JPEG up to 10 MB." /> : (
            <ul className="doc-list">
              {docs.map(d => (
                <li key={d.id}>
                  <FileText size={18} aria-hidden />
                  <span className="doc-name"><b>{d.original_name}</b><small>{bytes(d.size_bytes)} · {d.uploaded_by} · {dateShort(d.uploaded_at, lang)}</small></span>
                  <DocStatus status={d.verification_status} />
                </li>
              ))}
            </ul>
          )}
          {docs.length > 0 && <a className="link-btn" href={href({ name: 'verification', caseId: c.id })}>Open in verification desk <ArrowRight size={14} /></a>}
        </section>

        <section className="panel cf-fin" aria-labelledby="f-h">
          <div className="panel-head"><h2 id="f-h">{t('case.finance')}</h2><a className="link-btn" href={href({ name: 'finance', caseId: c.id })}>Plan <ArrowRight size={14} /></a></div>
          {fin.estimated_cost <= 0 ? <Empty title="No construction cost estimate yet." sub="Add an estimate to see what the assistance covers." mood="calm" /> : (
            <>
              <p className="fin-big">{inr(fin.funding_gap)}<small>still to find, of {inr(fin.estimated_cost)}</small></p>
              <div className="ledger-bar tall" role="img" aria-label={`Confirmed ${Math.round(covered)} percent, proposed ${Math.round(proposedPct)} percent`}>
                <i className="confirmed" style={{ width: `${covered}%` }} /><i className="proposed" style={{ width: `${proposedPct}%` }} />
              </div>
              <dl className="fin-rows">
                <div><dt><span className="key confirmed" />Confirmed</dt><dd>{inr(fin.funding_confirmed)}</dd></div>
                <div><dt><span className="key received" />of which received</dt><dd>{inr(fin.funding_received)}</dd></div>
                <div><dt><span className="key proposed" />Proposed · not counted</dt><dd>{inr(fin.funding_proposed)}</dd></div>
                <div><dt>Existing loan · liability</dt><dd>{inr(fin.existing_loans)}</dd></div>
              </dl>
              {fin.warnings.map(w => <p key={w} className="fine warn-line">{w}</p>)}
            </>
          )}
        </section>

        <section className="panel cf-build" aria-labelledby="b-h">
          <div className="panel-head"><h2 id="b-h">{t('case.construction')}</h2><a className="link-btn" href={href({ name: 'construction', caseId: c.id })}>Stages <ArrowRight size={14} /></a></div>
          {stages.length === 0 ? <Empty title={t('case.noStages')} sub="Create a stage plan from the construction page." mood="calm" /> : (
            <>
              <p className="muted">{stagesDone} of {stages.length} stages verified or complete</p>
              <ol className="milestones">
                {stages.map(s => (
                  <li key={s.id} className={`ms-${s.status}`}>
                    <span className="ms-dot" aria-hidden />
                    <span className="ms-name">{s.stage_name}</span>
                    <span className="ms-cost">{inr(s.planned_cost)}</span>
                    <Tag tone={s.status === 'completed' || s.status === 'verified' ? 'confirmed' : s.status === 'blocked' ? 'warn' : 'neutral'}>{t(`stage.${s.status}` as never)}</Tag>
                  </li>
                ))}
              </ol>
            </>
          )}
        </section>

        <section className="panel cf-consent" aria-labelledby="c-h">
          <div className="panel-head"><h2 id="c-h">{t('case.consent')}</h2><ConsentTag status={c.consent_status} /></div>
          <ol className="feed">
            {consent.length === 0 ? <li className="muted">No consent recorded.</li> : consent.map(x => (
              <li key={x.id}><span className="feed-dot" aria-hidden /><span><b>{x.consent_given ? 'Given' : 'Withdrawn'}</b> · {human(x.consent_scope)}<small>{x.recorded_by} · {dateShort(x.recorded_at, lang)}</small></span></li>
            ))}
          </ol>
          {canEdit && (c.consent_status === 'given'
            ? <button className="btn ghost small" onClick={() => setConsent(false)}><ShieldOff size={15} />Record withdrawal</button>
            : <button className="btn ghost small" onClick={() => setConsent(true)}><ShieldCheck size={15} />Record consent</button>)}
        </section>

        <section className="panel cf-insights" aria-labelledby="i-h">
          <div className="panel-head"><h2 id="i-h">{t('case.insights')}</h2><Tag tone="ai" icon={<ClipboardCheck size={12} />}>Rule-based suggestions</Tag></div>
          {!plan ? (
            <div className="insight-start">
              <p className="muted">Checks documents, funding and construction records for gaps, and lists what to do next with the evidence behind each suggestion.</p>
              <button className="btn ghost" onClick={insights} disabled={planBusy}><ClipboardCheck size={15} />{planBusy ? 'Reviewing…' : 'Review this case'}</button>
            </div>
          ) : (
            <>
              <ul className="insight-list">
                {plan.case_manager.priority_actions.length === 0 ? <li className="muted">No open actions found in the records.</li> : plan.case_manager.priority_actions.map((a, i) => (
                  <li key={i} className={`ins-${a.priority}`}>
                    <span className="ins-pri">{a.priority}</span>
                    <div><b>{a.action}</b><p>{a.reason}</p>{a.evidence.length > 0 && <small>Evidence: {a.evidence.join(', ')}</small>}</div>
                  </li>
                ))}
              </ul>
              <p className="fine">{plan.approval_gate.message}</p>
            </>
          )}
        </section>
      </div>
    </article>
  )
}

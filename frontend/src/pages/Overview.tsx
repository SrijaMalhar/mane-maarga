import PublicFigures from '../components/PublicFigures'
import Answer from '../components/Answer'
import { useEffect, useMemo, useState } from 'react'
import { ArrowRight, Plus } from 'lucide-react'
import House, { statusLevel } from '../components/House'
import { ConsentTag, Empty, Notice, PageHead, Skeleton, StageTag } from '../components/ui'
import { STATUSES, type AuditEntry, type CaseItem } from '../lib/api'
import { href, useApp } from '../lib/app-context'
import { useI18n } from '../lib/i18n'
import { inr, inrShort, timeAgo, human } from '../lib/format'

export type Attention = { c: CaseItem; reason: string; vars?: Record<string, string>; tone: 'high' | 'medium' }

/** Derive what needs a human decision from fields the backend actually stores. */
export function attentionFor(c: CaseItem): Attention | null {
  if (c.consent_status === 'withdrawn') return { c, reason: 'att.withdrawn', tone: 'high' }
  if (c.consent_status !== 'given') return { c, reason: 'att.noConsent', tone: 'high' }
  if (['finance_review', 'construction'].includes(c.status) && Number(c.estimated_cost) <= 0) return { c, reason: 'att.noEstimate', tone: 'medium' }
  if (['finance_review', 'construction'].includes(c.status) && Number(c.gap_amount) > 0) return { c, reason: 'att.gap', vars: { amount: inr(c.gap_amount) }, tone: Number(c.gap_amount) > 100000 ? 'high' : 'medium' }
  return null
}

const ACTION: Record<string, string> = { 'att.withdrawn': 'Review consent', 'att.noConsent': 'Record consent', 'att.noEstimate': 'Add an estimate', 'att.gap': 'Plan the gap' }

/** Collapse repeated audit entries ("Case created" nine times) into one line with a count. */
function grouped(entries: AuditEntry[]) {
  const out: Array<{ a: AuditEntry; n: number; cases: number[] }> = []
  for (const e of entries) {
    const last = out[out.length - 1]
    if (last && last.a.action === e.action) { last.n++; if (e.case_id) last.cases.push(e.case_id) } else out.push({ a: e, n: 1, cases: e.case_id ? [e.case_id] : [] })
  }
  return out
}

export default function Overview() {
  const { cases, casesLoading, casesError, reloadCases, openCaseForm, canEdit, isAdmin, api } = useApp()
  const { t } = useI18n()
  const [audit, setAudit] = useState<AuditEntry[] | null>(null)
  useEffect(() => { if (isAdmin) api.get<AuditEntry[]>('/api/audit').then(a => setAudit(a.slice(0, 30))).catch(() => setAudit([])) }, [api, isAdmin, cases.length])

  const byStage = useMemo(() => STATUSES.map(s => ({ s, list: cases.filter(c => c.status === s) })), [cases])
  const attention = useMemo(() => cases.map(attentionFor).filter(Boolean).sort((a, b) => (a!.tone === 'high' ? -1 : 1) - (b!.tone === 'high' ? -1 : 1)) as Attention[], [cases])
  const totals = useMemo(() => cases.reduce((acc, c) => ({ est: acc.est + Number(c.estimated_cost || 0), sanc: acc.sanc + Number(c.sanctioned_amount || 0), gap: acc.gap + Number(c.gap_amount || 0) }), { est: 0, sanc: 0, gap: 0 }), [cases])
  const n = cases.length
  const done = cases.filter(c => c.status === 'completed').length
  const building = cases.filter(c => c.status === 'construction').length
  const title = n === 0 ? t('overview.titleZero') : n === 1 ? t('overview.titleOne') : t('overview.title', { n })

  return (
    <div className="overview">
      <PageHead eyebrow={t('overview.eyebrow')} title={casesLoading && !n ? '…' : title}
        actions={canEdit && <button className="btn primary" onClick={() => openCaseForm()}><Plus size={16} />{t('overview.add')}</button>} />
      {casesError && <Notice tone="error">{casesError} <button className="link-btn" onClick={() => void reloadCases()}>{t('common.retry')}</button></Notice>}

      {n > 0 && (
        <Answer kn={attention.length ? `ಇಂದು ${attention.length} ಕುಟುಂಬಗಳಿಗೆ ನಿರ್ಧಾರ ಬೇಕು` : 'ಇಂದು ಯಾವ ಕುಟುಂಬಕ್ಕೂ ತುರ್ತು ನಿರ್ಧಾರ ಬೇಕಿಲ್ಲ'}
          figs={[
            { label: 'Still to find, across all homes', value: inr(totals.gap), tone: totals.gap > 0 ? 'warn' : 'good' },
            { label: 'Being built now', value: `${building} of ${n}` },
            { label: 'Keys handed over', value: `${done} of ${n}`, tone: 'good' },
          ]}>
          {attention.length
            ? <><span className="num">{attention.length}</span> {attention.length === 1 ? 'family needs' : 'families need'} a decision from you today.</>
            : <>No family is waiting on a decision today.</>}
        </Answer>
      )}

      {/* Journey strip: one column per stage, a house drawn to that stage, and the families in it */}
      <section className="strip" aria-label={t('overview.journey')}>
        {byStage.map(({ s, list }, i) => (
          <a key={s} className={`strip-col ${list.length ? '' : 'empty-col'}`} href={href({ name: 'beneficiaries' })} onClick={() => sessionStorage.setItem('mm_stage_filter', s)}>
            <span className="strip-step">{String(i + 1).padStart(2, '0')}</span>
            <House level={statusLevel[s]} size={84} label={t(`status.${s}` as never)} />
            <span className="strip-count">{casesLoading ? '–' : list.length}</span>
            <span className="strip-label">{t(`status.${s}` as never)}</span>
            <span className="strip-bar" aria-hidden><i style={{ width: `${n ? (list.length / n) * 100 : 0}%` }} /></span>
          </a>
        ))}
      </section>

      <div className="ov-main">
        <section className="ov-decide" aria-labelledby="att-h">
          <h2 id="att-h" className="ov-h">{t('overview.attention')}</h2>
          {casesLoading && !n ? <Skeleton lines={4} /> : n === 0 ? (
            <Empty title={t('list.empty')} sub={t('list.emptySub')} action={canEdit ? <button className="btn primary" onClick={() => openCaseForm()}><Plus size={16} />{t('overview.add')}</button> : undefined} />
          ) : attention.length === 0 ? <Empty mood="happy" title={t('overview.attentionNone')} /> : (
            <ul className="decide-list">
              {attention.slice(0, 7).map(({ c, reason, vars, tone }) => (
                <li key={c.id} className={tone}>
                  <a href={reason === 'att.gap' ? href({ name: 'finance', caseId: c.id }) : href({ name: 'case', id: c.id })}>
                    <span className="decide-who"><b>{c.beneficiary_name}</b><small>{c.village}, {c.taluk}</small></span>
                    <span className="decide-why">{t(reason as never, vars)}</span>
                    <span className="decide-do">{ACTION[reason] ?? 'Open'} <ArrowRight size={15} aria-hidden /></span>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </section>

        <aside className="ov-side">
          <section aria-labelledby="money-h">
            <h2 id="money-h" className="ov-h">{t('overview.money')} <span className="tag tag-estimate">Indicative</span></h2>
            <div className="ledger-bar tall" role="img" aria-label={`Sanctioned ${inrShort(totals.sanc)} of estimated ${inrShort(totals.est)}`}>
              <i className="confirmed" style={{ width: `${totals.est ? Math.min(100, (totals.sanc / totals.est) * 100) : 0}%` }} />
              <i className="gap" style={{ width: `${totals.est ? Math.min(100, (totals.gap / totals.est) * 100) : 0}%` }} />
            </div>
            <dl className="ledger">
              <div><dt>{t('overview.estimated')}</dt><dd>{inr(totals.est)}</dd></div>
              <div><dt><span className="key confirmed" />{t('overview.sanctioned')}</dt><dd>{inr(totals.sanc)}</dd></div>
              <div className="ledger-gap"><dt><span className="key gap" />{t('overview.gap')}</dt><dd>{inr(totals.gap)}</dd></div>
            </dl>
            <a className="link-btn" href={href({ name: 'finance' })}>{t('nav.finance')} <ArrowRight size={14} /></a>
          </section>

          <section aria-labelledby="act-h">
            <h2 id="act-h" className="ov-h">{t('overview.activity')}</h2>
            {isAdmin ? (audit === null ? <Skeleton lines={4} /> : audit.length === 0 ? <p className="muted">No activity recorded yet.</p> : (
              <ol className="feed">
                {grouped(audit).slice(0, 5).map(({ a, n: count, cases: ids }) => (
                  <li key={a.id}><span className="feed-dot" aria-hidden /><span><b>{human(a.action)}{count > 1 ? ` · ${count} times` : ''}</b>
                    {count === 1 && a.case_id ? <> · <a href={href({ name: 'case', id: a.case_id })}>case #{a.case_id}</a></> : null}
                    {count > 1 && ids.length > 0 ? <> · cases #{Math.min(...ids)} to #{Math.max(...ids)}</> : null}
                    <small>{a.actor} · {timeAgo(a.created_at)}</small></span></li>
                ))}
              </ol>
            )) : (
              <ol className="feed">
                {cases.slice(0, 5).map(c => (
                  <li key={c.id}><span className="feed-dot" aria-hidden /><span><a href={href({ name: 'case', id: c.id })}><b>{c.beneficiary_name}</b></a> <StageTag status={c.status} /><small><ConsentTag status={c.consent_status} /></small></span></li>
                ))}
              </ol>
            )}
            {isAdmin && <a className="link-btn" href={href({ name: 'audit' })}>{t('nav.audit')} <ArrowRight size={14} /></a>}
          </section>
        </aside>
      </div>

      <PublicFigures variant="line" />
    </div>
  )
}

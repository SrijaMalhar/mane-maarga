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

export default function Overview() {
  const { cases, casesLoading, casesError, reloadCases, openCaseForm, canEdit, isAdmin, api } = useApp()
  const { t } = useI18n()
  const [audit, setAudit] = useState<AuditEntry[] | null>(null)
  useEffect(() => { if (isAdmin) api.get<AuditEntry[]>('/api/audit').then(a => setAudit(a.slice(0, 7))).catch(() => setAudit([])) }, [api, isAdmin, cases.length])

  const byStage = useMemo(() => STATUSES.map(s => ({ s, list: cases.filter(c => c.status === s) })), [cases])
  const attention = useMemo(() => cases.map(attentionFor).filter(Boolean).sort((a, b) => (a!.tone === 'high' ? -1 : 1) - (b!.tone === 'high' ? -1 : 1)) as Attention[], [cases])
  const totals = useMemo(() => cases.reduce((acc, c) => ({ est: acc.est + Number(c.estimated_cost || 0), sanc: acc.sanc + Number(c.sanctioned_amount || 0), gap: acc.gap + Number(c.gap_amount || 0) }), { est: 0, sanc: 0, gap: 0 }), [cases])
  const n = cases.length
  const title = n === 0 ? t('overview.titleZero') : n === 1 ? t('overview.titleOne') : t('overview.title', { n })

  return (
    <div className="overview">
      <PageHead eyebrow={t('overview.eyebrow')} title={casesLoading && !n ? '…' : title} lead={t('overview.lead')}
        actions={canEdit && <button className="btn primary" onClick={() => openCaseForm()}><Plus size={16} />{t('overview.add')}</button>} />
      {casesError && <Notice tone="error">{casesError} <button className="link-btn" onClick={() => void reloadCases()}>{t('common.retry')}</button></Notice>}

      {/* Journey strip: one column per stage, a house drawn to that stage, and the families in it */}
      <section className="strip" aria-label={t('overview.journey')}>
        {byStage.map(({ s, list }, i) => (
          <a key={s} className={`strip-col ${list.length ? '' : 'empty-col'}`} href={href({ name: 'beneficiaries' })} onClick={() => sessionStorage.setItem('mm_stage_filter', s)}>
            <span className="strip-step">{String(i + 1).padStart(2, '0')}</span>
            <House level={statusLevel[s] + (s === 'verified' ? 0 : 0)} size={84} label={t(`status.${s}` as never)} />
            <span className="strip-count">{casesLoading ? '–' : list.length}</span>
            <span className="strip-label">{t(`status.${s}` as never)}</span>
            <span className="strip-bar" aria-hidden><i style={{ width: `${n ? (list.length / n) * 100 : 0}%` }} /></span>
          </a>
        ))}
      </section>

      <div className="overview-grid">
        <section className="panel attention" aria-labelledby="att-h">
          <div className="panel-head"><h2 id="att-h">{t('overview.attention')}</h2><span className="count-chip">{attention.length}</span></div>
          {casesLoading && !n ? <Skeleton lines={4} /> : n === 0 ? (
            <Empty title={t('list.empty')} sub={t('list.emptySub')} action={canEdit ? <button className="btn primary" onClick={() => openCaseForm()}><Plus size={16} />{t('overview.add')}</button> : undefined} />
          ) : attention.length === 0 ? <Empty mood="happy" title={t('overview.attentionNone')} /> : (
            <ul className="att-list">
              {attention.slice(0, 7).map(({ c, reason, vars, tone }) => (
                <li key={c.id}>
                  <a href={href({ name: 'case', id: c.id })} className="att-row">
                    <span className={`att-mark ${tone}`} aria-label={t(tone === 'high' ? 'att.high' : 'att.medium')}>{tone === 'high' ? '!!' : '!'}</span>
                    <span className="att-main"><b>{c.beneficiary_name}</b><small>{c.village}, {c.taluk}</small></span>
                    <span className="att-reason">{t(reason as never, vars)}</span>
                    <ArrowRight size={16} aria-hidden />
                  </a>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="panel money" aria-labelledby="money-h">
          <div className="panel-head"><h2 id="money-h">{t('overview.money')}</h2><span className="tag tag-estimate">Indicative</span></div>
          <dl className="ledger">
            <div><dt>{t('overview.estimated')}</dt><dd>{inr(totals.est)}</dd></div>
            <div><dt><span className="key confirmed" />{t('overview.sanctioned')}</dt><dd>{inr(totals.sanc)}</dd></div>
            <div className="ledger-gap"><dt><span className="key gap" />{t('overview.gap')}</dt><dd>{inr(totals.gap)}</dd></div>
          </dl>
          <div className="ledger-bar" role="img" aria-label={`Sanctioned ${inrShort(totals.sanc)} of estimated ${inrShort(totals.est)}`}>
            <i className="confirmed" style={{ width: `${totals.est ? Math.min(100, (totals.sanc / totals.est) * 100) : 0}%` }} />
            <i className="gap" style={{ width: `${totals.est ? Math.min(100, (totals.gap / totals.est) * 100) : 0}%` }} />
          </div>
          <p className="fine">{t('overview.gapNote')} <a href={href({ name: 'finance' })}>{t('nav.finance')}</a></p>
        </section>

        <section className="panel activity" aria-labelledby="act-h">
          <div className="panel-head"><h2 id="act-h">{t('overview.activity')}</h2>{isAdmin && <a className="link-btn" href={href({ name: 'audit' })}>{t('nav.audit')} <ArrowRight size={14} /></a>}</div>
          {isAdmin ? (audit === null ? <Skeleton lines={5} /> : audit.length === 0 ? <p className="muted">No activity recorded yet.</p> : (
            <ol className="feed">
              {audit.map(a => (
                <li key={a.id}><span className="feed-dot" aria-hidden /><span><b>{human(a.action)}</b>{a.case_id ? <> · <a href={href({ name: 'case', id: a.case_id })}>case #{a.case_id}</a></> : null}<small>{a.actor} · {timeAgo(a.created_at)}</small></span></li>
              ))}
            </ol>
          )) : (
            <ol className="feed">
              {cases.slice(0, 6).map(c => (
                <li key={c.id}><span className="feed-dot" aria-hidden /><span><a href={href({ name: 'case', id: c.id })}><b>{c.beneficiary_name}</b></a> <StageTag status={c.status} /><small><ConsentTag status={c.consent_status} /></small></span></li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </div>
  )
}

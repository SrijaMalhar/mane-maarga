import { useMemo, useState } from 'react'
import { Plus, Search, Rows3, Rows4, MapPinned } from 'lucide-react'
import { ConsentTag, Empty, Journey, Notice, PageHead, Skeleton, StageTag } from '../components/ui'
import { STATUSES, type CaseItem, type Status } from '../lib/api'
import { href, useApp } from '../lib/app-context'
import { useI18n } from '../lib/i18n'
import { initials, inr } from '../lib/format'
import { attentionFor } from './Overview'

type View = 'compact' | 'detailed' | 'village'

export default function Beneficiaries() {
  const { cases, casesLoading, casesError, reloadCases, openCaseForm, canEdit } = useApp()
  const { t } = useI18n()
  const [q, setQ] = useState('')
  const [stage, setStage] = useState<Status | ''>(() => { const s = sessionStorage.getItem('mm_stage_filter') as Status | null; sessionStorage.removeItem('mm_stage_filter'); return s ?? '' })
  const [consent, setConsent] = useState('')
  const [taluk, setTaluk] = useState('')
  const [view, setView] = useState<View>(() => (localStorage.getItem('mm_view') as View) || 'detailed')
  const pickView = (v: View) => { setView(v); try { localStorage.setItem('mm_view', v) } catch { /* ignore */ } }

  const taluks = useMemo(() => [...new Set(cases.map(c => c.taluk))].sort(), [cases])
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return cases.filter(c =>
      (!needle || `${c.beneficiary_name} ${c.village} ${c.taluk} #${c.id}`.toLowerCase().includes(needle)) &&
      (!stage || c.status === stage) && (!consent || (c.consent_status || 'pending') === consent) && (!taluk || c.taluk === taluk))
  }, [cases, q, stage, consent, taluk])
  const villages = useMemo(() => {
    const m = new Map<string, CaseItem[]>()
    filtered.forEach(c => { const k = `${c.village} · ${c.taluk}`; m.set(k, [...(m.get(k) ?? []), c]) })
    return [...m.entries()].sort((a, b) => b[1].length - a[1].length)
  }, [filtered])

  return (
    <div>
      <PageHead eyebrow={`${cases.length} households`} title={t('list.title')} lead={t('list.lead')}
        actions={canEdit && <button className="btn primary" onClick={() => openCaseForm()}><Plus size={16} />{t('overview.add')}</button>} />
      {casesError && <Notice tone="error">{casesError} <button className="link-btn" onClick={() => void reloadCases()}>{t('common.retry')}</button></Notice>}

      <div className="toolbar" role="search">
        <label className="search"><Search size={16} aria-hidden /><span className="sr-only">{t('common.search')}</span><input value={q} onChange={e => setQ(e.target.value)} placeholder={t('list.searchPh')} /></label>
        <select aria-label="Journey stage" value={stage} onChange={e => setStage(e.target.value as Status | '')}><option value="">{t('common.all')} · stage</option>{STATUSES.map(s => <option key={s} value={s}>{t(`status.${s}` as never)}</option>)}</select>
        <select aria-label="Consent" value={consent} onChange={e => setConsent(e.target.value)}><option value="">{t('common.all')} · consent</option><option value="given">{t('consent.given')}</option><option value="pending">{t('consent.pending')}</option><option value="withdrawn">{t('consent.withdrawn')}</option></select>
        <select aria-label="Taluk" value={taluk} onChange={e => setTaluk(e.target.value)}><option value="">{t('common.all')} · taluk</option>{taluks.map(x => <option key={x}>{x}</option>)}</select>
        <div className="seg" role="group" aria-label="View">
          <button aria-pressed={view === 'compact'} onClick={() => pickView('compact')}><Rows4 size={15} />{t('list.compact')}</button>
          <button aria-pressed={view === 'detailed'} onClick={() => pickView('detailed')}><Rows3 size={15} />{t('list.detailed')}</button>
          <button aria-pressed={view === 'village'} onClick={() => pickView('village')}><MapPinned size={15} />{t('list.byVillage')}</button>
        </div>
      </div>
      <p className="result-count" aria-live="polite">{filtered.length} / {cases.length}</p>

      {casesLoading && !cases.length ? <div className="panel"><Skeleton lines={6} height={18} /></div>
        : cases.length === 0 ? <div className="panel"><Empty title={t('list.empty')} sub={t('list.emptySub')} action={canEdit ? <button className="btn primary" onClick={() => openCaseForm()}><Plus size={16} />{t('overview.add')}</button> : undefined} /></div>
          : filtered.length === 0 ? <div className="panel"><Empty mood="calm" title={t('list.noMatch')} /></div>
            : view === 'village' ? (
              <div className="villages">
                {villages.map(([v, list]) => (
                  <section key={v} className="village">
                    <h2><span>{v}</span><small>{list.length}</small></h2>
                    <ul>{list.map(c => <li key={c.id}><a href={href({ name: 'case', id: c.id })}><span className="avatar sm">{initials(c.beneficiary_name)}</span><b>{c.beneficiary_name}</b><StageTag status={c.status} /></a></li>)}</ul>
                  </section>
                ))}
              </div>
            ) : (
              <div className={`roster ${view}`}>
                <div className="roster-head" aria-hidden>
                  <span>Family</span><span>Location</span><span>Journey</span>{view === 'detailed' && <><span className="num">Estimate</span><span className="num">Gap</span></>}<span>Consent</span>
                </div>
                <ul>
                  {filtered.map(c => {
                    const att = attentionFor(c)
                    return (
                      <li key={c.id}>
                        <a className="roster-row" href={href({ name: 'case', id: c.id })}>
                          <span className="r-family"><span className="avatar">{initials(c.beneficiary_name)}</span><span><b>{c.beneficiary_name}</b><small>#{c.id}{c.phone_last4 ? ` · ••${c.phone_last4}` : ''}</small></span></span>
                          <span className="r-loc"><b>{c.village}</b><small>{c.taluk}</small></span>
                          <span className="r-journey">{view === 'detailed' ? <Journey status={c.status} compact /> : null}<StageTag status={c.status} /></span>
                          {view === 'detailed' && <><span className="num">{Number(c.estimated_cost) ? inr(c.estimated_cost) : '—'}</span><span className={`num ${Number(c.gap_amount) > 0 ? 'gap-amt' : ''}`}>{Number(c.estimated_cost) ? inr(c.gap_amount) : '—'}</span></>}
                          <span className="r-consent"><ConsentTag status={c.consent_status} />{att && view === 'detailed' && <small className={`r-att ${att.tone}`}>{t(att.reason as never, att.vars)}</small>}</span>
                        </a>
                      </li>
                    )
                  })}
                </ul>
              </div>
            )}
    </div>
  )
}

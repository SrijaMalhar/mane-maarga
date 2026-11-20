import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Check, Circle, CircleDashed, X, AlertTriangle, Clock3, CheckCircle2, XCircle, Info } from 'lucide-react'
import House from './House'
import { STATUSES, type Status } from '../lib/api'
import { useI18n } from '../lib/i18n'

/* ----- Journey: Intake → Verification → Planning → Financial assistance → Construction → Completion ----- */
export function Journey({ status, compact = false }: { status: Status; compact?: boolean }) {
  const { t } = useI18n()
  const current = STATUSES.indexOf(status)
  return (
    <ol className={`journey ${compact ? 'compact' : ''}`} aria-label={t('case.journey')}>
      {STATUSES.map((s, i) => {
        const state = i < current || status === 'completed' ? 'done' : i === current ? 'current' : 'next'
        return (
          <li key={s} className={state} aria-current={state === 'current' ? 'step' : undefined}>
            <span className="journey-node" aria-hidden>{state === 'done' ? <Check size={compact ? 10 : 13} strokeWidth={3} /> : i + 1}</span>
            {!compact && <span className="journey-label">{t(`status.${s}` as never)}</span>}
            {compact && <span className="sr-only">{t(`status.${s}` as never)}: {state}</span>}
          </li>
        )
      })}
    </ol>
  )
}

/* ----- Status markers: always icon + words, never colour alone ----- */
const docIcon = { pending: Clock3, verified: CheckCircle2, rejected: XCircle } as const
export function DocStatus({ status }: { status: 'pending' | 'verified' | 'rejected' }) {
  const { t } = useI18n(); const Icon = docIcon[status] ?? Clock3
  return <span className={`tag tag-${status}`}><Icon size={13} aria-hidden />{t(`doc.${status}` as never)}</span>
}
export function ConsentTag({ status }: { status: string }) {
  const { t } = useI18n(); const s = ['given', 'withdrawn'].includes(status) ? status : 'pending'
  const Icon = s === 'given' ? Check : s === 'withdrawn' ? X : CircleDashed
  return <span className={`tag tag-consent-${s}`}><Icon size={12} aria-hidden />{t(`consent.${s}` as never)}</span>
}
export function StageTag({ status }: { status: Status }) {
  const { t } = useI18n()
  return <span className={`stage-tag st-${status}`}><Circle size={7} fill="currentColor" aria-hidden />{t(`status.${status}` as never)}</span>
}
export function Tag({ tone = 'neutral', children, icon }: { tone?: 'neutral' | 'estimate' | 'confirmed' | 'warn' | 'ai' | 'soon'; children: ReactNode; icon?: ReactNode }) {
  return <span className={`tag tag-${tone}`}>{icon}{children}</span>
}

/* ----- Empty, loading, error states ----- */
export function Empty({ title, sub, action, mood = 'plan' }: { title: string; sub?: string; action?: ReactNode; mood?: 'calm' | 'happy' | 'guide' | 'plan' }) {
  return (
    <div className="empty">
      <House level={mood === 'happy' ? 5 : 0} size={96} label="" />
      <p className="empty-title">{title}</p>
      {sub && <p className="empty-sub">{sub}</p>}
      {action}
    </div>
  )
}
export function Skeleton({ lines = 3, height = 14 }: { lines?: number; height?: number }) {
  return <div className="skeleton" aria-hidden>{Array.from({ length: lines }, (_, i) => <span key={i} style={{ height, width: `${92 - i * 14}%` }} />)}</div>
}
export function Loading({ label }: { label?: string }) {
  const { t } = useI18n()
  return <div className="loading" role="status"><span className="loading-path" aria-hidden><i /><i /><i /></span><span>{label ?? t('common.loading')}…</span></div>
}
export function Notice({ tone = 'info', children, onClose }: { tone?: 'info' | 'error' | 'success' | 'warn'; children: ReactNode; onClose?: () => void }) {
  const Icon = tone === 'error' ? XCircle : tone === 'success' ? CheckCircle2 : tone === 'warn' ? AlertTriangle : Info
  return (
    <div className={`notice notice-${tone}`} role={tone === 'error' ? 'alert' : 'status'}>
      <Icon size={16} aria-hidden /><div>{children}</div>
      {onClose && <button className="notice-close" onClick={onClose} aria-label="Dismiss"><X size={14} /></button>}
    </div>
  )
}

/* ----- Page header ----- */
export function PageHead({ eyebrow, title, lead, actions }: { eyebrow?: string; title: ReactNode; lead?: string; actions?: ReactNode }) {
  return (
    <header className="page-head">
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1>{title}</h1>
        {lead && <p className="lead">{lead}</p>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </header>
  )
}

/* ----- Modal dialog with focus handling ----- */
export function Dialog({ title, eyebrow, onClose, children, wide = false }: { title: string; eyebrow?: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null
    ref.current?.querySelector<HTMLElement>('input,select,textarea,button')?.focus()
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('keydown', onKey); prev?.focus() }
  }, [onClose])
  return (
    <div className="dialog-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className={`dialog ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-labelledby="dialog-title" ref={ref}>
        <div className="dialog-head">
          <div>{eyebrow && <p className="eyebrow">{eyebrow}</p>}<h2 id="dialog-title">{title}</h2></div>
          <button className="icon-btn" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  )
}

/* ----- Toast ----- */
export function useToast() {
  const [toast, setToast] = useState<{ text: string; tone: 'success' | 'error' } | null>(null)
  useEffect(() => { if (!toast) return; const id = setTimeout(() => setToast(null), 4200); return () => clearTimeout(id) }, [toast])
  const node = toast ? <div className={`toast toast-${toast.tone}`} role="status">{toast.tone === 'success' ? <CheckCircle2 size={16} /> : <XCircle size={16} />}{toast.text}</div> : null
  return { node, show: (text: string, tone: 'success' | 'error' = 'success') => setToast({ text, tone }) }
}

/* ----- Case picker used by finance, construction, intelligence ----- */
export function CasePicker({ cases, value, onChange, label }: { cases: Array<{ id: number; beneficiary_name: string; village: string }>; value: number | null; onChange: (id: number | null) => void; label?: string }) {
  const { t } = useI18n()
  return (
    <label className="field case-picker">
      <span>{label ?? t('common.selectCase')}</span>
      <select value={value ?? ''} onChange={e => onChange(e.target.value ? Number(e.target.value) : null)}>
        <option value="">—</option>
        {cases.map(c => <option key={c.id} value={c.id}>{c.beneficiary_name} · {c.village} (#{c.id})</option>)}
      </select>
    </label>
  )
}

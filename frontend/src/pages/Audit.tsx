import { useEffect, useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import { Empty, Notice, PageHead, Skeleton } from '../components/ui'
import { type AuditEntry } from '../lib/api'
import { href, useApp } from '../lib/app-context'
import { useI18n } from '../lib/i18n'
import { human, parseTime } from '../lib/format'

export default function Audit() {
  const { api, isAdmin } = useApp()
  const { t, lang } = useI18n()
  const [rows, setRows] = useState<AuditEntry[] | null>(null)
  const [err, setErr] = useState('')
  const [q, setQ] = useState('')
  useEffect(() => { if (isAdmin) api.get<AuditEntry[]>('/api/audit').then(setRows).catch(e => setErr(e.message)) }, [api, isAdmin])
  const shown = useMemo(() => (rows ?? []).filter(r => !q || `${r.action} ${r.actor} ${r.detail} ${r.case_id ?? ''}`.toLowerCase().includes(q.toLowerCase())), [rows, q])
  const byDay = useMemo(() => {
    const m = new Map<string, AuditEntry[]>()
    shown.forEach(r => { const d = parseTime(r.created_at) ? parseTime(r.created_at)!.toLocaleDateString(lang === 'kn' ? 'kn-IN' : 'en-IN', { weekday: 'short', day: 'numeric', month: 'short' }) : '—'; m.set(d, [...(m.get(d) ?? []), r]) })
    return [...m.entries()]
  }, [shown, lang])

  if (!isAdmin) return <div><PageHead title={t('audit.title')} /><Notice tone="warn">Only administrators can read the audit trail.</Notice></div>
  return (
    <div>
      <PageHead eyebrow="Latest 500 entries" title={t('audit.title')} lead={t('audit.lead')} />
      <div className="toolbar"><label className="search"><Search size={16} aria-hidden /><input value={q} onChange={e => setQ(e.target.value)} placeholder="Filter by action, person or case" aria-label="Filter audit" /></label></div>
      {err && <Notice tone="error">{err}</Notice>}
      {!rows ? <div className="panel"><Skeleton lines={8} /></div> : shown.length === 0 ? <div className="panel"><Empty mood="calm" title="No matching entries." /></div> : (
        <div className="ledger-book">
          {byDay.map(([day, list]) => (
            <section key={day}>
              <h2 className="ledger-day">{day}</h2>
              <table className="ledger-table">
                <thead><tr><th scope="col">Time</th><th scope="col">Action</th><th scope="col">Case</th><th scope="col">By</th><th scope="col">Detail</th></tr></thead>
                <tbody>{list.map(r => (
                  <tr key={r.id}>
                    <td className="mono">{parseTime(r.created_at) ? parseTime(r.created_at)!.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '—'}</td>
                    <td><b>{human(r.action)}</b></td>
                    <td>{r.case_id ? <a href={href({ name: 'case', id: r.case_id })}>#{r.case_id}</a> : '—'}</td>
                    <td>{r.actor}</td>
                    <td className="mono small">{r.detail}</td>
                  </tr>
                ))}</tbody>
              </table>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}

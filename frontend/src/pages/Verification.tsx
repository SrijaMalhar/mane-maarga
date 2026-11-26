import { useCallback, useEffect, useMemo, useState } from 'react'
import { CheckCircle2, XCircle, ScanText, MessageSquareWarning, FileText, ExternalLink } from 'lucide-react'
import { DocStatus, Empty, Notice, PageHead, Skeleton } from '../components/ui'
import { RedPen } from '../components/ledger'
import Answer from '../components/Answer'
import { type AuditEntry, type CaseDocument, type CaseItem, type Extraction } from '../lib/api'
import { useApp } from '../lib/app-context'
import { useI18n } from '../lib/i18n'
import { bytes, dateShort, timeAgo, human } from '../lib/format'

type QDoc = CaseDocument & { c: CaseItem }
const order = { pending: 0, rejected: 1, verified: 2 }

export default function Verification({ initialCase }: { initialCase?: number }) {
  const { api, cases, canEdit, isAdmin, toast } = useApp()
  const { t, lang } = useI18n()
  const [docs, setDocs] = useState<QDoc[] | null>(null)
  const [filter, setFilter] = useState<'pending' | 'all'>('pending')
  const [sel, setSel] = useState<number | null>(null)
  const [preview, setPreview] = useState<{ url: string; type: string } | null>(null)
  const [ext, setExt] = useState<Extraction | null>(null)
  const [extErr, setExtErr] = useState('')
  const [busy, setBusy] = useState('')
  const [history, setHistory] = useState<AuditEntry[]>([])

  const scope = useMemo(() => (initialCase ? cases.filter(c => c.id === initialCase) : cases).slice(0, 60), [cases, initialCase])
  const loadQueue = useCallback(async () => {
    const lists = await Promise.all(scope.map(c => api.get<CaseDocument[]>(`/api/cases/${c.id}/documents`).then(ds => ds.map(d => ({ ...d, c }))).catch(() => [] as QDoc[])))
    const all = lists.flat().sort((a, b) => order[a.verification_status] - order[b.verification_status] || (b.uploaded_at ?? '').localeCompare(a.uploaded_at ?? ''))
    setDocs(all)
    setSel(s => s ?? all[0]?.id ?? null)
  }, [api, scope])
  useEffect(() => { void loadQueue() }, [loadQueue])

  const current = docs?.find(d => d.id === sel) ?? null
  const visible = (docs ?? []).filter(d => filter === 'all' || d.verification_status === 'pending')

  // Preview: fetch the file with the auth header, show it from a local object URL.
  useEffect(() => {
    if (!current) return
    let url = ''; let cancelled = false
    setPreview(null); setExt(null); setExtErr('')
    api.raw(`/api/documents/${current.id}/download`).then(async r => {
      if (!r.ok || cancelled) return
      url = URL.createObjectURL(await r.blob()); setPreview({ url, type: current.content_type })
    }).catch(() => {})
    api.get<Extraction>(`/api/documents/${current.id}/extraction`).then(e => { if (!cancelled) setExt(e) }).catch(() => {})
    if (isAdmin) api.get<AuditEntry[]>(`/api/audit?case_id=${current.case_id}`).then(a => { if (!cancelled) setHistory(a.filter(x => x.detail.includes(`document_id=${current.id}`))) }).catch(() => setHistory([]))
    return () => { cancelled = true; if (url) URL.revokeObjectURL(url) }
  }, [api, current?.id, isAdmin]) // eslint-disable-line react-hooks/exhaustive-deps

  async function extract(force = false) {
    if (!current) return
    setBusy('extract'); setExtErr('')
    try { setExt(await api.post<Extraction>(`/api/documents/${current.id}/extract`, { force })) } catch (e) { setExtErr(e instanceof Error ? e.message : 'Could not read the document') } finally { setBusy('') }
  }
  async function decide(status: 'verified' | 'rejected', correction = false) {
    if (!current) return
    let note = ''
    if (correction) { note = window.prompt('What needs correcting? This creates a follow-up task on the case.') ?? ''; if (!note.trim()) return }
    setBusy(status)
    try {
      await api.json(`/api/documents/${current.id}/verification?status=${status}`, { method: 'PATCH' })
      if (correction) await api.post(`/api/cases/${current.case_id}/recovery-tasks`, { title: `Correct document: ${current.original_name}`, category: 'document', description: note })
      toast(correction ? 'Correction requested and task created' : status === 'verified' ? 'Marked verified' : 'Rejected')
      const nextPending = (docs ?? []).find(d => d.id !== current.id && d.verification_status === 'pending')
      await loadQueue(); if (nextPending) setSel(nextPending.id)
    } catch (e) { toast(e instanceof Error ? e.message : 'Could not update', 'error') } finally { setBusy('') }
  }

  const pendingCount = (docs ?? []).filter(d => d.verification_status === 'pending').length
  const rows = ext ? [
    ...ext.checks.map(ch => ({ field: ch.field, doc: ch.extracted ?? ext.extracted_fields[ch.field] ?? '', cas: ch.case_value ?? '', status: ch.status, message: ch.message })),
    ...Object.entries(ext.extracted_fields).filter(([k]) => !ext.checks.some(ch => ch.field === k)).map(([k, v]) => ({ field: k, doc: v, cas: '', status: 'only_document', message: '' })),
  ] : []
  const differ = rows.filter(r => r.status !== 'match' && r.status !== 'only_document').length
  const compared = rows.filter(r => r.status !== 'only_document').length

  const decisionButtons = canEdit && current && (
    <>
      <button className={`btn ${differ ? 'ghost' : 'primary'}`} onClick={() => decide('verified')} disabled={!!busy}><CheckCircle2 size={16} />{t('verify.approve')}</button>
      <button className={`btn ${differ ? 'primary' : 'ghost'}`} onClick={() => decide('rejected', true)} disabled={!!busy}><MessageSquareWarning size={16} />{t('verify.correction')}</button>
      <button className="btn ghost danger" onClick={() => decide('rejected')} disabled={!!busy}><XCircle size={16} />{t('verify.reject')}</button>
    </>
  )

  return (
    <div className="verify">
      <PageHead eyebrow={initialCase ? `Case #${initialCase}` : `${pendingCount} waiting for a reviewer`} title={t('verify.title')} />
      {docs === null ? <div className="panel"><Skeleton lines={6} /></div> : docs.length === 0 ? (
        <div className="panel"><Empty title={t('verify.empty')} sub="Documents uploaded on a case file appear here for review." /></div>
      ) : (
        <div className="vd">
          <aside className="vd-queue" aria-label={t('verify.queue')}>
            <div className="seg full" role="group" aria-label="Filter">
              <button aria-pressed={filter === 'pending'} onClick={() => setFilter('pending')}>{t('doc.pending')} · {pendingCount}</button>
              <button aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>{t('common.all')} · {docs.length}</button>
            </div>
            {visible.length === 0 ? <p className="muted pad">{t('verify.empty')}</p> : (
              <ul>
                {visible.map(d => (
                  <li key={d.id}>
                    <button className={`vq-item ${d.id === sel ? 'active' : ''}`} onClick={() => setSel(d.id)} aria-current={d.id === sel}>
                      <FileText size={17} aria-hidden />
                      <span><b>{d.original_name}</b><small>{d.c.beneficiary_name}</small></span>
                      <DocStatus status={d.verification_status} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </aside>

          {current && (
            <section className="vd-main" aria-label="Review">
              <header className="vd-head">
                <div>
                  <h2>{current.original_name}</h2>
                  <p className="muted">{current.c.beneficiary_name}, {current.c.village} · uploaded by {current.uploaded_by}, {dateShort(current.uploaded_at, lang)} · {bytes(current.size_bytes)}</p>
                </div>
                <DocStatus status={current.verification_status} />
              </header>

              {!ext ? (
                <Answer kn="ಈ ದಾಖಲೆಯನ್ನು ಇನ್ನೂ ಓದಿಲ್ಲ" action={canEdit && <button className="btn primary" onClick={() => extract()} disabled={busy === 'extract'}><ScanText size={16} />{busy === 'extract' ? 'Reading…' : t('verify.extract')}</button>}>
                  Read the document to compare it with {current.c.beneficiary_name.replace(' (sample)', '')}'s case file, field by field.
                </Answer>
              ) : (
                <Answer kn={differ ? `ಕಡತದೊಂದಿಗೆ ${differ} ವ್ಯತ್ಯಾಸ` : 'ಕಡತದೊಂದಿಗೆ ಹೊಂದುತ್ತದೆ'} action={decisionButtons}>
                  {differ
                    ? <><span className="num">{differ} of {compared}</span> fields differ from the case file. Check them before you decide.</>
                    : <>All <span className="num good">{compared}</span> compared fields match the case file.</>}
                </Answer>
              )}
              {extErr && <Notice tone="warn">{extErr}</Notice>}

              {ext && (
                <>
                  <table className="vd-compare">
                    <thead><tr><th>Field</th><th>In the document</th><th>In the case file</th><th>Result</th></tr></thead>
                    <tbody>
                      {rows.map(r => (
                        <tr key={r.field} className={r.status}>
                          <td>{human(r.field)}</td>
                          <td className="v">{r.status === 'mismatch' ? <RedPen was={r.doc} /> : r.doc || '—'}</td>
                          <td className="v">{r.status === 'mismatch' ? <RedPen now={r.cas} /> : r.cas || <span className="muted">not in case file</span>}</td>
                          <td className="res">{r.status === 'match' ? <span className="ok"><CheckCircle2 size={15} /> Match</span> : r.status === 'only_document' ? <span className="muted">Recorded only</span> : <span className="bad"><MessageSquareWarning size={15} /> {human(r.status)}</span>}{r.message && <small>{r.message}</small>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p className="vd-meta">Read as {human(ext.document_type).toLowerCase()} · {ext.engine} · confidence {Math.round(ext.confidence * 100)}%. Suggestions only; the reviewer decides. {canEdit && <button className="link-btn" onClick={() => extract(true)} disabled={busy === 'extract'}>Read again</button>}</p>
                </>
              )}
              {!ext && canEdit && <div className="vd-later">{decisionButtons}</div>}

              <details className="vd-doc">
                <summary>Show the document</summary>
                <div className="vd-preview">
                  {!preview ? <Skeleton lines={8} /> : preview.type === 'application/pdf'
                    ? <object data={preview.url} type="application/pdf" aria-label={current.original_name}><p className="muted pad">This browser can't show PDFs inline. <a href={preview.url} target="_blank" rel="noreferrer">Open the PDF <ExternalLink size={13} /></a></p></object>
                    : <img src={preview.url} alt={`Uploaded document: ${current.original_name}`} />}
                </div>
                {preview && <a className="link-btn" href={preview.url} target="_blank" rel="noreferrer">Open in a new tab <ExternalLink size={14} /></a>}
              </details>

              {isAdmin && history.length > 0 && (
                <div className="vd-history">
                  <h3>History</h3>
                  <ol className="feed small">{history.map(h => <li key={h.id}><span className="feed-dot" aria-hidden /><span>{human(h.action)} · {h.detail.split('; ').slice(1).join(', ')}<small>{h.actor} · {timeAgo(h.created_at)}</small></span></li>)}</ol>
                </div>
              )}
              {!canEdit && <p className="muted">{t('common.readOnly')}</p>}
            </section>
          )}
        </div>
      )}
    </div>
  )
}

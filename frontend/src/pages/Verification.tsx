import { useCallback, useEffect, useMemo, useState } from 'react'
import { CheckCircle2, XCircle, ScanText, MessageSquareWarning, FileText, ExternalLink } from 'lucide-react'
import { DocStatus, Empty, Notice, PageHead, Skeleton, Tag } from '../components/ui'
import { type AuditEntry, type CaseDocument, type CaseItem, type Extraction } from '../lib/api'
import { href, useApp } from '../lib/app-context'
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

  return (
    <div className="verify">
      <PageHead eyebrow={initialCase ? `Case #${initialCase}` : `${pendingCount} waiting`} title={t('verify.title')} lead={t('verify.lead')} />
      {docs === null ? <div className="panel"><Skeleton lines={6} /></div> : docs.length === 0 ? (
        <div className="panel"><Empty title={t('verify.empty')} sub="Documents uploaded on a case file appear here for review." /></div>
      ) : (
        <div className="desk">
          <aside className="desk-queue" aria-label={t('verify.queue')}>
            <div className="seg full" role="group" aria-label="Filter">
              <button aria-pressed={filter === 'pending'} onClick={() => setFilter('pending')}>{t('doc.pending')} · {pendingCount}</button>
              <button aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>{t('common.all')} · {docs.length}</button>
            </div>
            {visible.length === 0 ? <p className="muted pad">{t('verify.empty')}</p> : (
              <ul>
                {visible.map(d => (
                  <li key={d.id}>
                    <button className={`q-item ${d.id === sel ? 'active' : ''}`} onClick={() => setSel(d.id)} aria-current={d.id === sel}>
                      <FileText size={16} aria-hidden />
                      <span><b>{d.original_name}</b><small>{d.c.beneficiary_name} · {timeAgo(d.uploaded_at)}</small></span>
                      <DocStatus status={d.verification_status} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </aside>

          {current && (
            <>
              <section className="desk-preview" aria-label="Document preview">
                <div className="preview-bar"><b>{current.original_name}</b><small>{bytes(current.size_bytes)} · uploaded by {current.uploaded_by} · {dateShort(current.uploaded_at, lang)}</small>{preview && <a className="icon-btn" href={preview.url} target="_blank" rel="noreferrer" aria-label="Open in new tab"><ExternalLink size={16} /></a>}</div>
                <div className="preview-body">
                  {!preview ? <Skeleton lines={10} /> : preview.type === 'application/pdf'
                    ? <object data={preview.url} type="application/pdf" aria-label={current.original_name}><p className="muted pad">This browser can't show PDFs inline. <a href={preview.url} target="_blank" rel="noreferrer">Open the PDF</a>.</p></object>
                    : <img src={preview.url} alt={`Uploaded document: ${current.original_name}`} />}
                </div>
              </section>

              <section className="desk-review" aria-label="Review">
                <div className="review-block">
                  <h3>Case record</h3>
                  <dl className="kv">
                    <div><dt>Beneficiary</dt><dd>{current.c.beneficiary_name}</dd></div>
                    <div><dt>Village</dt><dd>{current.c.village}</dd></div>
                    <div><dt>Taluk</dt><dd>{current.c.taluk}</dd></div>
                  </dl>
                  <a className="link-btn" href={href({ name: 'case', id: current.c.id })}>{t('common.open')}</a>
                </div>

                <div className="review-block">
                  <div className="rb-head"><h3>Extracted fields</h3><Tag tone="ai">{t('verify.extracted')}</Tag></div>
                  {!ext ? (
                    <>
                      <p className="muted">Read the document to suggest fields and compare them with the case record.</p>
                      {canEdit && <button className="btn ghost small" onClick={() => extract()} disabled={busy === 'extract'}><ScanText size={15} />{busy === 'extract' ? 'Reading…' : t('verify.extract')}</button>}
                      {extErr && <Notice tone="warn">{extErr}</Notice>}
                    </>
                  ) : (
                    <>
                      <p className="fine">{human(ext.document_type)} · {ext.engine} · confidence {Math.round(ext.confidence * 100)}%</p>
                      {Object.keys(ext.extracted_fields).length === 0 ? <p className="muted">No supported fields found.</p> : (
                        <dl className="kv extracted">{Object.entries(ext.extracted_fields).map(([k, v]) => <div key={k}><dt>{human(k)}</dt><dd>{v}</dd></div>)}</dl>
                      )}
                      <ul className="checks">
                        {ext.checks.map((ch, i) => (
                          <li key={i} className={`check-${ch.status}`}>
                            {ch.status === 'match' ? <CheckCircle2 size={15} /> : <MessageSquareWarning size={15} />}
                            <span><b>{human(ch.field)}: {human(ch.status)}</b>{ch.extracted && <small>Document “{ch.extracted}” · Case “{ch.case_value}”</small>}{ch.message && <small>{ch.message}</small>}</span>
                          </li>
                        ))}
                      </ul>
                      {canEdit && <button className="link-btn" onClick={() => extract(true)} disabled={busy === 'extract'}>Read again</button>}
                    </>
                  )}
                </div>

                <div className="review-block decision">
                  <h3>Reviewer decision</h3>
                  <p className="muted">Current: <DocStatus status={current.verification_status} /></p>
                  {canEdit ? (
                    <div className="decision-btns">
                      <button className="btn primary" onClick={() => decide('verified')} disabled={!!busy}><CheckCircle2 size={16} />{t('verify.approve')}</button>
                      <button className="btn ghost" onClick={() => decide('rejected', true)} disabled={!!busy}><MessageSquareWarning size={16} />{t('verify.correction')}</button>
                      <button className="btn ghost danger" onClick={() => decide('rejected')} disabled={!!busy}><XCircle size={16} />{t('verify.reject')}</button>
                    </div>
                  ) : <p className="muted">{t('common.readOnly')}</p>}
                  {isAdmin && history.length > 0 && (
                    <ol className="feed small">{history.map(h => <li key={h.id}><span className="feed-dot" aria-hidden /><span>{human(h.action)} · {h.detail.split('; ').slice(1).join(', ')}<small>{h.actor} · {timeAgo(h.created_at)}</small></span></li>)}</ol>
                  )}
                </div>
              </section>
            </>
          )}
        </div>
      )}
    </div>
  )
}

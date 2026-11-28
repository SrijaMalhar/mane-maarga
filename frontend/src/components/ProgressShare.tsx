/* The family's progress page, from the case worker's side: make the link, show it as a QR code for the family
   to scan on the spot, send it, see whether it has been opened, and switch it off. */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { encode } from 'uqr'
import { Eye, ExternalLink, MessageSquareText, QrCode, RefreshCw, Smartphone, X } from 'lucide-react'
import { Notice, Tag } from './ui'
import { CopyButton } from './PlotPanel'
import FamilyProgress from '../pages/FamilyProgress'
import type { CaseItem, ProgressLink } from '../lib/api'
import { useApp } from '../lib/app-context'
import { dateShort, timeAgo } from '../lib/format'

/** A QR code as one SVG path, drawn in the app's ink so it prints cleanly on a field officer's handout. */
export function Qr({ text, size = 184, label }: { text: string; size?: number; label: string }) {
  const { d, n } = useMemo(() => {
    const qr = encode(text, { ecc: 'M', border: 2 })
    let path = ''
    qr.data.forEach((row, y) => row.forEach((dark, x) => { if (dark) path += `M${x} ${y}h1v1h-1z` }))
    return { d: path, n: qr.size }
  }, [text])
  return (
    <svg className="qr" width={size} height={size} viewBox={`0 0 ${n} ${n}`} role="img" aria-label={label} shapeRendering="crispEdges">
      <rect width={n} height={n} fill="#FFFFFF" /><path d={d} fill="#22211E" />
    </svg>
  )
}

export default function ProgressShare({ c }: { c: CaseItem }) {
  const { api, canEdit, toast, demo } = useApp()
  const [link, setLink] = useState<ProgressLink | null | undefined>(undefined)
  const [showMap, setShowMap] = useState(true)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [confirm, setConfirm] = useState<'rotate' | 'off' | null>(null)
  const [preview, setPreview] = useState(false)
  const load = useCallback(async () => {
    try { setLink(await api.get<ProgressLink | null>(`/api/cases/${c.id}/progress-link`)); setErr('') }
    catch (e) { setLink(null); setErr(e instanceof Error ? e.message : 'Could not load the family link') }
  }, [api, c.id])
  useEffect(() => { void load() }, [load])

  const url = link ? `${window.location.origin}${link.path}` : ''
  const consent = c.consent_status === 'given'
  const first = c.beneficiary_name.split(' ')[0]

  async function make(rotate = false) {
    setBusy(true)
    try {
      const l = await api.post<ProgressLink>(`/api/cases/${c.id}/progress-link`, { show_map: rotate && link ? link.show_map : showMap })
      setLink(l); setConfirm(null); setErr('')
      toast(rotate ? 'New link made. The old one no longer opens.' : `Family link ready. Show ${first} the QR code or send it.`)
    } catch (e) { setErr(e instanceof Error ? e.message : 'Could not make the link') } finally { setBusy(false) }
  }
  async function off() {
    setBusy(true)
    try { await api.del(`/api/cases/${c.id}/progress-link`); setLink(null); setConfirm(null); toast("Link switched off. The family's page no longer opens.") }
    catch (e) { setErr(e instanceof Error ? e.message : 'Could not switch the link off') } finally { setBusy(false) }
  }
  async function sms() {
    setBusy(true)
    try { const r = await api.post<{ sent_to: string }>(`/api/cases/${c.id}/progress-link/sms`); toast(`SMS queued to ${r.sent_to}. Simulated: see the outbox on the case file.`) }
    catch (e) { setErr(e instanceof Error ? e.message : 'Could not send the SMS') } finally { setBusy(false) }
  }
  function open() {
    // In the demo the page reads this tab's sample data, which a new tab only inherits when opened from here.
    if (demo) window.open(url, '_blank'); else window.open(url, '_blank', 'noopener')
  }

  if (link === undefined) return null
  return (
    <section className="panel share" aria-labelledby="share-h">
      <div className="share-head">
        <div>
          <p className="eyebrow">For the family</p>
          <h2 id="share-h"><Smartphone size={18} aria-hidden /> {first}'s progress page</h2>
          <p className="muted">A page {first} can open on any phone to watch the house being built: the drawing, each stage in Kannada, accepted photos{link?.show_map ?? showMap ? ' and the plot on a map' : ''}. It never shows money, documents or the phone number, and only verified work counts.</p>
        </div>
        {link && <Tag tone="confirmed">Live</Tag>}
      </div>

      {!link ? (
        <div className="share-make">
          {!consent && <Notice tone="warn">{first}'s consent is not on record, so the page cannot be shared. Record consent on the case file first.</Notice>}
          <label className="share-check"><input type="checkbox" checked={showMap} onChange={e => setShowMap(e.target.checked)} disabled={!canEdit} /><span><b>Show the plot on a map</b><small>With its DIGIPIN and directions, so relatives and suppliers can find it. Leave this off if the family would rather not share where they live.</small></span></label>
          {canEdit && <button className="btn primary" onClick={() => void make()} disabled={busy || !consent}><QrCode size={16} />{busy ? 'Making…' : 'Make a family link'}</button>}
        </div>
      ) : (
        <div className="share-live">
          <figure className="share-qr">
            <Qr text={url} label={`QR code for ${first}'s progress page`} />
            <figcaption>{first} points the phone camera here to open the page.</figcaption>
          </figure>
          <div className="share-body">
            <div className="share-url"><span className="mono">{url}</span><CopyButton text={url} label="Copy the family link" /></div>
            <dl className="share-stats">
              <div><dt>Opened</dt><dd>{link.views === 0 ? 'Not yet' : `${link.views} time${link.views === 1 ? '' : 's'}`}{link.last_viewed_at && <small>Last seen {timeAgo(link.last_viewed_at)}</small>}</dd></div>
              <div><dt>Plot on the page</dt><dd>{link.show_map ? 'Shown' : 'Hidden'}</dd></div>
              <div><dt>Made</dt><dd>{dateShort(link.created_at)}<small>by {link.created_by}</small></dd></div>
            </dl>
            <div className="share-actions">
              <button className="btn ghost small" onClick={() => setPreview(true)}><Eye size={15} />See what {first} sees</button>
              <button className="btn ghost small" onClick={open}><ExternalLink size={15} />Open</button>
              <a className="btn ghost small" href={`https://wa.me/?text=${encodeURIComponent(`ನಿಮ್ಮ ಮನೆ ಕೆಲಸ ಎಷ್ಟು ಆಗಿದೆ ಎಂದು ಇಲ್ಲಿ ನೋಡಿ. See how your house is coming along: ${url}`)}`} target="_blank" rel="noreferrer">WhatsApp</a>
              {canEdit && <button className="btn ghost small" onClick={() => void sms()} disabled={busy}><MessageSquareText size={15} />SMS <Tag>Simulated</Tag></button>}
            </div>
            {canEdit && (confirm ? (
              <div className="share-confirm" role="group" aria-label="Confirm">
                <p>{confirm === 'off' ? `Switch the link off? ${first}'s page stops opening at once, and this link can never be turned back on.` : "Make a new link? The old one stops opening, so anyone who has it, including the family, will need the new one."}</p>
                <div className="form-actions start">
                  <button className={`btn small ${confirm === 'off' ? 'danger-outline' : 'primary'}`} onClick={() => void (confirm === 'off' ? off() : make(true))} disabled={busy}>{confirm === 'off' ? 'Switch it off' : 'Make a new link'}</button>
                  <button className="btn ghost small" onClick={() => setConfirm(null)}>Keep this link</button>
                </div>
              </div>
            ) : (
              <div className="share-manage">
                <button className="link-btn" onClick={() => setConfirm('rotate')}><RefreshCw size={14} />New link</button>
                <button className="link-btn warn" onClick={() => setConfirm('off')}><X size={14} />Switch off</button>
              </div>
            ))}
          </div>
        </div>
      )}
      {err && <Notice tone="error">{err}</Notice>}

      {preview && link && (
        <div className="phone-preview" role="dialog" aria-modal="true" aria-label={`${first}'s progress page`} onClick={e => { if (e.target === e.currentTarget) { setPreview(false); void load() } }}>
          <div className="phone-frame"><FamilyProgress token={link.token} client={api} preview onClose={() => { setPreview(false); void load() }} /></div>
          <aside className="phone-hint"><b>This is {first}'s page</b> as it opens on a phone. It checks for new work every 30 seconds, so a stage you verify shows up there on its own. Looking at it from here does not count as the family opening it.</aside>
        </div>
      )}
    </section>
  )
}

/* "Where the house is being built": the plot on a real map, with the codes a family or a mason can use to find it.
   Moving the pin is deliberate: every site photo is checked against it, so the move is warned about and audited. */
import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { Check, Copy, LocateFixed, MapPin, MoveRight, Navigation, X } from 'lucide-react'
import { Notice, Skeleton } from './ui'
import type { CaseDocument, CaseItem, Evidence, Extraction, Stage } from '../lib/api'
import { useApp } from '../lib/app-context'
import { distanceM, FAR_M, NEAR_M } from '../lib/photo-check'
import { digipin, digipinDisplay } from '../lib/digipin'
import type { LatLon, MapPhoto } from './PlotMap'

const PlotMap = lazy(() => import('./PlotMap'))

export const fmtDistance = (m: number) => (m >= 1000 ? `${(m / 1000).toFixed(m >= 10000 ? 0 : 1)} km` : `${Math.round(m)} m`)
export const directionsUrl = (p: LatLon) => `https://www.google.com/maps/dir/?api=1&destination=${p[0]},${p[1]}`
export const osmUrl = (p: LatLon) => `https://www.openstreetmap.org/?mlat=${p[0]}&mlon=${p[1]}#map=18/${p[0]}/${p[1]}`
export const plotOf = (c: Pick<CaseItem, 'plot_lat' | 'plot_lon'>): LatLon | null => (c.plot_lat != null && c.plot_lon != null ? [Number(c.plot_lat), Number(c.plot_lon)] : null)

/** Copies text and shows a tick for a moment. */
export function CopyButton({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState(false)
  useEffect(() => { if (!done) return; const t = setTimeout(() => setDone(false), 1600); return () => clearTimeout(t) }, [done])
  return (
    <button type="button" className="icon-btn small" aria-label={done ? 'Copied' : label} title={label}
      onClick={() => { void navigator.clipboard?.writeText(text).then(() => setDone(true), () => window.prompt(label, text)) }}>
      {done ? <Check size={15} /> : <Copy size={15} />}
    </button>
  )
}

/** The survey number and extent from the family's land record, if one has been read. */
function useLandRecord(caseId: number) {
  const { api } = useApp()
  const [rec, setRec] = useState<{ survey: string; extent?: string; doc: string; verified: boolean } | null>(null)
  useEffect(() => {
    let live = true
    ;(async () => {
      try {
        const docs = await api.get<CaseDocument[]>(`/api/cases/${caseId}/documents`)
        const ordered = [...docs].sort((a, b) => Number(b.verification_status === 'verified') - Number(a.verification_status === 'verified'))
        for (const d of ordered) {
          if (d.verification_status === 'rejected') continue
          const ex = await api.get<Extraction>(`/api/documents/${d.id}/extraction`).catch(() => null)
          const f = ex?.extracted_fields
          if (ex?.document_type === 'land_record' && f?.survey_number) {
            if (live) setRec({ survey: f.survey_number, extent: f.extent, doc: d.original_name, verified: d.verification_status === 'verified' })
            return
          }
        }
      } catch { /* the land record is extra context; the map works without it */ }
    })()
    return () => { live = false }
  }, [api, caseId])
  return rec
}

export default function PlotPanel({ c, stages, evidence, onOpenPhoto, onPinSaved }: { c: CaseItem; stages: Stage[]; evidence: Evidence[]; onOpenPhoto?: (id: number) => void; onPinSaved?: () => void }) {
  const { api, canEdit, toast, reloadCases } = useApp()
  const plot = plotOf(c)
  const land = useLandRecord(c.id)
  const [moving, setMoving] = useState(false)
  const [candidate, setCandidate] = useState<LatLon | null>(null)
  const [accuracy, setAccuracy] = useState<{ at: LatLon; m: number } | null>(null)
  const [locating, setLocating] = useState(false)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  const photos: MapPhoto[] = useMemo(() => evidence.filter(e => e.gps).map(e => {
    const i = stages.findIndex(s => s.id === e.stage_id)
    const st = stages[i]
    const d = plot ? distanceM(plot, e.gps as LatLon) : null
    const state: MapPhoto['state'] = d == null ? 'no_plot' : d <= NEAR_M ? 'at_plot' : d <= FAR_M ? 'near' : 'far'
    const status = e.verification_status === 'accepted' ? 'accepted' : e.verification_status === 'retake' ? 'retake asked' : 'waiting for review'
    return { id: e.id, at: e.gps as LatLon, state, n: i + 1, label: `${st?.stage_name ?? 'Site'} photo, ${status}${d != null ? `, ${fmtDistance(d)} from the pin` : ''}` }
  }), [evidence, stages, plot?.[0], plot?.[1]]) // eslint-disable-line react-hooks/exhaustive-deps

  const counts = { at: photos.filter(p => p.state === 'at_plot').length, near: photos.filter(p => p.state === 'near').length, far: photos.filter(p => p.state === 'far').length }
  const accepted = evidence.filter(e => e.verification_status === 'accepted').length
  const shown = candidate ?? plot
  const code = shown ? digipin(shown[0], shown[1]) : null
  const moved = plot && candidate ? distanceM(plot, candidate) : null

  function startMove() { setMoving(true); setCandidate(null); setAccuracy(null); setErr('') }
  function cancel() { setMoving(false); setCandidate(null); setAccuracy(null); setErr('') }
  function locate() {
    if (!navigator.geolocation) { setErr('This browser cannot share its location. Tap the map instead.'); return }
    setLocating(true); setErr('')
    navigator.geolocation.getCurrentPosition(p => {
      const at: LatLon = [+p.coords.latitude.toFixed(6), +p.coords.longitude.toFixed(6)]
      setCandidate(at); setAccuracy({ at, m: Math.round(p.coords.accuracy) }); setLocating(false)
    }, () => { setErr('Location was not shared. Tap the map where the house stands instead.'); setLocating(false) }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 })
  }
  async function save() {
    if (!candidate) return
    setSaving(true)
    try {
      await api.patch(`/api/cases/${c.id}`, { plot_lat: candidate[0], plot_lon: candidate[1] })
      await reloadCases(); onPinSaved?.()
      toast(plot ? `Plot pin moved ${fmtDistance(moved ?? 0)}. Every photo was checked again.` : 'Plot pinned. Site photos are now checked against it.')
      cancel()
    } catch (e) { setErr(e instanceof Error ? e.message : 'Could not save the pin') } finally { setSaving(false) }
  }

  return (
    <section className="panel plot" aria-labelledby="plot-h">
      <div className="plot-map">
        <Suspense fallback={<div className="pm"><Skeleton lines={6} /></div>}>
          <PlotMap plot={plot} photos={photos} candidate={candidate} accuracy={accuracy} moving={moving}
            onPick={moving ? p => { setCandidate(p); setAccuracy(null) } : undefined} onPhoto={onOpenPhoto} label={`Map of ${c.beneficiary_name}'s plot in ${c.village}`} />
        </Suspense>
        {moving && (
          <div className="plot-move" role="group" aria-label="Move the plot pin">
            <p><b>{candidate ? `New pin ${candidate[0].toFixed(5)}, ${candidate[1].toFixed(5)}` : 'Tap the map where the house stands, or drag the pin.'}</b>
              {moved != null && <span> Moved {fmtDistance(moved)}.</span>}{accuracy && <span> Your phone says it is accurate to about {fmtDistance(Math.max(1, accuracy.m))}.</span>}</p>
            <div className="plot-move-actions">
              <button type="button" className="btn ghost small" onClick={locate} disabled={locating}><LocateFixed size={15} />{locating ? 'Locating…' : 'Use my location'}</button>
              <button type="button" className="btn primary small" onClick={() => void save()} disabled={!candidate || saving}><Check size={15} />{saving ? 'Saving…' : 'Save pin'}</button>
              <button type="button" className="btn ghost small" onClick={cancel}><X size={15} />Cancel</button>
            </div>
            <p className="fine">Every site photo is checked against this pin. Saving checks all {evidence.length} photo{evidence.length === 1 ? '' : 's'} on file again and records the move in the audit trail.{plot && accepted > 0 && <b> {accepted} photo{accepted === 1 ? ' was' : 's were'} already accepted against the current pin.</b>}</p>
          </div>
        )}
      </div>

      <div className="plot-info">
        <p className="eyebrow">Where the house is being built</p>
        <h2 id="plot-h">{c.village}, {c.taluk}</h2>
        {shown && code ? (
          <div className="plot-code">
            <span className="plot-code-l">DIGIPIN</span>
            <span className="plot-code-v mono" aria-label={`DIGIPIN ${code.split('').join(' ')}`}>{digipinDisplay(code)}</span>
            <CopyButton text={code} label="Copy the DIGIPIN" />
            <p className="fine">India Post's code for this 4 m square. A mason, a cement lorry or a relative can find the exact plot with it, no landmarks needed.</p>
          </div>
        ) : (
          <Notice tone="warn">{shown ? 'This pin is outside India, so it has no DIGIPIN. Check the coordinates.' : <>This plot is not pinned yet, so site photos cannot be checked for distance.{canEdit && ' Stand on the plot and use Pin the plot, or tap the map.'}</>}</Notice>
        )}
        <dl className="plot-facts">
          {land && <div><dt>Survey number</dt><dd><span><b>{land.survey}</b>{land.extent && ` · ${land.extent}`}</span><small>From {land.doc}{land.verified ? ', verified' : ', not yet verified'}</small></dd></div>}
          {plot && <div><dt>Pin</dt><dd className="plot-pin"><span className="mono">{plot[0].toFixed(6)}, {plot[1].toFixed(6)}</span><CopyButton text={`${plot[0]}, ${plot[1]}`} label="Copy the coordinates" /></dd></div>}
          <div><dt>Site photos with a location</dt><dd>{photos.length === 0 ? 'None yet' : (
            <span className="plot-counts">
              {counts.at > 0 && <span className="pc at">{counts.at} at the plot</span>}
              {counts.near > 0 && <span className="pc near">{counts.near} nearby</span>}
              {counts.far > 0 && <span className="pc far">{counts.far} far away</span>}
              {!plot && <span className="pc">{photos.length} (no pin to compare)</span>}
            </span>
          )}<small>Numbers on the map are the stage each photo was taken for. Tap one to review it.</small></dd></div>
        </dl>
        <div className="plot-links">
          {plot && <a className="btn ghost small" href={directionsUrl(plot)} target="_blank" rel="noreferrer"><Navigation size={15} />Directions</a>}
          {plot && <a className="link-btn" href={osmUrl(plot)} target="_blank" rel="noreferrer">Open in OpenStreetMap <MoveRight size={14} /></a>}
          {canEdit && !moving && <button type="button" className="link-btn" onClick={startMove}><MapPin size={14} />{plot ? 'Move the pin' : 'Pin the plot'}</button>}
        </div>
        {err && <Notice tone="error">{err}</Notice>}
      </div>
    </section>
  )
}

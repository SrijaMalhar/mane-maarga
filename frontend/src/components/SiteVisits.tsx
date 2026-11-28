/* A field officer's day: every pinned plot on one map, what each family needs from a visit,
   and the shortest order to see the ones you choose, handed to Google Maps for the roads. */
import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Camera, ClipboardCheck, LocateFixed, Navigation, Route } from 'lucide-react'
import { Notice, Skeleton } from './ui'
import { fmtDistance, plotOf } from './PlotPanel'
import type { CaseItem, Evidence, Stage } from '../lib/api'
import { useApp } from '../lib/app-context'
import { distanceM } from '../lib/photo-check'
import { mapsLegs, routeLength, visitOrder, type TravelMode } from '../lib/route'
import type { LatLon, MapStop } from './PlotMap'

const PlotMap = lazy(() => import('./PlotMap'))

type Need = { tone: MapStop['tone']; text: string }

/** What a plot needs today, from its stages and photos. Only "urgent" and "visit" need someone on site. */
function needOf(c: CaseItem, stages: Stage[], evidence: Evidence[]): Need {
  if (c.status === 'completed') return { tone: 'none', text: 'Keys handed over' }
  if (!stages.length) return c.status === 'intake' ? { tone: 'visit', text: 'First visit: documents and consent' } : { tone: 'visit', text: 'Site check before building starts' }
  const open = stages.filter(s => !['verified', 'completed'].includes(s.status))
  const name = (s: Stage) => s.stage_name.toLowerCase()
  for (const s of open) {
    const ev = evidence.filter(e => e.stage_id === s.id)
    const flagged = ev.find(e => e.verification_status === 'pending_review' && (e.checks?.flags.length ?? 0) > 0)
    if (flagged) return { tone: 'urgent', text: `Check on site: the ${name(s)} photo has ${flagged.checks!.flags.length} warning${flagged.checks!.flags.length > 1 ? 's' : ''}` }
  }
  for (const s of open) {
    const ev = evidence.filter(e => e.stage_id === s.id)
    if (!ev.some(e => ['pending_review', 'accepted'].includes(e.verification_status))) {
      const retake = ev.find(e => e.verification_status === 'retake')
      if (retake) return { tone: 'urgent', text: `Retake the ${name(s)} photo${retake.review_note ? `: ${retake.review_note}` : ''}` }
    }
  }
  const blocked = open.find(s => s.status === 'blocked')
  if (blocked) return { tone: 'visit', text: `The ${name(blocked)} is on hold: find out why` }
  const working = open.find(s => s.status === 'in_progress' && !evidence.some(e => e.stage_id === s.id && ['pending_review', 'accepted'].includes(e.verification_status)))
  if (working) return { tone: 'visit', text: `Take the ${name(working)} photo when it is finished` }
  const review = open.find(s => evidence.some(e => e.stage_id === s.id && e.verification_status === 'pending_review'))
  if (review) return { tone: 'desk', text: `Review the ${name(review)} photo` }
  const verify = open.find(s => evidence.some(e => e.stage_id === s.id && e.verification_status === 'accepted'))
  if (verify) return { tone: 'desk', text: `Mark the ${name(verify)} verified` }
  if (!open.length) return { tone: 'none', text: 'Every stage verified' }
  return { tone: 'none', text: `Waiting for the ${name(open[0])} to start` }
}

const TONE_LABEL: Record<MapStop['tone'], string> = { urgent: 'Needs you on site', visit: 'Visit', desk: 'At your desk', none: 'Nothing today' }

export default function SiteVisits({ onOpen }: { onOpen: (caseId: number) => void }) {
  const { api, cases } = useApp()
  const pinned = useMemo(() => cases.filter(c => plotOf(c)), [cases])
  const [needs, setNeeds] = useState<Record<number, Need> | null>(null)
  const [chosen, setChosen] = useState<Set<number> | null>(null)
  const [me, setMe] = useState<LatLon | null>(null)
  const [locating, setLocating] = useState(false)
  const [mode, setMode] = useState<TravelMode>('two-wheeler')
  const [err, setErr] = useState('')

  useEffect(() => {
    let live = true
    ;(async () => {
      const out: Record<number, Need> = {}
      await Promise.all(pinned.map(async c => {
        if (c.status === 'completed') { out[c.id] = needOf(c, [], []); return }
        try {
          const [s, e] = await Promise.all([api.get<Stage[]>(`/api/cases/${c.id}/stages`), api.get<Evidence[]>(`/api/cases/${c.id}/construction-evidence`)])
          out[c.id] = needOf(c, s, e)
        } catch { out[c.id] = { tone: 'none', text: 'Could not load this case' } }
      }))
      if (!live) return
      setNeeds(out)
      setChosen(prev => prev ?? new Set(pinned.filter(c => ['urgent', 'visit'].includes(out[c.id]?.tone)).map(c => c.id)))
    })()
    return () => { live = false }
  }, [api, pinned])

  const plan = useMemo(() => {
    if (!needs || !chosen) return null
    const go = pinned.filter(c => chosen.has(c.id))
    const order = visitOrder(go.map(c => plotOf(c)!), me).map(i => go[i])
    const points = [...(me ? [me] : []), ...order.map(c => plotOf(c)!)]
    return { order, points, km: routeLength(points) / 1000 }
  }, [needs, chosen, pinned, me])

  const stops: MapStop[] = useMemo(() => pinned.map(c => {
    const n = plan ? plan.order.findIndex(x => x.id === c.id) : -1
    const need = needs?.[c.id]
    return { id: c.id, at: plotOf(c)!, n: n >= 0 ? n + 1 : null, tone: need?.tone ?? 'none', label: `${c.beneficiary_name}, ${c.village}: ${need?.text ?? 'loading'}` }
  }), [pinned, plan, needs])

  const phone = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches
  const legs = plan ? mapsLegs(plan.points, mode, phone ? 3 : 9) : []
  const desk = pinned.filter(c => needs?.[c.id]?.tone === 'desk')
  const unpinned = cases.filter(c => !plotOf(c) && c.status !== 'completed').length

  function locate() {
    if (!navigator.geolocation) { setErr('This browser cannot share its location.'); return }
    setLocating(true); setErr('')
    navigator.geolocation.getCurrentPosition(p => { setMe([+p.coords.latitude.toFixed(6), +p.coords.longitude.toFixed(6)]); setLocating(false) },
      () => { setErr('Location was not shared, so the route starts at the first plot.'); setLocating(false) }, { enableHighAccuracy: false, timeout: 15000, maximumAge: 300000 })
  }
  const toggle = (id: number) => setChosen(prev => { const s = new Set(prev); if (s.has(id)) s.delete(id); else s.add(id); return s })

  if (!pinned.length) return <div className="panel"><Notice tone="info">No family's plot is pinned yet. Pin plots from each family's construction page, and they will show here.</Notice></div>

  return (
    <div className="visits">
      <section className="panel visits-main" aria-labelledby="visits-h">
        <div className="visits-map">
          <Suspense fallback={<div className="pm"><Skeleton lines={6} /></div>}>
            <PlotMap plot={null} stops={stops} route={plan?.points ?? []} me={me} onStop={onOpen} label="Map of every pinned plot and today's route" />
          </Suspense>
        </div>
        <div className="visits-side">
          <p className="eyebrow">Today's route</p>
          <h2 id="visits-h">{plan && plan.order.length ? `${plan.order.length} visit${plan.order.length > 1 ? 's' : ''}, about ${plan.km < 10 ? plan.km.toFixed(1) : Math.round(plan.km)} km` : 'Choose the plots to visit'}</h2>
          <p className="fine">Shortest order for the plots you tick{me ? ', starting where you are' : ''}. Distances are straight lines; roads will be longer.</p>
          <div className="visits-controls">
            <button type="button" className="btn ghost small" onClick={locate} disabled={locating}><LocateFixed size={15} />{locating ? 'Locating…' : me ? 'Update my location' : 'Start from my location'}</button>
            <label className="field compact"><span className="sr-only">Travel by</span>
              <select value={mode} onChange={e => setMode(e.target.value as TravelMode)}><option value="two-wheeler">Two-wheeler</option><option value="driving">Car or jeep</option><option value="walking">Walking</option></select>
            </label>
          </div>
          {legs.length > 0 && (
            <div className="visits-legs">
              {legs.map((href, i) => <a key={href} className={`btn ${i === 0 ? 'primary' : 'ghost'} small`} href={href} target="_blank" rel="noreferrer"><Navigation size={15} />{legs.length > 1 ? `Route in Google Maps, part ${i + 1} of ${legs.length}` : 'Open the route in Google Maps'}</a>)}
              {legs.length > 1 && <p className="fine">Google Maps takes {phone ? 'three' : 'nine'} stops per link{phone ? ' on a phone' : ''}, so the day is split; each part starts where the last one ends.</p>}
            </div>
          )}
          {err && <Notice tone="warn">{err}</Notice>}
        </div>
      </section>

      <section className="panel" aria-labelledby="visits-list-h">
        <h2 id="visits-list-h" className="visits-h2"><Route size={18} aria-hidden /> Every pinned plot</h2>
        {!needs ? <Skeleton lines={5} /> : (
          <ol className="visit-list">
            {[...pinned].sort((a, b) => {
              const na = stops.find(s => s.id === a.id)?.n ?? 999, nb = stops.find(s => s.id === b.id)?.n ?? 999
              return na - nb || a.village.localeCompare(b.village)
            }).map(c => {
              const need = needs[c.id]; const stop = stops.find(s => s.id === c.id)!
              const i = plan?.order.findIndex(x => x.id === c.id) ?? -1
              const prev = i > 0 ? plotOf(plan!.order[i - 1]) : i === 0 ? me : null
              const leg = prev ? distanceM(prev, plotOf(c)!) : null
              const Icon = need.tone === 'urgent' ? AlertTriangle : need.tone === 'desk' ? ClipboardCheck : Camera
              return (
                <li key={c.id} className={`visit-row t-${need.tone}${stop.n ? ' on' : ''}`}>
                  <label className="visit-pick"><input type="checkbox" checked={chosen?.has(c.id) ?? false} onChange={() => toggle(c.id)} aria-label={`Visit ${c.beneficiary_name} today`} /><span className="visit-n" aria-hidden>{stop.n ?? ''}</span></label>
                  <div className="visit-who"><b>{c.beneficiary_name}</b><span>{c.village}, {c.taluk}</span></div>
                  <div className="visit-need"><Icon size={15} aria-hidden /><span><small>{TONE_LABEL[need.tone]}</small>{need.text}</span></div>
                  <div className="visit-leg">{leg != null ? fmtDistance(leg) : ''}{leg != null && <small>{i === 0 && me ? 'from you' : 'from the last plot'}</small>}</div>
                  <button type="button" className="link-btn" onClick={() => onOpen(c.id)}>Open</button>
                </li>
              )
            })}
          </ol>
        )}
        {desk.length > 0 && <p className="fine">{desk.length} plot{desk.length > 1 ? 's need' : ' needs'} you at your desk, not on site: {desk.map(c => c.beneficiary_name).join(', ')}.</p>}
        {unpinned > 0 && <p className="fine">{unpinned} famil{unpinned > 1 ? 'ies are' : 'y is'} not on this map because their plot is not pinned yet.</p>}
      </section>
    </div>
  )
}

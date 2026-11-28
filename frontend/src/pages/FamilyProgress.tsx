/* The page a family opens to follow their house being built: from an SMS, a QR code on the officer's phone,
   or a link a son in Bengaluru was sent on WhatsApp. Kannada first, large type, no login.
   It refreshes itself while open, remembers what the family last saw so new work stands out,
   and keeps the last copy on the phone for when the network drops. Only verified work is shown. */
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Check, CheckCircle2, Copy, MapPin, Navigation, Share2, Sun, Volume2, WifiOff, X } from 'lucide-react'
import HouseStages from '../components/HouseStages'
import { directionsUrl } from '../components/PlotPanel'
import { ApiError, type ProgressStep, type PublicProgress } from '../lib/api'
import { digipin, digipinDisplay } from '../lib/digipin'
import { parseTime } from '../lib/format'
import { sameOrigin, speak, stopSpeaking } from '../lib/voice'
import KA_PMAYG from '../generated/rules/KA__pmayg__2024-25.json'

const PlotMap = lazy(() => import('../components/PlotMap'))

export type ProgressClient = { get: <T>(p: string) => Promise<T>; raw: (p: string, init?: RequestInit) => Promise<Response> }

const STAGE_KN: Record<string, string> = Object.fromEntries(KA_PMAYG.stages.items.map(s => [s.id, s.label_kn]))

const STEP: Record<ProgressStep, { kn: string; en: string; sayKn: string; sayEn: string }> = {
  done: { kn: 'ಮುಗಿದಿದೆ', en: 'Done', sayKn: 'ಈ ಹಂತ ಮುಗಿದಿದೆ.', sayEn: 'This stage is done.' },
  ready_to_verify: { kn: 'ಫೋಟೋ ಸರಿ ಇದೆ', en: 'Photo approved', sayKn: 'ಫೋಟೋ ಸರಿ ಇದೆ. ಈ ಹಂತ ಬೇಗನೆ ಪೂರ್ಣ ಎಂದು ದಾಖಲಾಗುತ್ತದೆ.', sayEn: 'The photo is approved. This stage will be marked done soon.' },
  photo_in_review: { kn: 'ಫೋಟೋ ಪರಿಶೀಲನೆಯಲ್ಲಿದೆ', en: 'Photo being checked', sayKn: 'ಕೆಲಸದ ಫೋಟೋ ಬಂದಿದೆ. ಅಧಿಕಾರಿ ಅದನ್ನು ಪರಿಶೀಲಿಸುತ್ತಿದ್ದಾರೆ.', sayEn: 'A photo of the work has arrived. An officer is checking it.' },
  retake: { kn: 'ಇನ್ನೊಂದು ಫೋಟೋ ಬೇಕು', en: 'Another photo needed', sayKn: 'ಇನ್ನೊಂದು ಫೋಟೋ ಬೇಕಾಗಿದೆ. ಅಧಿಕಾರಿ ಮತ್ತೆ ಬಂದು ತೆಗೆಯುತ್ತಾರೆ.', sayEn: 'Another photo is needed. An officer will come and take it again.' },
  photo_needed: { kn: 'ಕೆಲಸ ನಡೆಯುತ್ತಿದೆ', en: 'Work going on', sayKn: 'ಕೆಲಸ ನಡೆಯುತ್ತಿದೆ. ಮುಗಿದ ಮೇಲೆ ಅಧಿಕಾರಿ ಬಂದು ಫೋಟೋ ತೆಗೆಯುತ್ತಾರೆ.', sayEn: 'Work is going on. When it is finished, an officer will come and take a photo.' },
  not_started: { kn: 'ಇನ್ನೂ ಶುರುವಾಗಿಲ್ಲ', en: 'Not started', sayKn: 'ಈ ಹಂತದ ಕೆಲಸ ಇನ್ನೂ ಶುರುವಾಗಿಲ್ಲ.', sayEn: 'Work on this stage has not started yet.' },
  paused: { kn: 'ಸದ್ಯಕ್ಕೆ ನಿಂತಿದೆ', en: 'On hold', sayKn: 'ಈ ಹಂತದ ಕೆಲಸ ಸದ್ಯಕ್ಕೆ ನಿಂತಿದೆ. ಕಾರಣ ತಿಳಿಯಲು ಸಿಬ್ಬಂದಿಯನ್ನು ಕೇಳಿ.', sayEn: 'Work on this stage is on hold for now. Ask the case worker why.' },
}

const GONE: Record<number, [string, string]> = {
  404: ['ಈ ಲಿಂಕ್ ಸರಿಯಿಲ್ಲ.', 'This link is not valid.'],
  410: ['ಈ ಲಿಂಕ್ ಅನ್ನು ನಿಲ್ಲಿಸಲಾಗಿದೆ. ಹೊಸ ಲಿಂಕ್‌ಗಾಗಿ ಸಿಬ್ಬಂದಿಯನ್ನು ಕೇಳಿ.', 'This link was switched off. Ask the case worker for a new one.'],
  403: ['ಈ ಪುಟವನ್ನು ಸದ್ಯಕ್ಕೆ ನಿಲ್ಲಿಸಲಾಗಿದೆ. ಸಿಬ್ಬಂದಿಯನ್ನು ಕೇಳಿ.', 'This page is paused. Ask the case worker.'],
}

const store = {
  get<T>(k: string): T | null { try { const v = localStorage.getItem(k); return v ? (JSON.parse(v) as T) : null } catch { return null } },
  set(k: string, v: unknown) { try { localStorage.setItem(k, JSON.stringify(v)) } catch { /* storage full or off */ } },
  drop(k: string) { try { localStorage.removeItem(k) } catch { /* storage off */ } },
}

function ago(iso: string | null | undefined, now: number): [string, string] {
  const d = parseTime(iso); if (!d) return ['', '']
  const s = Math.max(0, (now - d.getTime()) / 1000)
  if (s < 60) return ['ಈಗಷ್ಟೇ', 'just now']
  const m = Math.floor(s / 60); if (m < 60) return [`${m} ನಿಮಿಷದ ಹಿಂದೆ`, `${m} minute${m > 1 ? 's' : ''} ago`]
  const h = Math.floor(m / 60); if (h < 24) return [`${h} ಗಂಟೆಯ ಹಿಂದೆ`, `${h} hour${h > 1 ? 's' : ''} ago`]
  const days = Math.floor(h / 24); return [`${days} ದಿನದ ಹಿಂದೆ`, `${days} day${days > 1 ? 's' : ''} ago`]
}
const day = (iso: string | null | undefined, lang: 'kn' | 'en') => parseTime(iso)?.toLocaleDateString(lang === 'kn' ? 'kn-IN' : 'en-IN', { day: 'numeric', month: 'long', year: 'numeric' }) ?? ''

/** As on the Construction page: a stage counts once it is verified. */
function houseProgress(stages: PublicProgress['stages']) {
  const done = stages.filter(s => s.step === 'done').length
  return { done, pct: stages.length ? Math.round((done / stages.length) * 100) : 0 }
}

function usePhoto(client: ProgressClient, token: string, id: number | null) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    let u: string | null = null; let live = true
    if (id == null) { setUrl(null); return }
    client.raw(`/api/public/progress/${token}/photos/${id}`).then(async r => { if (!r.ok || !live) return; u = URL.createObjectURL(await r.blob()); setUrl(u) }).catch(() => {})
    return () => { live = false; if (u) URL.revokeObjectURL(u) }
  }, [client, token, id])
  return url
}

function Thumb({ client, token, id, label, onOpen }: { client: ProgressClient; token: string; id: number; label: string; onOpen: () => void }) {
  const url = usePhoto(client, token, id)
  return <button type="button" className="fp-thumb" onClick={onOpen} aria-label={label}>{url ? <img src={url} alt="" /> : <span className="fp-ph" />}</button>
}

/** Drag the line to compare the first accepted photo with the latest one. */
function ThenNow({ client, token, before, after }: { client: ProgressClient; token: string; before: { id: number; stage: string; at: string | null }; after: { id: number; stage: string; at: string | null } }) {
  const [x, setX] = useState(50)
  const a = usePhoto(client, token, before.id), b = usePhoto(client, token, after.id)
  return (
    <section className="fp-card" aria-labelledby="fp-tn">
      <h2 id="fp-tn" className="fp-h">ಆಗ ಮತ್ತು ಈಗ <span lang="en">Then and now</span></h2>
      <div className="fp-tn">
        {b ? <img src={b} alt={`Now: ${after.stage}`} /> : <span className="fp-ph" />}
        {a && <img src={a} alt={`Then: ${before.stage}`} className="fp-tn-then" style={{ clipPath: `inset(0 ${100 - x}% 0 0)` }} />}
        <span className="fp-tn-line" style={{ left: `${x}%` }} aria-hidden />
        <span className="fp-tn-tag then">ಆಗ · {day(before.at, 'kn')}</span>
        <span className="fp-tn-tag now">ಈಗ · {day(after.at, 'kn')}</span>
      </div>
      <input type="range" min={0} max={100} value={x} onChange={e => setX(Number(e.target.value))} aria-label="Slide to compare the first photo with the latest" className="fp-tn-range" />
      <p className="fp-small" lang="en">{before.stage} on the left, {after.stage.toLowerCase()} on the right. Slide to compare.</p>
    </section>
  )
}

export default function FamilyProgress({ token, client, onClose, preview = false }: { token: string; client: ProgressClient; onClose?: () => void; /** A case worker looking: not counted as a family visit. */ preview?: boolean }) {
  const key = token.slice(0, 12)
  const [data, setData] = useState<PublicProgress | null>(() => store.get<PublicProgress>(`mm_progress_cache:${key}`))
  const [gone, setGone] = useState<number | null>(null)
  const [offline, setOffline] = useState(false)
  const [checked, setChecked] = useState<number | null>(null)
  const [fresh, setFresh] = useState<{ done: string[]; photos: number } | null>(null)
  const [sun, setSun] = useState(() => store.get<boolean>('mm_sunlight') === true)
  const [big, setBig] = useState<number | null>(null)
  const [now, setNow] = useState(Date.now())
  const [copied, setCopied] = useState('')
  const seenRef = useRef(store.get<{ done: string[]; photos: number[] }>(`mm_progress_seen:${key}`))
  const url = `${window.location.origin}/#/progress/${token}`

  const load = useCallback(async () => {
    try {
      const d = await client.get<PublicProgress>(`/api/public/progress/${token}${preview ? '?preview=1' : ''}`)
      setData(d); setGone(null); setOffline(false); setChecked(Date.now())
      store.set(`mm_progress_cache:${key}`, d)
      // What changed since this phone last looked: new finished stages, new accepted photos.
      const doneNow = d.stages.filter(s => s.step === 'done').map(s => s.code)
      const photosNow = d.stages.flatMap(s => s.photos.map(p => p.id))
      const seen = seenRef.current
      if (seen) {
        const newDone = d.stages.filter(s => doneNow.includes(s.code) && !seen.done.includes(s.code)).map(s => s.code)
        const newPhotos = photosNow.filter(id => !seen.photos.includes(id)).length
        if (newDone.length || newPhotos) setFresh(f => ({ done: [...new Set([...(f?.done ?? []), ...newDone])], photos: (f?.photos ?? 0) + newPhotos }))
      }
      seenRef.current = { done: doneNow, photos: photosNow }
      store.set(`mm_progress_seen:${key}`, seenRef.current)
    } catch (e) {
      const status = e instanceof ApiError ? e.status : 0
      if (GONE[status]) { setGone(status); setData(null); store.drop(`mm_progress_cache:${key}`) } // a switched-off page must not live on in the cache
      else setOffline(true)
    }
  }, [client, token, key, preview])

  useEffect(() => {
    void load()
    const tick = () => { setNow(Date.now()); if (document.visibilityState === 'visible') void load() }
    const id = window.setInterval(tick, 30_000)
    document.addEventListener('visibilitychange', tick); window.addEventListener('online', tick)
    return () => { window.clearInterval(id); document.removeEventListener('visibilitychange', tick); window.removeEventListener('online', tick); stopSpeaking() }
  }, [load])
  useEffect(() => { store.set('mm_sunlight', sun) }, [sun])
  useEffect(() => { if (!copied) return; const t = setTimeout(() => setCopied(''), 1800); return () => clearTimeout(t) }, [copied])
  useEffect(() => {
    if (big == null) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setBig(null) }
    document.addEventListener('keydown', onKey); return () => document.removeEventListener('keydown', onKey)
  }, [big])

  const allPhotos = useMemo(() => (data?.stages ?? []).flatMap(s => s.photos.map(p => ({ id: p.id, stage: s.name, code: s.code, at: p.taken_at ?? p.accepted_at }))), [data])
  const bigUrl = usePhoto(client, token, big)

  const shell = (body: React.ReactNode) => (
    <main className="fp" lang="kn" data-theme={sun ? 'sunlight' : undefined}>
      <div className="fp-wrap">
        <header className="fp-top">
          <p className="fp-brand">ಮನೆ ಮಾರ್ಗ <span lang="en">Mane Maarga</span></p>
          <div className="fp-top-r">
            <button type="button" className={`fp-chip${sun ? ' on' : ''}`} aria-pressed={sun} onClick={() => setSun(v => !v)} title="High contrast for bright sunlight"><Sun size={15} aria-hidden />ಬಿಸಿಲು <span lang="en">Sunlight</span></button>
            {onClose && <button type="button" className="fp-chip" onClick={onClose} aria-label="Close preview"><X size={15} aria-hidden /></button>}
          </div>
        </header>
        {body}
      </div>
    </main>
  )

  if (gone) return shell(<div className="fp-card fp-gone" role="alert"><p className="fp-big">{GONE[gone][0]}</p><p lang="en">{GONE[gone][1]}</p></div>)
  if (!data) return shell(<div className="fp-card">{offline ? <><p className="fp-big"><WifiOff size={20} aria-hidden /> ನೆಟ್‌ವರ್ಕ್ ಇಲ್ಲ.</p><p lang="en">No network. This page will load when the phone is back online.</p></> : <p>ಲೋಡ್ ಆಗುತ್ತಿದೆ… <span lang="en">Loading…</span></p>}</div>)

  const { done, pct } = houseProgress(data.stages)
  const current = data.stages.find(s => s.step !== 'done') ?? null
  const finished = data.stages.length > 0 && !current
  const kn = (code: string, name: string) => STAGE_KN[code] ?? name
  const changed = ago(data.updated_at, now), seenAt = ago(checked ? new Date(checked).toISOString() : data.checked_at, now)
  const code = data.plot ? digipin(data.plot[0], data.plot[1]) : null
  const firstLast = allPhotos.length >= 2 ? [allPhotos[0], allPhotos[allPhotos.length - 1]] as const : null
  const say = finished
    ? 'ನಮಸ್ಕಾರ. ನಿಮ್ಮ ಮನೆ ಕಟ್ಟಿ ಮುಗಿದಿದೆ. ಅಭಿನಂದನೆಗಳು.'
    : `ನಮಸ್ಕಾರ. ನಿಮ್ಮ ಮನೆಯ ಕೆಲಸ ಶೇಕಡಾ ${pct} ಮುಗಿದಿದೆ. ${data.stages.length} ಹಂತಗಳಲ್ಲಿ ${done} ಮುಗಿದಿವೆ.${current ? ` ಈಗಿನ ಹಂತ ${kn(current.code, current.name)}. ${STEP[current.step].sayKn}` : ''}`
  const shareText = `ನಮ್ಮ ಮನೆ ಕಟ್ಟುವ ಕೆಲಸ ಎಷ್ಟು ಆಗಿದೆ ನೋಡಿ. See how our house is coming along: ${url}`
  const copy = (text: string, what: string) => { void navigator.clipboard?.writeText(text).then(() => setCopied(what), () => window.prompt('', text)) }

  return shell(<>
    <p className="fp-live" role="status">
      <span className={`fp-dot${offline ? ' off' : ''}`} aria-hidden />
      {offline ? <>ನೆಟ್‌ವರ್ಕ್ ಇಲ್ಲ, ಕೊನೆಯ ಮಾಹಿತಿ ತೋರಿಸುತ್ತಿದೆ <span lang="en">Offline, showing what this phone last saw</span></>
        : <>ನೇರ ಮಾಹಿತಿ · ಪರಿಶೀಲಿಸಿದ್ದು {seenAt[0]} <span lang="en">Live, checked {seenAt[1]}</span></>}
    </p>

    {fresh && (fresh.done.length > 0 || fresh.photos > 0) && (
      <div className="fp-new" role="status">
        <CheckCircle2 size={22} aria-hidden />
        <p><b>ಹೊಸದು: {fresh.done.length ? `${fresh.done.map(c => kn(c, c)).join(', ')} ಮುಗಿದಿದೆ` : `${fresh.photos} ಹೊಸ ಫೋಟೋ`}</b>
          <span lang="en">New since you last looked: {fresh.done.length ? `${fresh.done.map(c => data.stages.find(s => s.code === c)?.name ?? c).join(', ')} done` : `${fresh.photos} new photo${fresh.photos > 1 ? 's' : ''}`}</span></p>
        <button type="button" className="fp-x" onClick={() => setFresh(null)} aria-label="Dismiss"><X size={16} /></button>
      </div>
    )}

    <section className="fp-hero">
      <p className="fp-hello">ನಮಸ್ಕಾರ {data.first_name}</p>
      <h1 className="fp-title">ನಿಮ್ಮ ಮನೆ <span lang="en">Your house in {data.village}</span></h1>
      <HouseStages done={done} total={data.stages.length} family />
      <p className="fp-pct"><b>{pct}%</b> ಮುಗಿದಿದೆ <span lang="en">built</span></p>
      <p className="fp-sub">{data.stages.length ? <>{data.stages.length} ಹಂತಗಳಲ್ಲಿ {done} ಮುಗಿದಿವೆ <span lang="en">{done} of {data.stages.length} stages done</span></> : <>ನಿರ್ಮಾಣದ ಹಂತಗಳನ್ನು ಇನ್ನೂ ಯೋಜಿಸಿಲ್ಲ. <span lang="en">The building stages are not planned yet. They will appear here once they are.</span></>}</p>
      {data.updated_at && <p className="fp-small">ಕೊನೆಯ ಬದಲಾವಣೆ {changed[0]} <span lang="en">Last change {changed[1]}</span></p>}
      <button type="button" className="fam-listen" onClick={() => void speak(say, 'kn', { fetcher: sameOrigin, bhashini: true, gender: 'female' })}><Volume2 size={18} aria-hidden /> ಕೇಳಿ · Listen</button>
    </section>

    {(current || finished) && (
      <section className={`fp-card fp-now${finished ? ' done' : ''}`} aria-labelledby="fp-now">
        <p className="fp-eyebrow" id="fp-now">ಈಗ ಏನಾಗುತ್ತಿದೆ <span lang="en">What is happening now</span></p>
        {finished ? <>
          <p className="fp-big">ನಿಮ್ಮ ಮನೆ ಕಟ್ಟಿ ಮುಗಿದಿದೆ. ಅಭಿನಂದನೆಗಳು.</p>
          <p lang="en">Your house is built. Congratulations.</p>
        </> : current && <>
          <p className="fp-big">{kn(current.code, current.name)} <span lang="en">{current.name}</span></p>
          <p className="fp-say">{STEP[current.step].sayKn}</p>
          <p lang="en">{STEP[current.step].sayEn}</p>
          <p className="fp-small">ಪ್ರತಿ ಹಂತ ಮುಗಿದ ಮೇಲೆ ಮುಂದಿನ ಕಂತು ಕೇಳಬಹುದು. ಅದಕ್ಕೆ ನಿಮ್ಮ ಫೋನ್‌ನಲ್ಲಿ ನಿಮ್ಮ ಒಪ್ಪಿಗೆ ಕೇಳಲಾಗುತ್ತದೆ. <span lang="en">After each stage is done, the next instalment can be asked for. You will be asked to approve it on your phone.</span></p>
        </>}
      </section>
    )}

    {data.stages.length > 0 && (
      <section className="fp-card" aria-labelledby="fp-stages">
        <h2 id="fp-stages" className="fp-h">ಹಂತಗಳು <span lang="en">Stages</span></h2>
        <ol className="fp-steps">
          {data.stages.map((s, i) => (
            <li key={s.code + i} className={`fp-step ${s.step === 'done' ? 'done' : s === current ? 'now' : 'next'}`}>
              <span className="fp-node" aria-hidden>{s.step === 'done' ? <Check size={16} strokeWidth={3} /> : i + 1}</span>
              <div className="fp-step-body">
                <p className="fp-step-name">{kn(s.code, s.name)} <span lang="en">{s.name}</span></p>
                <p className={`fp-tag st-${s.step}`}>{STEP[s.step].kn} <span lang="en">{STEP[s.step].en}</span></p>
                {s.done_at && <p className="fp-small">ಮುಗಿದದ್ದು {day(s.done_at, 'kn')} <span lang="en">Done on {day(s.done_at, 'en')}</span></p>}
                {s.photos.length > 0 && <div className="fp-thumbs">{s.photos.map(p => <Thumb key={p.id} client={client} token={token} id={p.id} label={`Open the ${s.name} photo`} onOpen={() => setBig(p.id)} />)}</div>}
              </div>
            </li>
          ))}
        </ol>
      </section>
    )}

    {firstLast && firstLast[0].id !== firstLast[1].id && <ThenNow client={client} token={token} before={firstLast[0]} after={firstLast[1]} />}

    {data.plot && (
      <section className="fp-card" aria-labelledby="fp-plot">
        <h2 id="fp-plot" className="fp-h"><MapPin size={18} aria-hidden /> ನಿಮ್ಮ ಜಾಗ <span lang="en">Your plot</span></h2>
        <Suspense fallback={<div className="pm" style={{ height: 240 }} />}>
          <PlotMap plot={data.plot} rings={false} height={240} label={`Map of the plot in ${data.village}`} />
        </Suspense>
        {code && (
          <div className="fp-code">
            <p className="fp-code-l">DIGIPIN</p>
            <p className="fp-code-v" aria-label={`DIGIPIN ${code.split('').join(' ')}`}>{digipinDisplay(code)}</p>
            <button type="button" className="fp-chip" onClick={() => copy(code, 'code')}>{copied === 'code' ? <Check size={15} /> : <Copy size={15} />}{copied === 'code' ? 'ನಕಲಾಯಿತು · Copied' : 'ನಕಲಿಸಿ · Copy'}</button>
            <p className="fp-small">ಇದು ಭಾರತೀಯ ಅಂಚೆಯ ಡಿಜಿಪಿನ್. ಈ ಸಂಕೇತದಿಂದ ಮೇಸ್ತ್ರಿ, ಸಿಮೆಂಟ್ ಲಾರಿ ಅಥವಾ ಸಂಬಂಧಿಕರು ನಿಮ್ಮ ಜಾಗವನ್ನು ನಿಖರವಾಗಿ ಹುಡುಕಬಹುದು. <span lang="en">India Post's DIGIPIN. With it a mason, a cement lorry or a relative can find your plot exactly.</span></p>
          </div>
        )}
        <a className="fp-btn ghost" href={directionsUrl(data.plot)} target="_blank" rel="noreferrer"><Navigation size={18} aria-hidden /> ದಾರಿ ತೋರಿಸಿ <span lang="en">Directions</span></a>
      </section>
    )}

    <section className="fp-card" aria-labelledby="fp-share">
      <h2 id="fp-share" className="fp-h"><Share2 size={18} aria-hidden /> ಕುಟುಂಬದವರಿಗೆ ಕಳುಹಿಸಿ <span lang="en">Send to family</span></h2>
      <p className="fp-small">ದೂರದಲ್ಲಿರುವ ಮಕ್ಕಳು ಮತ್ತು ಸಂಬಂಧಿಕರೂ ಮನೆ ಕೆಲಸವನ್ನು ನೋಡಬಹುದು. <span lang="en">Children and relatives far away can follow the house too.</span></p>
      <div className="fp-share">
        <a className="fp-btn" href={`https://wa.me/?text=${encodeURIComponent(shareText)}`} target="_blank" rel="noreferrer">WhatsApp</a>
        {'share' in navigator && <button type="button" className="fp-btn ghost" onClick={() => void navigator.share({ title: 'ಮನೆ ಮಾರ್ಗ · Mane Maarga', text: 'ನಮ್ಮ ಮನೆ ಕಟ್ಟುವ ಕೆಲಸ ಎಷ್ಟು ಆಗಿದೆ ನೋಡಿ. See how our house is coming along.', url }).catch(() => {})}><Share2 size={18} aria-hidden /> ಹಂಚಿಕೊಳ್ಳಿ <span lang="en">Share</span></button>}
        <button type="button" className="fp-btn ghost" onClick={() => copy(url, 'link')}>{copied === 'link' ? <Check size={18} aria-hidden /> : <Copy size={18} aria-hidden />} {copied === 'link' ? 'ನಕಲಾಯಿತು' : 'ಲಿಂಕ್ ನಕಲಿಸಿ'} <span lang="en">{copied === 'link' ? 'Copied' : 'Copy link'}</span></button>
      </div>
    </section>

    <p className="fam-fine">ಈ ಪುಟದಲ್ಲಿ ಪರಿಶೀಲಿಸಿದ ಕೆಲಸ ಮಾತ್ರ ಕಾಣುತ್ತದೆ. ಹಣ, ದಾಖಲೆಗಳು ಅಥವಾ ನಿಮ್ಮ ಫೋನ್ ನಂಬರ್ ಇಲ್ಲಿ ಇರುವುದಿಲ್ಲ. ಈ ಲಿಂಕ್ ಇರುವ ಯಾರಾದರೂ ಈ ಪುಟ ನೋಡಬಹುದು; ಬೇಡವಾದರೆ ಸಿಬ್ಬಂದಿ ಇದನ್ನು ನಿಲ್ಲಿಸಬಹುದು.<span lang="en">This page shows checked work only. Money, documents and your phone number are never shown here. Anyone with this link can see this page; the case worker can switch it off if you ask.</span></p>

    {big != null && (
      <div className="fp-light" role="dialog" aria-modal="true" aria-label="Site photo" onClick={() => setBig(null)}>
        {bigUrl ? <img src={bigUrl} alt={`Site photo: ${allPhotos.find(p => p.id === big)?.stage ?? ''}`} onClick={e => e.stopPropagation()} /> : <p>ಲೋಡ್ ಆಗುತ್ತಿದೆ…</p>}
        <p className="fp-light-cap">{allPhotos.find(p => p.id === big)?.stage} · {day(allPhotos.find(p => p.id === big)?.at, 'kn')}</p>
        <button type="button" className="fp-chip" onClick={() => setBig(null)} autoFocus><X size={15} aria-hidden /> ಮುಚ್ಚಿ · Close</button>
      </div>
    )}
  </>)
}

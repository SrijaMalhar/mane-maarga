/* Real photographs of poor rural homes at each building stage, in place of the house drawing.
   The large photo is the stage this house has reached; the four below show the whole way, done and still to come.
   Every photo says it is an example, not the family's own house, and credits its photographer.
   On a weak network a photo may not load: the house drawing at the same stage stands in for it. */
import { useState } from 'react'
import { Check } from 'lucide-react'
import House from './House'
import { STAGE_PHOTOS, stagePhotoIndex, stagePhotoUrl } from '../lib/stage-photos'

export default function HouseStages({ done, total, family = false }: { done: number; total: number; family?: boolean }) {
  const reached = stagePhotoIndex(done, total)
  const started = done > 0
  const [view, setView] = useState<number | null>(null)
  const [broken, setBroken] = useState<Record<string, true>>({})
  const shown = view ?? reached
  const p = STAGE_PHOTOS[shown]
  const isDone = started && shown <= reached
  const head: [string, string] = !started && shown === 0 ? ['ಮೊದಲು ತಳಪಾಯ', 'First comes the plinth']
    : isDone ? [p.knDone, p.key === 'home' ? 'Home ready' : `${p.en} done`]
    : ['ಮುಂದೆ ಹೀಗಿರುತ್ತದೆ', `Still to come: ${p.en.toLowerCase()}`]
  const fail = (key: string) => setBroken(b => ({ ...b, [key]: true }))

  return (
    <div className={`hs${family ? ' family' : ''}`}>
      <figure className="hs-main">
        {broken[p.key]
          ? <House level={!started && shown === 0 ? 0 : p.level} size={300} label={`House drawing: ${p.en.toLowerCase()}`} />
          : <img key={p.key} src={stagePhotoUrl(p, 960)} srcSet={`${stagePhotoUrl(p, 500)} 500w, ${stagePhotoUrl(p, 960)} 960w`}
              sizes="(max-width: 720px) 92vw, 420px" alt={p.alt} width={960} height={720} decoding="async" referrerPolicy="no-referrer"
              style={{ objectPosition: `${p.focus} 50%` }} onError={() => fail(p.key)} />}
        <figcaption className={`hs-chip${isDone ? ' done' : ''}`}>
          {isDone && <Check size={14} strokeWidth={3} aria-hidden />}
          {family ? <><span lang="kn">{head[0]}</span> <span lang="en">{head[1]}</span></> : head[1]}
        </figcaption>
        {!broken[p.key] && <a className="hs-credit" href={p.source} target="_blank" rel="noreferrer">Photo: {p.author}, {p.license}</a>}
      </figure>
      <p className="hs-note">
        {family
          ? <><span lang="kn">ಉದಾಹರಣೆ ಚಿತ್ರ: ಈ ಹಂತದಲ್ಲಿರುವ ಬೇರೆ ಹಳ್ಳಿಯ ಮನೆ. ನಿಮ್ಮ ಮನೆಯ ಫೋಟೋಗಳು ಬಂದಂತೆ ಕೆಳಗೆ ಕಾಣುತ್ತವೆ.</span> <span lang="en">An example: another village home at this stage. Photos of your own house appear below as they come in.</span></>
          : 'An example of a rural home at this stage, not this family\'s house. Their own site photos sit with each stage below.'}
      </p>
      <ol className="hs-steps" aria-label={family ? 'ಮನೆಯ ಹಂತಗಳು, stages of the house' : 'Stages of the house'}>
        {STAGE_PHOTOS.map((s, i) => {
          const state = started && i <= reached ? 'done' : 'next'
          return (
            <li key={s.key} className={`hs-step ${state}${i === shown ? ' on' : ''}`}>
              <button type="button" onClick={() => setView(i === reached ? null : i)} aria-pressed={i === shown}
                aria-label={`${s.en}: ${state === 'done' ? 'done' : i === reached ? 'next' : 'still to come'}. Show the example photo.`}>
                {broken[`${s.key}-sm`]
                  ? <House level={s.level} size={64} />
                  : <img src={stagePhotoUrl(s, 330)} alt="" width={330} height={248} loading="lazy" decoding="async" referrerPolicy="no-referrer"
                      style={{ objectPosition: `${s.focus} 50%` }} onError={() => fail(`${s.key}-sm`)} />}
                <span className="hs-n" aria-hidden>{state === 'done' ? <Check size={11} strokeWidth={3.5} /> : i + 1}</span>
              </button>
              <span className="hs-l">{family ? <><span lang="kn">{s.kn}</span> <span lang="en">{s.en}</span></> : s.en}</span>
            </li>
          )
        })}
      </ol>
      <details className="hs-credits">
        <summary>{family ? 'ಚಿತ್ರಗಳ ಕೃಪೆ, photo credits' : 'Photo credits'}</summary>
        <ul>
          {STAGE_PHOTOS.map(s => (
            <li key={s.key}><b>{s.en}</b>: {s.place}, {s.year}. <a href={s.source} target="_blank" rel="noreferrer">{s.author}</a>, <a href={s.licenseUrl} target="_blank" rel="noreferrer">{s.license}</a>, via Wikimedia Commons. Shown cropped.</li>
          ))}
        </ul>
      </details>
    </div>
  )
}

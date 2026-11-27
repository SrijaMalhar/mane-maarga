import { useEffect, useState } from 'react'
import { ArrowLeft, ArrowRight, MousePointerClick } from 'lucide-react'
import { TOUR_ART } from '../components/TourArt'
import { useApp } from '../lib/app-context'
import { SAMPLE_NOTE, TOUR, setTourStep, tourStep } from '../lib/tour'

/** The whole process as a story: one family, nine steps, each with the real rule behind it. */
export default function Tour() {
  const { demo } = useApp()
  const [at, setAt] = useState(() => Math.min(TOUR.length - 1, Math.max(0, tourStep() ?? 0)))
  const step = TOUR[at]
  const Art = TOUR_ART[step.art]
  useEffect(() => { setTourStep(at) }, [at])
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input, textarea, select')) return
      if (e.key === 'ArrowRight') setAt(a => Math.min(TOUR.length - 1, a + 1))
      if (e.key === 'ArrowLeft') setAt(a => Math.max(0, a - 1))
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [])

  return (
    <div className="tour">
      <header className="tour-head">
        <div>
          <h1>How a house gets built</h1>
          <p className="tour-kn" lang="kn">ಮನೆ ಹೇಗೆ ಪೂರ್ಣಗೊಳ್ಳುತ್ತದೆ</p>
        </div>
        <p className="tour-note">{SAMPLE_NOTE}</p>
      </header>

      <ol className="tour-steps" aria-label="Steps">
        {TOUR.map((s, i) => (
          <li key={s.id} className={i === at ? 'on' : i < at ? 'done' : undefined}>
            <button onClick={() => setAt(i)} aria-current={i === at ? 'step' : undefined} aria-label={`Step ${i + 1}: ${s.title}`}>
              <span className="ts-n">{i + 1}</span><span className="ts-kn" lang="kn">{s.kn}</span>
            </button>
          </li>
        ))}
      </ol>

      <article className="tour-card" key={step.id} aria-live="polite">
        <div className="tour-pic"><Art /></div>
        <div className="tour-text">
          <p className="tour-who">Step {at + 1} of {TOUR.length} · {step.who}</p>
          <h2><span lang="kn">{step.kn}</span>{step.title}</h2>
          <p className="tour-body">{step.body}</p>
          {step.facts.length > 0 && (
            <dl className="tour-facts">
              {step.facts.map(f => (
                <div key={f.cite + f.label}>
                  <dt>{f.value}</dt>
                  <dd>{f.label} <a href={f.url} target="_blank" rel="noreferrer" title={f.title}>{f.cite}</a></dd>
                </div>
              ))}
            </dl>
          )}
          <div className="tour-actions">
            {demo && <a className="btn primary" href={step.show.hash} onClick={() => setTourStep(at)}><MousePointerClick size={16} />Show me in the app</a>}
            <span className="tour-nav">
              <button className="btn ghost" onClick={() => setAt(a => a - 1)} disabled={at === 0}><ArrowLeft size={16} />Back</button>
              {at < TOUR.length - 1
                ? <button className="btn" onClick={() => setAt(a => a + 1)}>Next: {TOUR[at + 1].title.split(',')[0]}<ArrowRight size={16} /></button>
                : <a className="btn" href="#/overview" onClick={() => setTourStep(null)}>Finish the tour</a>}
            </span>
          </div>
        </div>
      </article>
    </div>
  )
}

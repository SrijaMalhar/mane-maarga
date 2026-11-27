import { useEffect, useState } from 'react'
import { ArrowRight, BookOpen, X } from 'lucide-react'
import { TOUR, setTourStep, tourStep } from '../lib/tour'

/** Follows the visitor through the app during the tour: what to look at here, and the next step. */
export default function TourBar({ routeKey }: { routeKey: string }) {
  const [at, setAt] = useState(tourStep)
  useEffect(() => {
    const on = () => setAt(tourStep())
    window.addEventListener('mm-tour', on)
    return () => window.removeEventListener('mm-tour', on)
  }, [])

  const step = at === null ? null : TOUR[at]
  // Find the part of the page this step is about, ring it and bring it into view.
  useEffect(() => {
    if (!step || routeKey === 'tour') return
    let tries = 0; let el: Element | null = null
    const id = setInterval(() => {
      el = document.querySelector(step.show.selector)
      if (el || ++tries > 40) {
        clearInterval(id)
        if (el) { el.classList.add('tour-target'); el.scrollIntoView({ block: 'center', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }) }
      }
    }, 120)
    return () => { clearInterval(id); document.querySelectorAll('.tour-target').forEach(x => x.classList.remove('tour-target')) }
  }, [step, routeKey])

  if (!step || at === null || routeKey === 'tour') return null
  const next = TOUR[at + 1]
  return (
    <aside className="tour-bar" aria-label="Guided tour">
      <span className="tb-n">{at + 1}/{TOUR.length}</span>
      <p><b><span lang="kn">{step.kn}</span> {step.title}.</b> {step.show.hint}</p>
      <span className="tb-actions">
        <a className="btn ghost small" href="#/tour"><BookOpen size={15} />The story</a>
        {next
          ? <a className="btn primary small" href={next.show.hash} onClick={() => setTourStep(at + 1)}>Next: {next.kn}<ArrowRight size={15} /></a>
          : <a className="btn primary small" href="#/tour" onClick={() => setTourStep(at)}>Back to the end</a>}
        <button className="tb-x" onClick={() => setTourStep(null)} aria-label="End the tour"><X size={16} /></button>
      </span>
    </aside>
  )
}

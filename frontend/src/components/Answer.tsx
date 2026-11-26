/* The first thing on a working page: the answer, in one sentence, with the two or three figures behind it.
   Everything below it on the page is detail. */
import type { ReactNode } from 'react'

export type Fig = { label: ReactNode; value: ReactNode; tone?: 'warn' | 'good' | 'plain'; note?: ReactNode }

export default function Answer({ kn, children, figs = [], action }: { kn?: string; children: ReactNode; figs?: Fig[]; action?: ReactNode }) {
  return (
    <section className="answer">
      <div className="answer-say">
        {kn && <p className="answer-kn" lang="kn">{kn}</p>}
        <p className="answer-text">{children}</p>
        {action && <div className="answer-action">{action}</div>}
      </div>
      {figs.length > 0 && (
        <dl className="answer-figs">
          {figs.map((f, i) => (
            <div key={i} className={f.tone ?? 'plain'}>
              <dt>{f.label}</dt>
              <dd>{f.value}</dd>
              {f.note && <p>{f.note}</p>}
            </div>
          ))}
        </dl>
      )}
    </section>
  )
}

/* Karnataka's PMAY-G progress from public records: the problem Mane Maarga works on, in real numbers.
   Every figure links to the Parliament answer or PIB document it came from. */
import KA from '../generated/public/ka_pmayg_progress.json'

type Src = keyof typeof KA.sources
const n = (v: number) => v.toLocaleString('en-IN')
const date = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
export const KA_FIGS = (() => {
  const k = KA.latest.karnataka, i = KA.latest.india
  return { open: k.sanctioned - k.completed, ka: (100 * k.completed) / k.sanctioned, india: (100 * i.completed) / i.sanctioned, k, i, asOn: KA.latest.as_on }
})()

function Cite({ s }: { s: Src }) {
  const src = KA.sources[s]
  return <a className="pf-cite" href={src.url} target="_blank" rel="noreferrer" title={src.title}>{src.short}</a>
}

export default function PublicFigures({ variant = 'full' }: { variant?: 'full' | 'compact' | 'line' }) {
  const f = KA_FIGS
  if (variant === 'line') return (
    <aside className="pf-line" aria-label="Karnataka context from public records">
      <span className="pf-line-label">Karnataka, from public records</span>
      <span><b>{f.ka.toFixed(1)}%</b> of sanctioned PMAY-G houses completed, against <b>{f.india.toFixed(1)}%</b> across India. <b>{n(f.open)}</b> sanctioned houses are not yet finished.</span>
      <span className="pf-line-src">As on {date(f.asOn)}, <Cite s="LS3722" /></span>
    </aside>
  )
  const maxS = Math.max(...KA.series.map(p => p.sanctioned))
  return (
    <section className={`pf pf-${variant}`} aria-labelledby={`pf-${variant}`}>
      <div className="pf-lead">
        <p className="pf-kn" lang="kn">ಕರ್ನಾಟಕದಲ್ಲಿ {n(f.open)} ಮನೆಗಳು ಮಂಜೂರಾಗಿವೆ, ಆದರೆ ಇನ್ನೂ ಪೂರ್ಣಗೊಂಡಿಲ್ಲ.</p>
        <h2 id={`pf-${variant}`}><span className="pf-big">{n(f.open)}</span> houses sanctioned in Karnataka are not yet finished.</h2>
        <p className="pf-sub">Karnataka has completed {f.ka.toFixed(1)}% of the PMAY-G houses it has sanctioned; across India the figure is {f.india.toFixed(1)}%. A sanction is not a home. The gap is where families wait for money, documents and the next instalment.</p>
      </div>
      <div className="pf-bars" role="img" aria-label={`Completed as a share of sanctioned: Karnataka ${f.ka.toFixed(1)} percent, India ${f.india.toFixed(1)} percent`}>
        {[['Karnataka', f.ka, f.k], ['All India', f.india, f.i]].map(([label, pct, row]) => (
          <div className="pf-bar" key={label as string}>
            <span className="pf-bar-label">{label as string}</span>
            <span className="pf-track"><i style={{ width: `${pct}%` }} /></span>
            <span className="pf-pct">{(pct as number).toFixed(1)}%</span>
            <span className="pf-detail">{n((row as typeof f.k).completed)} of {n((row as typeof f.k).sanctioned)} sanctioned houses completed</span>
          </div>
        ))}
        <p className="pf-src">As on {date(f.asOn)} · <Cite s="LS3722" /></p>
      </div>
      {variant === 'full' && (
        <div className="pf-series">
          <p className="pf-series-title">Karnataka over time: sanctions grew faster than homes were finished</p>
          {KA.series.map(p => (
            <div className="pf-row" key={p.as_on}>
              <span className="pf-date">{date(p.as_on)}</span>
              <span className="pf-stack">
                <i className="s" style={{ width: `${(p.sanctioned / maxS) * 100}%` }}><b style={{ width: `${(p.completed / p.sanctioned) * 100}%` }} /></i>
              </span>
              <span className="pf-nums">{n(p.completed)} of {n(p.sanctioned)}</span>
              <Cite s={p.source as Src} />
            </div>
          ))}
          <p className="pf-key"><span><i className="done" /> Completed</span><span><i className="san" /> Sanctioned, not yet complete</span></p>
          <p className="pf-src">Since FY 2024-25 alone, Karnataka sanctioned {n(KA.new_phase.karnataka_sanctioned)} more houses (as on {date(KA.new_phase.as_on)}, <Cite s="LS428" />).</p>
        </div>
      )}
    </section>
  )
}

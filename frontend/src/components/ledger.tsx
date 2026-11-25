/* Ledger components: the interface is drawn like a panchayat register, not a dashboard.
   Ruled lines, figures in mono, official things stamped in indigo, corrections in red pen. */
import type { ReactNode } from 'react'
import { formatINR } from '../lib/money'

export type LedgerColumn<T> = { key: string; label: ReactNode; money?: boolean; render?: (row: T) => ReactNode; width?: string }

/** A ruled register. Money columns are right-aligned in mono; the optional total row is double-ruled. */
export function LedgerTable<T extends Record<string, unknown>>({ caption, columns, rows, total, rowKey }: {
  caption?: ReactNode; columns: LedgerColumn<T>[]; rows: T[]; total?: Partial<Record<string, ReactNode>>; rowKey?: (r: T, i: number) => string | number
}) {
  const cell = (c: LedgerColumn<T>, r: T) => c.render ? c.render(r) : c.money ? formatINR(r[c.key] as number) : (r[c.key] as ReactNode)
  return (
    <table className="ledger">
      {caption && <caption>{caption}</caption>}
      <thead><tr>{columns.map(c => <th key={c.key} className={c.money ? 'm' : undefined} style={c.width ? { width: c.width } : undefined}>{c.label}</th>)}</tr></thead>
      <tbody>{rows.map((r, i) => <tr key={rowKey ? rowKey(r, i) : i}>{columns.map(c => <td key={c.key} className={c.money ? 'm' : undefined}>{cell(c, r)}</td>)}</tr>)}</tbody>
      {total && <tfoot><tr>{columns.map(c => <td key={c.key} className={c.money ? 'm' : undefined}>{total[c.key] ?? ''}</td>)}</tr></tfoot>}
    </table>
  )
}

/** A clause ID or an official figure, stamped. Unverified clauses get a dashed stamp. */
export function Stamp({ children, verified = true, title }: { children: ReactNode; verified?: boolean; title?: string }) {
  return <span className={`stamp${verified ? '' : ' unverified'}`} title={title ?? (verified ? 'From an official source' : 'Secondary source: not yet verified')}>{children}</span>
}

/** A correction, as a reviewer would make it: the old value struck, the new one in red pen. */
export function RedPen({ was, now, note }: { was?: ReactNode; now?: ReactNode; note?: ReactNode }) {
  return (
    <span className="redpen">
      {was !== undefined && <s>{was}</s>}
      {now !== undefined && <ins>{now}</ins>}
      {note && <em>{note}</em>}
    </span>
  )
}

/** A note in the margin, numbered like a footnote. */
export function Footnote({ n, children }: { n: number | string; children: ReactNode }) {
  return <aside className="footnote"><sup>{n}</sup><span>{children}</span></aside>
}
export const Margin = Footnote

/** One rung of the money ladder: what the stage costs, what lands after it, and the cash to find first. */
export function InkRung({ label, cost, instalment, gap, scale }: { label: ReactNode; cost: number; instalment: number; gap: number; scale: number }) {
  const w = (v: number) => `${Math.max(0, Math.min(100, (v / scale) * 100))}%`
  return (
    <div className="ink-rung">
      <span className="ink-rung-label">{label}</span>
      <span className="ink-rung-bars" aria-hidden>
        <i className="cost" style={{ width: w(cost) }} />
        <i className="inst" style={{ width: w(instalment) }} />
      </span>
      <span className="ink-rung-fig">{formatINR(cost)}</span>
      <span className={`ink-rung-fig${gap > 0 ? ' gap' : ''}`}>{gap > 0 ? formatINR(gap) : '—'}</span>
    </div>
  )
}

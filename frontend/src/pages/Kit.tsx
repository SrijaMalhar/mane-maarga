/* Dev-only reference sheet for the design system (#/kit when running `npm run dev`). */
import { Footnote, InkRung, LedgerTable, RedPen, Stamp } from '../components/ledger'
import { formatINR } from '../lib/money'

const SWATCHES = ['lime', 'surface', 'well', 'rule', 'charcoal', 'neem', 'laterite', 'stamp', 'redpen', 'turmeric']
const SCALE = [13, 15, 17, 21, 28, 40, 64]
const rows = [
  { source: 'PMAY-G unit assistance', status: 'Confirmed', amount: 120000 },
  { source: 'Scheme loan (proposed)', status: 'Proposed', amount: 70000 },
  { source: 'Own savings', status: 'Stated', amount: 20000 },
]

export default function Kit() {
  return (
    <main className="kit">
      <header><p className="eyebrow">Design kit · development only</p><h1 style={{ fontSize: 'var(--t6)' }}>Ink, Lime and Laterite</h1>
        <p lang="kn" style={{ fontFamily: 'var(--font-kn-display)', fontSize: 'var(--t5)' }}>ಮನೆಗೆ ದಾರಿ, ಬದುಕಿಗೆ ಭರವಸೆ</p></header>
      <section><h2>Colour</h2><div className="swatches">{SWATCHES.map(n => <div key={n}><span style={{ background: `var(--${n})` }} /><b>--{n}</b></div>)}</div></section>
      <section><h2>Type scale</h2>{SCALE.map(px => <p key={px} style={{ fontSize: px, lineHeight: 1.25 }}>{px}px · Every family deserves a safe home · <span lang="kn">ಸುರಕ್ಷಿತ ಮನೆ</span></p>)}
        <p className="mono">IBM Plex Mono · {formatINR(1234567)} · KA-PMAYG-2024-25:AM-01</p></section>
      <section><h2>LedgerTable</h2>
        <LedgerTable caption="Funding sources" columns={[{ key: 'source', label: 'Source' }, { key: 'status', label: 'Status' }, { key: 'amount', label: 'Amount', money: true }]}
          rows={rows} total={{ source: 'Total stated', amount: formatINR(rows.reduce((a, r) => a + r.amount, 0)) }} /></section>
      <section><h2>Stamp, RedPen, Footnote</h2>
        <p><Stamp>KA-PMAYG-2024-25:AM-01</Stamp> <Stamp verified={false}>KA-PMAYG-2024-25:EX-08</Stamp></p>
        <p style={{ marginTop: 12 }}>Village: <RedPen was="Hosahali" now="Hosahalli" note="Matched to the RTC extract" /></p>
        <Footnote n={1}>Stage split is illustrative until the official order is in the rule pack.</Footnote></section>
      <section><h2>InkRung</h2>
        <InkRung label="Plinth" cost={75000} instalment={30000} gap={55000} scale={100000} />
        <InkRung label="Lintel" cost={90000} instalment={42000} gap={0} scale={100000} /></section>
    </main>
  )
}

/** Rupees with Indian digit grouping (₹1,20,000). The one formatter for money on screen. */
export function formatINR(value: number | null | undefined, opts: { sign?: boolean } = {}): string {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '₹—'
  const n = Math.round(Number(value))
  const s = String(Math.abs(n))
  const grouped = s.length > 3 ? `${s.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',')},${s.slice(-3)}` : s
  const sign = n < 0 ? '−' : opts.sign && n > 0 ? '+' : ''
  return `${sign}₹${grouped}`
}

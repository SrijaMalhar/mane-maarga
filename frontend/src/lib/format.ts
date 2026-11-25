import { formatINR } from './money'
export const inr = (n: number | null | undefined) => formatINR(Number(n || 0))

/** ₹1,20,000 → ₹1.2 L for tight spaces. */
export function inrShort(n: number) {
  const v = Number(n || 0)
  if (v >= 1e7) return `₹${(v / 1e7).toFixed(v % 1e7 ? 1 : 0)} Cr`
  if (v >= 1e5) return `₹${(v / 1e5).toFixed(v % 1e5 ? 1 : 0)} L`
  if (v >= 1e3) return `₹${Math.round(v / 1e3)}k`
  return `₹${v}`
}

/** SQLite returns UTC timestamps without a zone; treat those as UTC, not local time. */
export function parseTime(iso: string | null | undefined): Date | null {
  if (!iso) return null
  const d = new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(iso) ? iso : `${iso.replace(' ', 'T')}Z`)
  return Number.isNaN(d.getTime()) ? null : d
}

/** snake_case enum → "Sentence case". */
export const human = (s: string) => { const t = s.replace(/_/g, ' ').trim(); return t.charAt(0).toUpperCase() + t.slice(1) }

export function dateShort(iso: string | null | undefined, lang: 'en' | 'kn' = 'en') {
  const d = parseTime(iso)
  if (!d) return '—'
  return d.toLocaleDateString(lang === 'kn' ? 'kn-IN' : 'en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

export function timeAgo(iso: string | null | undefined) {
  const d = parseTime(iso)
  if (!d) return ''
  const s = (Date.now() - d.getTime()) / 1000
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}

export const initials = (name: string) => name.replace(/\(.*?\)/g, '').trim().split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0]?.toUpperCase() ?? '').join('')
export const bytes = (n: number) => (n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`)

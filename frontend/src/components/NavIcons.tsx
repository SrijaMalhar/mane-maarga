/** Hand-drawn line icons for the navigation rail, drawn from building and village motifs. */
type P = { size?: number }
const base = (size: number) => ({ width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true })

/** A path winding up to a house. */
export const IconOverview = ({ size = 22 }: P) => <svg {...base(size)}><path d="M14 4.5 18 2l4 2.5V9h-8z" /><path d="M17 9V7h2v2" /><path d="M3 21c3-1 3-4 6-5s5 0 7-2 1-3 2-5" strokeDasharray="2 2.4" /><circle cx="3" cy="21" r="1" fill="currentColor" /></svg>
/** Three households under one roof line. */
export const IconPeople = ({ size = 22 }: P) => <svg {...base(size)}><path d="M2 10 12 3l10 7" /><circle cx="7" cy="13" r="2" /><circle cx="12" cy="12" r="2.2" /><circle cx="17" cy="13" r="2" /><path d="M3.5 21c.4-2.6 1.7-4 3.5-4s3 1.4 3.4 4M8.6 21c.5-3 1.6-4.6 3.4-4.6s3 1.6 3.4 4.6M13.6 21c.4-2.6 1.6-4 3.4-4s3.1 1.4 3.5 4" /></svg>
/** A document with a seal. */
export const IconVerify = ({ size = 22 }: P) => <svg {...base(size)}><path d="M5 2.5h9l4 4V13" /><path d="M14 2.5v4h4" /><path d="M5 2.5v18h7" /><path d="M8 8h5M8 11h7M8 14h4" /><circle cx="17.5" cy="17.5" r="3.5" /><path d="m16 17.5 1.1 1.1 2.1-2.2" /></svg>
/** Coins stacked like bricks. */
export const IconFinance = ({ size = 22 }: P) => <svg {...base(size)}><ellipse cx="8" cy="6" rx="5" ry="2" /><path d="M3 6v3c0 1.1 2.2 2 5 2s5-.9 5-2V6" /><path d="M3 9v3c0 1.1 2.2 2 5 2" /><ellipse cx="16" cy="14" rx="5" ry="2" /><path d="M11 14v3c0 1.1 2.2 2 5 2s5-.9 5-2v-3" /><path d="M11 17v3c0 1.1 2.2 2 5 2s5-.9 5-2v-3" /></svg>
/** A wall going up with scaffold. */
export const IconBuild = ({ size = 22 }: P) => <svg {...base(size)}><path d="M3 21h18" /><path d="M5 21v-9h10v9" /><path d="M5 15h10M5 18h10M10 12v3M7.5 15v3M12.5 15v3M10 18v3" /><path d="M18 21V5M21 21V5M18 9h3M18 13h3M18 17h3" /></svg>
/** A lamp: light on a decision, not the decision. */
export const IconInsight = ({ size = 22 }: P) => <svg {...base(size)}><path d="M9 3h6l1 3H8z" /><path d="M8 6c0 4-2 5-2 9h12c0-4-2-5-2-9" /><path d="M12 9.5c-1.2 1.4-1.2 2.8 0 4 1.2-1.2 1.2-2.6 0-4z" /><path d="M6 15v3h12v-3M9 21h6M10 18v3M14 18v3" /></svg>
/** A tape reel with a chain link: the sealed record of a run. */
export const IconRecorder = ({ size = 22 }: P) => <svg {...base(size)}><circle cx="8" cy="10" r="5" /><circle cx="8" cy="10" r="1.5" /><path d="M8 15h9a3 3 0 0 0 3-3V5" /><path d="M14 19.5h3M14 19.5a1.5 1.5 0 0 1 0-3h1M17 16.5h1a1.5 1.5 0 0 1 0 3" /></svg>
/** A ledger with a ribbon. */
export const IconLedger = ({ size = 22 }: P) => <svg {...base(size)}><path d="M5 3h12a2 2 0 0 1 2 2v16H7a2 2 0 0 1-2-2z" /><path d="M5 19a2 2 0 0 1 2-2h12" /><path d="M9 7h6M9 10h6M9 13h4" /><path d="M15 17v5l1.5-1 1.5 1v-5" /></svg>
/** Keys on a ring. */
export const IconTeam = ({ size = 22 }: P) => <svg {...base(size)}><circle cx="8" cy="8" r="4.5" /><circle cx="8" cy="8" r="1.4" /><path d="m11.2 11.2 8.3 8.3M16 16l2-2M18.2 18.2l1.8-1.8" /></svg>

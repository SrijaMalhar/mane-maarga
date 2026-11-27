/**
 * The guided tour: one family's path from a first visit to the keys, step by step.
 * Rules and amounts are read from the cited Karnataka rule pack and the public PMAY-G dataset,
 * so every figure on the tour carries the clause or record it came from.
 */
import KA_PMAYG from '../generated/rules/KA__pmayg__2024-25.json'
import KA from '../generated/public/ka_pmayg_progress.json'
import type { TourArtKey } from '../components/TourArt'

export type Fact = { value: string; label: string; cite: string; url: string; title: string }
export type TourStep = {
  id: string; art: TourArtKey; kn: string; title: string; who: string; body: string; facts: Fact[]
  show: { hash: string; selector: string; hint: string }
}

type Clause = { id: string; value?: number; text_en: string; source: { title: string; url: string } }
const pack = KA_PMAYG as unknown as { amounts: Clause[]; timelines: Clause[]; eligibility_rules: Clause[]; exclusion_rules: Clause[] }
const all: Clause[] = [...pack.amounts, ...pack.timelines, ...pack.eligibility_rules, ...pack.exclusion_rules]
const inr = (v: number) => `₹${v.toLocaleString('en-IN')}`
function clause(id: string, value: (c: Clause) => string, label?: string): Fact {
  const c = all.find(x => x.id === id)
  if (!c) throw new Error(`Tour cites a clause the rule pack does not have: ${id}`)
  return { value: value(c), label: label ?? c.text_en, cite: id.split(':')[1], url: c.source.url, title: c.source.title }
}
const LS = KA.sources.LS3722
const k = KA.latest.karnataka
const record = (value: string, label: string): Fact => ({ value, label, cite: LS.short, url: LS.url, title: LS.title })

export const SAMPLE_NOTE = 'The family in this tour (Saroja B, Bidadi) is invented to protect real families. The figures, rules and villages are real and cited.'

export const TOUR: TourStep[] = [
  {
    id: 'problem', art: 'problem', kn: 'ಸಮಸ್ಯೆ', title: 'Sanctioned is not the same as built', who: 'Karnataka, 7 Aug 2025',
    body: 'Lakhs of families in Karnataka have a house sanctioned under PMAY-G that is still not finished. Most stall in the same places: missing papers, money that arrives after the work, and families who cannot read the forms.',
    facts: [
      record(k.sanctioned.toLocaleString('en-IN'), 'houses sanctioned in Karnataka'),
      record(`${((100 * k.completed) / k.sanctioned).toFixed(1)}%`, `finished (${k.completed.toLocaleString('en-IN')})`),
      record((k.sanctioned - k.completed).toLocaleString('en-IN'), 'sanctioned but not finished'),
    ],
    show: { hash: '#/overview', selector: '.pf-line', hint: 'These Karnataka figures sit under every overview, linked to the answer in Parliament.' },
  },
  {
    id: 'voice', art: 'voice', kn: 'ಕೇಳು', title: 'A first visit, in Kannada', who: 'Field officer, at the family’s home',
    body: 'The officer asks eight intake questions aloud in Kannada, in a recorded human voice, and types the answers. Eligibility is checked against the scheme’s own rules, not guessed.',
    facts: [clause('KA-PMAYG-2024-25:EL-01', () => 'Eligible', undefined), clause('KA-PMAYG-2024-25:EX-01', () => 'Excluded', undefined)],
    show: { hash: '#/intelligence?case=7', selector: '.intel-tools', hint: 'Open the Kannada intake here and press play: each question is spoken, then answered by voice or by typing.' },
  },
  {
    id: 'consent', art: 'consent', kn: 'ಒಪ್ಪಿಗೆ', title: 'Consent before anything else', who: 'Family and officer',
    body: 'The consent text is read out and recorded with its scope and version. Until it is given, the case cannot move to the next stage, and a withdrawal stops processing.',
    facts: [],
    show: { hash: '#/case/7', selector: '.cf-consent', hint: 'Saroja’s consent record: who recorded it, for what, and which version of the text.' },
  },
  {
    id: 'papers', art: 'papers', kn: 'ಪರಿಶೀಲನೆ', title: 'Papers checked against the case', who: 'Reviewer at the taluk office',
    body: 'Uploaded documents are read field by field and compared with the case file. Anything that differs is struck through in red pen. The software suggests; the reviewer approves, asks for a correction or rejects.',
    facts: [],
    show: { hash: '#/verification', selector: '.vd', hint: 'Pick the land record and press Read document: a village that does not match shows in red pen.' },
  },
  {
    id: 'money', art: 'money', kn: 'ಲೆಕ್ಕ', title: 'The cash needed before each instalment', who: 'Computed in code from cited rules',
    body: 'Assistance comes in instalments after each stage is built, so a family must spend first. The money ladder shows, stage by stage, how much cash they need in hand before the next instalment arrives.',
    facts: [
      clause('KA-PMAYG-2024-25:AM-01', c => inr(c.value!), 'unit assistance in plain areas'),
      clause('KA-PMAYG-2024-25:TM-01', c => `${c.value} working days`, 'for the first instalment to reach the bank account after sanction'),
      clause('KA-PMAYG-2024-25:AM-02', c => inr(c.value!), 'institutional loan, at most'),
      clause('KA-PMAYG-2024-25:AM-03', c => `${c.value} points`, 'lower interest on that loan'),
    ],
    show: { hash: '#/finance?case=7', selector: '.fin-ladder-wide', hint: 'Type a different amount in Own savings and watch every rung of the ladder change.' },
  },
  {
    id: 'approve', art: 'approve', kn: 'ಒಪ್ಪಿಗೆ ಕೋಡ್', title: 'The family says yes, on their own phone', who: 'Family, by one-time code',
    body: 'A loan request or an instalment claim is only drafted. It goes out after the family reads it in Kannada and confirms with a one-time code: valid five minutes, three tries, used once.',
    facts: [clause('KA-PMAYG-2024-25:AM-02', c => inr(c.value!), 'the loan a family can be asked to approve')],
    show: { hash: '#/case/1', selector: '.cf-approvals', hint: 'Press Open the family’s phone, then ಒಪ್ಪುತ್ತೇನೆ, and type the code the SMS shows.' },
  },
  {
    id: 'photo', art: 'photo', kn: 'ಫೋಟೋ', title: 'Each stage proven by a site photo', who: 'Field officer, then reviewer',
    body: 'A stage counts only after a reviewer accepts a site photo. Each photo is checked for where it was taken (distance from the plot pin), when, and whether the same picture was already filed for another family.',
    facts: [],
    show: { hash: '#/construction?case=7', selector: '.stage-track', hint: 'On Walls to lintel, press Problem photo, then open it: three warnings, with the original photo beside it.' },
  },
  {
    id: 'recorder', art: 'recorder', kn: 'ದಾಖಲೆ', title: 'The assistant is recorded, step by step', who: 'Agent, citation guard, flight recorder',
    body: 'An agent drafts the next steps for a case. Every rupee in its answer must trace to a tool result or a rule clause, and every step is sealed in a hash chain, so an edited record is caught at the exact step.',
    facts: [],
    show: { hash: '#/intelligence?case=7', selector: 'section[aria-labelledby="ar-h"]', hint: 'Press Run the agent, then open the run in the flight recorder and play it back.' },
  },
  {
    id: 'keys', art: 'keys', kn: 'ಕೀಲಿ', title: 'Keys handed over', who: 'Gowramma, Kudur (sample family)',
    body: 'The house is finished when its last stage is verified against an accepted photo. The case closes with every rupee, document and decision on record.',
    facts: [
      clause('KA-PMAYG-2024-25:AM-05', c => `${c.value} sq m`, 'minimum house size'),
      clause('KA-PMAYG-2024-25:AM-04', c => inr(c.value!), 'for a toilet, through Swachh Bharat Mission (Gramin)'),
    ],
    show: { hash: '#/construction?case=5', selector: '.build-hero', hint: 'Gowramma’s house: all four stages verified, each against its own photo.' },
  },
]

/* Tour position, kept per browser tab so the bar can follow the visitor across pages. */
const KEY = 'mm_tour_step'
export function tourStep(): number | null { try { const v = sessionStorage.getItem(KEY); return v === null ? null : Number(v) } catch { return null } }
export function setTourStep(n: number | null) {
  try { if (n === null) sessionStorage.removeItem(KEY); else sessionStorage.setItem(KEY, String(n)) } catch { /* private mode */ }
  window.dispatchEvent(new Event('mm-tour'))
}

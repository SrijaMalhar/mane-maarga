import { useEffect, useRef, useState } from 'react'
import { Pause, Play } from 'lucide-react'
import Mascot from '../components/Mascot'
import House from '../components/House'
import VillageScene, { Photo } from '../components/VillageScene'
import { RedPen, Stamp } from '../components/ledger'
import { LanguageSwitch, useI18n } from '../lib/i18n'
import { formatINR } from '../lib/money'
import { ladder } from '../lib/demo'
import PublicFigures from '../components/PublicFigures'
import KA from '../generated/rules/KA__pmayg__2024-25.json'

const journey = [
  { kn: 'ಗುರುತಿಸುವಿಕೆ', en: 'Meet the family' },
  { kn: 'ಅಗತ್ಯ', en: 'Understand the need' },
  { kn: 'ದಾಖಲೆಗಳು', en: 'Check documents' },
  { kn: 'ನೆರವು', en: 'Find the scheme' },
  { kn: 'ಹಣಕಾಸು', en: 'Plan the money' },
  { kn: 'ನಿರ್ಮಾಣ', en: 'Build, stage by stage' },
  { kn: 'ಮನೆ', en: 'Hand over the keys' },
]

const clause = (id: string) => [...KA.amounts, ...KA.exclusion_rules].find(c => c.id === id)!

/* ---------- the six artifacts: small, real pieces of the product ---------- */

function LadderArtifact() {
  const l = ladder(300000, 25000)
  const max = Math.max(...l.rungs.map(r => r.cost))
  return (
    <figure className="art art-ladder">
      <figcaption>A ₹3,00,000 home, ₹25,000 saved, no loan yet</figcaption>
      <div className="art-ladder-head" aria-hidden><span>Stage</span><span /><span className="c">Stage cost</span><span>Short before the instalment</span></div>
      {l.rungs.map(r => (
        <div className="art-rung" key={r.stage}>
          <span className="art-rung-label">{r.label}</span>
          <span className="art-rung-bars" aria-hidden>
            <i className="cost" style={{ width: `${(r.cost / max) * 100}%` }} />
            <i className="inst" style={{ width: `${(r.instalment_after / max) * 100}%` }} />
          </span>
          <span className="art-fig c">{formatINR(r.cost)}</span>
          <span className={`art-fig${r.cash_gap_before_instalment > 0 ? ' due' : ''}`}>{r.cash_gap_before_instalment > 0 ? formatINR(r.cash_gap_before_instalment) : 'nil'}</span>
        </div>
      ))}
      <p className="art-key"><span><i className="cost" /> Stage cost</span><span><i className="inst" /> Instalment paid after the stage is checked</span></p>
    </figure>
  )
}

function RuleArtifact() {
  const am = clause('KA-PMAYG-2024-25:AM-01'), ex = clause('KA-PMAYG-2024-25:EX-08')
  return (
    <figure className="art art-rule">
      <div className="art-clause">
        <Stamp>{am.id}</Stamp>
        <p className="art-clause-kn" lang="kn">{am.text_kn}</p>
        <p>{am.text_en}</p>
        <p className="art-source">Source: {am.source.title.split(',')[0]}, {am.source.locator}</p>
      </div>
      <div className="art-clause muted-clause">
        <Stamp verified={false}>{ex.id}</Stamp>
        <p>{ex.text_en.replace(' (secondary source; confirm in the official order)', '')}</p>
        <p className="art-source">Taken from a news report, so marked unverified until the official order is found.</p>
      </div>
    </figure>
  )
}

function PhoneArtifact() {
  return (
    <figure className="art art-phone" aria-label="The family's approval screen">
      <div className="mini-phone" lang="kn">
        <p className="mp-hello">ನಮಸ್ಕಾರ ಲಕ್ಷ್ಮಮ್ಮ.</p>
        <p className="mp-title">ಸಾಲವನ್ನು ಒಪ್ಪಿಕೊಳ್ಳುವುದು</p>
        <p className="mp-body">ಗ್ರಾಮೀಣ ಬ್ಯಾಂಕ್‌ನಿಂದ ₹70,000 ಸಾಲ. ಇದನ್ನು ಮರುಪಾವತಿ ಮಾಡಬೇಕು.</p>
        <p className="mp-amount">₹70,000</p>
        <div className="mp-code" aria-label="Six-digit code">{'748941'.split('').map((d, i) => <span key={i}>{d}</span>)}</div>
        <p className="mp-yes">ದೃಢಪಡಿಸಿ</p>
      </div>
      <figcaption>The family reads it in Kannada, then confirms with the code sent to their phone.</figcaption>
    </figure>
  )
}

function GuardArtifact() {
  const steps: Array<[string, string, string?]> = [
    ['PLAN', 'Read the case, then the money'],
    ['ACT', 'get_case'],
    ['ACT', 'build_money_ladder'],
    ['CHECK', '₹2,00,000 top-up grant: not in any tool result or cited rule', 'blocked'],
  ]
  return (
    <figure className="art art-guard">
      <ol>
        {steps.map(([ph, txt, st], i) => (
          <li key={i} className={st}><span className="ph">{ph}</span><span>{txt}</span></li>
        ))}
      </ol>
      <p className="art-withheld">Answer withheld. Staff see the reason, not the invented grant.</p>
    </figure>
  )
}

function VoiceArtifact() {
  const audio = useRef<HTMLAudioElement | null>(null)
  const [playing, setPlaying] = useState(false)
  useEffect(() => () => audio.current?.pause(), [])
  function toggle() {
    if (!audio.current) {
      audio.current = new Audio('/audio/kn/start.mp3')
      audio.current.onended = () => setPlaying(false)
    }
    if (playing) { audio.current.pause(); setPlaying(false) } else { audio.current.currentTime = 0; void audio.current.play().then(() => setPlaying(true)).catch(() => setPlaying(false)) }
  }
  return (
    <figure className="art art-voice">
      <div className="art-bubble" lang="kn">ನಮಸ್ಕಾರ. ನಿಮ್ಮ ಮನೆ ಕೆಲಸಕ್ಕೆ ಸಹಾಯ ಮಾಡೋಕೆ ಕೆಲವು ವಿಷಯ ಕೇಳ್ತೀನಿ. ಮೊದಲು, ನಿಮ್ಮ ಹೆಸರು ಹೇಳಿ.</div>
      <button className="art-play" onClick={toggle} aria-pressed={playing}>
        {playing ? <Pause size={18} /> : <Play size={18} />} {playing ? 'Playing the first question' : 'Hear the first question'}
      </button>
      <div className="art-bubble mine" lang="kn">ಲಕ್ಷ್ಮಮ್ಮ</div>
    </figure>
  )
}

function DocArtifact() {
  return (
    <figure className="art art-doc">
      <table>
        <thead><tr><th>Field</th><th>Land record (RTC)</th><th>Case file</th></tr></thead>
        <tbody>
          <tr><td>Owner</td><td>Nagaraju K</td><td>Nagaraju K</td></tr>
          <tr><td>Survey no.</td><td>112/1</td><td>112/1</td></tr>
          <tr className="mismatch"><td>Village</td><td><RedPen was="Kuduru" /></td><td><RedPen now="Kudur" note="Different spelling: reviewer to confirm" /></td></tr>
        </tbody>
      </table>
    </figure>
  )
}

const showcase = [
  {
    id: 'money', kn: 'ಕಂತು ಬರುವ ಮೊದಲು ಬೇಕಾದ ಹಣ', title: 'Shows the cash a family needs before each instalment arrives',
    body: 'PMAY-G pays ₹1,20,000 in instalments, each released after a stage is checked. The mason and the cement are paid before that. The money ladder shows, stage by stage, how much a family must find first, kept apart from the gap no scheme covers.',
    where: 'Financial planning', art: <LadderArtifact />,
  },
  {
    id: 'rules', kn: 'ಪ್ರತಿ ನಿಯಮಕ್ಕೂ ಆಧಾರ', title: 'Every rule and rupee points to its source',
    body: 'Amounts and eligibility rules live in a dated rule file. Each clause has an ID, Kannada and English text, and the government document it came from. A missing fact gives "needs information", never a guess.',
    where: 'Every amount in the app', art: <RuleArtifact />,
  },
  {
    id: 'consent', kn: 'ಕುಟುಂಬದ ಒಪ್ಪಿಗೆ ಇಲ್ಲದೆ ಏನೂ ಇಲ್ಲ', title: 'Nothing moves without the family saying yes',
    body: 'Payments, loans, submissions and document sharing wait for the family. They get a link that says, in Kannada, what will happen, how much and to whom, and approve with a one-time code. Staff cannot approve on their behalf, and each approved action runs once.',
    where: 'Case file, Approvals', art: <PhoneArtifact />,
  },
  {
    id: 'guard', kn: 'ಊಹಿಸಿದ ಅಂಕಿಗೆ ಜಾಗವಿಲ್ಲ', title: 'The assistant cannot invent a number',
    body: 'The assistant chooses which tool to use; code does the arithmetic. Before an answer reaches staff, a check traces every rupee to a tool result or a cited rule. If it cannot, the answer is withheld and the reason is shown.',
    where: 'Intelligence, Run the agent', art: <GuardArtifact />,
  },
  {
    id: 'voice', kn: 'ನೆರೆಹೊರೆಯವರಂತೆ ಕನ್ನಡದಲ್ಲಿ', title: 'Asks in Kannada, the way a neighbour would',
    body: 'Intake questions are written in everyday spoken Kannada and recorded in a warm voice, so a family can answer by talking instead of filling a form.',
    where: 'Intelligence, Conversational intake', art: <VoiceArtifact />,
  },
  {
    id: 'docs', kn: 'ದಾಖಲೆ ಮತ್ತು ಕಡತದ ತಾಳೆ', title: 'Checks land records against the case',
    body: 'Text is read from uploaded records and compared with the case, field by field. A mismatch is marked in red pen. A reviewer decides; the software never accepts a document on its own.',
    where: 'Verification', art: <DocArtifact />,
  },
]

export default function Landing({ onEnter }: { onEnter: () => void }) {
  const { t, lang } = useI18n()
  return (
    <div className="landing">
      <header className="l-nav">
        <a className="l-brand" href="#top" aria-label="Mane Maarga home">
          <Mascot size={40} />
          <span><b>Mane Maarga</b><small lang="kn">ಮನೆ ಮಾರ್ಗ</small></span>
        </a>
        <nav className="l-links" aria-label="Page sections">
          <a href="#facts">The problem</a><a href="#different">What is different</a><a href="#journey">Journey</a><a href="#never">Safeguards</a>
        </nav>
        <div className="l-nav-right"><LanguageSwitch /><button className="btn primary small" onClick={onEnter}>{t('landing.cta.access')}</button></div>
      </header>

      <section className="l-hero" id="top">
        <div className="l-hero-copy">
          <p className="l-hero-kn" lang="kn">ಮನೆಗೆ ದಾರಿ,<br />ಬದುಕಿಗೆ ಭರವಸೆ</p>
          <h1 className="l-hero-en" lang={lang === 'kn' ? 'kn' : undefined}>{t('landing.headline')}</h1>
          <p className="l-lead">{t('landing.sub')}</p>
          <div className="l-actions">
            <button className="btn primary" onClick={onEnter}>{t('landing.cta.access')}</button>
            <a className="btn ghost" href="#different">See what is different</a>
          </div>
        </div>
        <figure className="l-hero-art">
          <Photo src="/images/hero.jpg" alt="A single-storey home with earthen walls and a sloped roof, set on a green lawn among trees" className="l-hero-photo">
            <VillageScene className="l-hero-photo" />
          </Photo>
          <div className="l-hero-mitra"><Mascot size={96} mood="guide" /></div>
        </figure>
      </section>

      <div className="l-facts" id="facts"><PublicFigures /></div>

      <section className="l-diff" id="different" aria-labelledby="diff-title">
        <header className="l-diff-head">
          <h2 id="diff-title">What only Mane Maarga does</h2>
          <p>Six things that help a family get from a sanction to a finished home. Each one below is a real piece of the product, with the numbers it actually produces.</p>
        </header>
        {showcase.map((s, i) => (
          <article className={`feature${i % 2 ? ' flip' : ''}`} id={s.id} key={s.id} aria-labelledby={`${s.id}-t`}>
            <div className="feature-copy">
              <p className="feature-kn" lang="kn">{s.kn}</p>
              <h3 id={`${s.id}-t`}>{s.title}</h3>
              <p>{s.body}</p>
              <p className="feature-where">Where to see it: <b>{s.where}</b></p>
            </div>
            <div className="feature-art">{s.art}</div>
          </article>
        ))}
      </section>

      <section className="l-path" id="journey" aria-labelledby="journey-title">
        <h2 id="journey-title">{t('landing.story.title')}</h2>
        <p className="l-path-sub">One record follows the family through every office, so nobody loses their place.</p>
        <ol className="path-row">
          {journey.map((s, i) => (
            <li key={s.en}>
              <House level={Math.min(5, Math.max(0, i - 1))} size={84} label={s.en} />
              <span className="path-kn" lang="kn">{s.kn}</span>
              <span className="path-en">{s.en}</span>
            </li>
          ))}
        </ol>
      </section>

      <section className="l-never" id="never" aria-labelledby="never-title">
        <h2 id="never-title">What it will never do</h2>
        <ul>
          <li><b>Decide eligibility, credit or a sanction on its own.</b> It checks cited rules and shows what is missing; officials decide.</li>
          <li><b>Move money or send an application without the family.</b> Their one-time code is the only key, and every step is in the audit trail.</li>
          <li><b>Share a family's documents without consent.</b> Consent is recorded per case and can be withdrawn at any time.</li>
        </ul>
      </section>

      <footer className="l-footer">
        <div>
          <p className="kn-display small" lang="kn">ಪ್ರತಿಯೊಂದು ಕುಟುಂಬಕ್ಕೂ ಒಂದು ಸುರಕ್ಷಿತ ಮನೆ.</p>
          <p>Every family deserves a safe home.</p>
        </div>
        <div className="l-footer-end">
          <button className="btn light" onClick={onEnter}>Open the demo</button>
          <small>A prototype for rural housing assistance in Karnataka. <a href="https://github.com/SrijaMalhar/mane-maarga">Source on GitHub</a></small>
        </div>
      </footer>
    </div>
  )
}

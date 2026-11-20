import { ArrowRight, ShieldCheck, Scale, Eye } from 'lucide-react'
import Logo from '../components/Logo'
import House from '../components/House'
import VillageScene, { Photo, heroPhoto } from '../components/VillageScene'
import { LanguageSwitch, useI18n } from '../lib/i18n'
import { inr } from '../lib/format'

const steps = [
  { kn: 'ಗುರುತಿಸುವಿಕೆ', en: 'Identify the family', text: 'A field worker records the household, village and what they need — with the family\'s consent, in Kannada or English.' },
  { kn: 'ಅಗತ್ಯ', en: 'Understand the need', text: 'Land, household size and the help needed first: documents, scheme guidance, money or construction.' },
  { kn: 'ದಾಖಲೆಗಳು', en: 'Verify documents', text: 'Land records and sanction letters are read and compared with the case. A reviewer confirms every field.' },
  { kn: 'ನೆರವು', en: 'Evaluate assistance', text: 'Scheme references are shown with their official sources. Eligibility is never guessed.' },
  { kn: 'ಹಣಕಾಸು', en: 'Plan the money', text: 'Confirmed, proposed and estimated money are kept apart, so a family sees the true gap before each stage.' },
  { kn: 'ನಿರ್ಮಾಣ', en: 'Track construction', text: 'Plinth, walls, roof, finishing — each stage with its cost and photo evidence for review.' },
  { kn: 'ಮನೆ', en: 'Complete the home', text: 'The keys are handed over. The record shows how every rupee and decision got the family there.' },
]

export default function Landing({ onEnter }: { onEnter: () => void }) {
  const { t, lang } = useI18n()
  return (
    <div className="landing">
      <header className="l-nav">
        <a className="l-brand" href="#top" aria-label="Mane Maarga home">
          <Logo size={38} />
          <span><b>Mane Maarga</b><small lang="kn">ಮನೆ ಮಾರ್ಗ</small></span>
        </a>
        <nav className="l-links" aria-label="Page sections">
          <a href="#journey">Journey</a><a href="#money">Money</a><a href="#trust">Responsible AI</a>
        </nav>
        <div className="l-nav-right"><LanguageSwitch /><button className="btn primary small" onClick={onEnter}>{t('landing.cta.access')}</button></div>
      </header>

      <section className="l-hero" id="top">
        <div className="l-hero-copy">
          <p className="kn-tagline" lang="kn">ಮನೆಗೆ ದಾರಿ, ಬದುಕಿಗೆ ಭರವಸೆ</p>
          <p className="kn-tagline-en">The path to a home. Hope for a better life.</p>
          <h1 className="display" lang={lang === 'kn' ? 'kn' : undefined}>{t('landing.headline')}</h1>
          <p className="l-lead">{t('landing.sub')}</p>
          <div className="l-actions">
            <a className="btn primary" href="#journey">{t('landing.cta.explore')} <ArrowRight size={16} /></a>
            <button className="btn ghost" onClick={onEnter}>{t('landing.cta.access')}</button>
          </div>
        </div>
        <figure className="l-hero-art">
          <Photo {...heroPhoto} alt="An old tiled-roof house in Karnataka's Malenadu region, surrounded by greenery, with a coconut palm casting a long shadow across the grass" className="l-hero-photo"
            credit={<>Photo: Manjunath M M · <a href={heroPhoto.page} target="_blank" rel="noreferrer">CC0, WordPress Photo Directory</a></>}>
            <VillageScene className="l-hero-photo" />
          </Photo>
          <figcaption className="l-hero-plate">
            <span className="plate-num">01</span>
            <span><b>Malenadu, Karnataka</b><small>Tiled roof, lime-washed walls, room to grow</small></span>
          </figcaption>
        </figure>
      </section>

      <section className="l-journey" id="journey" aria-labelledby="journey-title">
        <div className="section-intro">
          <p className="eyebrow">How it works</p>
          <h2 id="journey-title" className="display-2">{t('landing.story.title')}</h2>
          <p>Housing assistance passes through many hands and many offices. Mane Maarga keeps one honest record of the whole path, so nobody loses their place.</p>
        </div>
        <ol className="path">
          {steps.map((s, i) => (
            <li key={s.en} className="path-step" style={{ ['--i' as string]: i }}>
              <div className="path-house"><House level={Math.min(5, Math.max(0, i - 1))} size={96} label={s.en} /></div>
              <div className="path-text">
                <span className="path-num">{String(i + 1).padStart(2, '0')}</span>
                <h3><span lang="kn">{s.kn}</span> {s.en}</h3>
                <p>{s.text}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="l-money" id="money" aria-labelledby="money-title">
        <div className="l-money-copy">
          <p className="eyebrow">Transparent money</p>
          <h2 id="money-title" className="display-2">The subsidy arrives after each stage. The bills arrive before it.</h2>
          <p>Under PMAY-G a family in the plains receives {inr(120000)}, released in instalments as construction is verified. Mane Maarga shows the cash each family must find <em>before</em> each instalment lands — the timing gap — separately from the money the scheme never covers.</p>
          <ul className="ledger-keys">
            <li><span className="key confirmed" />Confirmed — backed by a sanction order or receipt</li>
            <li><span className="key proposed" />Proposed — promised, not yet counted</li>
            <li><span className="key gap" />Gap — what is still missing</li>
          </ul>
          <p className="fine">Illustrative stage split. Verify instalments against current PMAY-G guidelines before relying on them.</p>
        </div>
        <div className="l-money-art" aria-hidden>
          {[{ l: 'Plinth', c: 25, i: 0 }, { l: 'Lintel', c: 30, i: 25 }, { l: 'Roof', c: 30, i: 35 }, { l: 'Finishing', c: 15, i: 25 }].map((r, idx) => (
            <div className="rung" key={r.l}>
              <span className="rung-label">{r.l}</span>
              <span className="rung-bar"><i className="cost" style={{ width: `${r.c * 2.4}%` }} /><i className="inst" style={{ width: `${r.i * 2.4}%` }} /></span>
              <span className="rung-step">{idx + 1}</span>
            </div>
          ))}
          <p className="rung-legend"><span><i className="cost" />Stage cost</span><span><i className="inst" />Instalment already received</span></p>
        </div>
      </section>

      <section className="l-trust" id="trust" aria-labelledby="trust-title">
        <h2 id="trust-title" className="display-2">Technology that assists. People who decide.</h2>
        <div className="trust-cols">
          <div><Eye size={22} /><h3>Every suggestion shows its evidence</h3><p>Case insights list the documents and figures they were drawn from. Extracted text is labelled as unverified until a reviewer confirms it.</p></div>
          <div><Scale size={22} /><h3>No automated eligibility or credit decisions</h3><p>Scheme information is reference material with official links. Financial gaps are indicative and never presented as approvals.</p></div>
          <div><ShieldCheck size={22} /><h3>Consent and an audit trail</h3><p>Consent is recorded per case and can be withdrawn. Uploads, verifications and money entries are logged with who did them.</p></div>
        </div>
      </section>

      <footer className="l-footer">
        <div>
          <p className="kn-display small" lang="kn">ಪ್ರತಿಯೊಂದು ಕುಟುಂಬಕ್ಕೂ ಒಂದು ಸುರಕ್ಷಿತ ಮನೆ.</p>
          <p>Every family deserves a safe home.</p>
        </div>
        <div className="l-footer-end">
          <button className="btn light" onClick={onEnter}>{t('landing.cta.access')} <ArrowRight size={16} /></button>
          <small>Mane Maarga · prototype for rural housing assistance in Karnataka · <a href="https://github.com/SrijaMalhar/mane-maarga">Source on GitHub</a></small>
        </div>
      </footer>
    </div>
  )
}

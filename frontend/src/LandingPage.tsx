import { ArrowRight, ArrowUpRight, Home, ShieldCheck, Wallet, FileCheck, Sparkles } from 'lucide-react'

type Props = {
  onGetStarted: () => void
}

export default function LandingPage({ onGetStarted }: Props) {
  return (
    <main className="landing">
      <nav className="landing-nav">
        <a className="landing-brand" href="#">
          <span className="landing-logo"><Home size={21} /></span>
          <span>sooru<span className="brand-dot">.</span></span>
        </a>

        <div className="landing-nav-links">
          <a href="#mission">Our mission</a>
          <a href="#journey">How it works</a>
          <a href="#features">Features</a>
        </div>

        <button className="landing-nav-cta" onClick={onGetStarted}>
          Workspace <ArrowUpRight size={16} />
        </button>
      </nav>

      <section className="landing-hero">
        <div className="hero-copy">
          <span className="hero-eyebrow">
            <span className="eyebrow-dot" />
            HOUSING SUPPORT, REIMAGINED
          </span>

          <h1>
            A home isn't built
            <br />
            with bricks alone.
            <br />
            <span>It's built with a plan.</span>
          </h1>

          <p>
            The journey from owning land to building a home shouldn't be
            uncertain. Sooru brings clarity to housing support, financing
            gaps, and every step in between.
          </p>

          <div className="hero-actions">
            <button className="hero-primary" onClick={onGetStarted}>
              Explore Sooru <ArrowRight size={17} />
            </button>
            <a className="hero-secondary" href="#journey">
              Discover our approach
            </a>
          </div>

          <div className="hero-trust">
            <div className="trust-icon"><ShieldCheck size={17} /></div>
            <span>Transparent calculations</span>
            <span className="trust-divider">·</span>
            <span>Human-centred support</span>
          </div>
        </div>

        <div className="hero-visual">
          <div className="hero-image">
            <img
             src="https://images.unsplash.com/photo-1503387762-592deb58ef4e?auto=format&fit=crop&w=900&q=80"
              alt="Beautiful home surrounded by greenery"
            />
          </div>

          <div className="hero-floating-card">
            <div className="floating-icon"><Wallet size={19} /></div>
            <div>
              <span>Financial clarity</span>
              <strong>Know the gap. Plan the next step.</strong>
            </div>
          </div>

          <div className="hero-image-label">
            <span>01 — THE DREAM</span>
            <span>A place to call home</span>
          </div>
        </div>
      </section>

      <section className="landing-statement" id="mission">
        <div className="statement-label">
          <span>OUR PURPOSE</span>
          <div />
        </div>

        <div className="statement-content">
          <h2>
            Between a plot of land
            <br />
            and a finished home,
            <br />
            <span>there's a gap.</span>
          </h2>

          <p>
            Government assistance can help families begin. But construction
            costs, delayed instalments, and limited savings can leave a home
            unfinished. Sooru exists to make that gap visible — and make the
            next step clearer.
          </p>
        </div>
      </section>

      <section className="landing-journey" id="journey">
        <div className="journey-heading">
          <div>
            <span className="section-eyebrow">THE SOORU APPROACH</span>
            <h2>One step closer<br />to a place called home.</h2>
          </div>
          <p>We turn a complicated housing journey into a clear, structured plan.</p>
        </div>

        <div className="journey-grid">
          <article className="journey-card">
            <div className="journey-image">
              <img
                src="https://images.unsplash.com/photo-1592595896551-12b371d546d5?auto=format&fit=crop&w=900&q=80"
                alt="A home and its surroundings"
              />
              <span className="journey-number">01</span>
            </div>
            <div className="journey-card-content">
              <span>UNDERSTAND</span>
              <h3>Start with what you have.</h3>
              <p>Bring together land, savings, sanctioned assistance, and the family's current situation.</p>
            </div>
          </article>

          <article className="journey-card">
            <div className="journey-image">
              <img
                src="https://images.unsplash.com/photo- строитель?auto=format&fit=crop&w=900&q=80"
                alt="House construction in progress"
              />
              <span className="journey-number">02</span>
            </div>
            <div className="journey-card-content">
              <span>CALCULATE</span>
              <h3>Make the gap visible.</h3>
              <p>Understand construction costs, assistance, and the funding needed at each stage.</p>
            </div>
          </article>

          <article className="journey-card">
            <div className="journey-image">
              <img
                src="https://images.unsplash.com/photo-1600047509807-ba8f99d2cdde?auto=format&fit=crop&w=900&q=80"
                alt="Completed house"
              />
              <span className="journey-number">03</span>
            </div>
            <div className="journey-card-content">
              <span>PLAN</span>
              <h3>Move forward with clarity.</h3>
              <p>Organise the journey, track progress, and make informed decisions with transparent information.</p>
            </div>
          </article>
        </div>
      </section>

      <section className="landing-features" id="features">
        <div className="features-intro">
          <span className="section-eyebrow">BUILT FOR THE REAL WORLD</span>
          <h2>More than a calculator.<br />A support system.</h2>
          <p>Purpose-built tools to help housing support teams understand, organise, and plan.</p>
        </div>

        <div className="feature-list">
          <article>
            <div className="feature-icon"><Wallet size={21} /></div>
            <div>
              <h3>Financial clarity</h3>
              <p>Understand construction costs, assistance, existing loans, and indicative funding gaps.</p>
            </div>
          </article>

          <article>
            <div className="feature-icon"><FileCheck size={21} /></div>
            <div>
              <h3>Case management</h3>
              <p>Organise beneficiary cases, track stages, manage records, and monitor progress.</p>
            </div>
          </article>

          <article>
            <div className="feature-icon"><Sparkles size={21} /></div>
            <div>
              <h3>Sooru Intelligence</h3>
              <p>Structured insights and prioritised actions to support case review and human decision-making.</p>
            </div>
          </article>
        </div>
      </section>

      <section className="landing-cta">
        <div className="cta-decoration">⌂</div>
        <span className="section-eyebrow">THE JOURNEY STARTS HERE</span>
        <h2>Let's make the path<br />to a home clearer.</h2>
        <p>Better information. Better planning. One step at a time.</p>
        <button className="hero-primary" onClick={onGetStarted}>
          Enter Sooru Workspace <ArrowRight size={17} />
        </button>
      </section>

      <footer className="landing-footer">
        <a className="landing-brand" href="#">
          <span className="landing-logo"><Home size={18} /></span>
          <span>sooru<span className="brand-dot">.</span></span>
        </a>
        <p>Housing support, made clearer.</p>
        <div>
          <a href="https://github.com/SrijaMalhar/sooru" target="_blank" rel="noreferrer">GitHub <ArrowUpRight size={14} /></a>
          <span>Prototype · Demo data only</span>
        </div>
      </footer>
    </main>
  )
}
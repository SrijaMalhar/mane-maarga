import { useState, type FormEvent } from 'react'
import { ArrowLeft, LockKeyhole, Sparkles } from 'lucide-react'
import Logo from '../components/Logo'
import DuskVillage from '../components/DuskVillage'
import { Notice } from '../components/ui'
import { API_BASE, errorText, type AuthUser } from '../lib/api'
import { LanguageSwitch, useI18n } from '../lib/i18n'

type Props = { mode: 'signin' | 'bootstrap' | 'offline'; onAuthenticated: (token: string, user: AuthUser) => void; onRetry: () => void; onBack: () => void; onDemo: () => void }

export default function AuthScreen({ mode, onAuthenticated, onRetry, onBack, onDemo }: Props) {
  const { t } = useI18n()
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const bootstrap = mode === 'bootstrap'

  async function submit(e: FormEvent) {
    e.preventDefault(); setBusy(true); setError('')
    try {
      const r = await fetch(`${API_BASE}/api/auth/${bootstrap ? 'bootstrap' : 'login'}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bootstrap ? { username, email, password } : { username, password }),
      })
      const data = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(errorText(data, 'Sign-in failed'))
      onAuthenticated(data.access_token, data.user)
    } catch (err) { setError(err instanceof Error ? err.message : 'Sign-in failed') } finally { setBusy(false) }
  }

  return (
    <div className="auth">
      <aside className="auth-art" aria-hidden>
        <div className="auth-art-inner">
          <p className="kn-display" lang="kn">ಮನೆಗೆ ದಾರಿ,<br />ಬದುಕಿಗೆ ಭರವಸೆ</p>
          <p className="auth-art-sub">{t('brand.tagline.en')}</p>
          <figure className="auth-scene">
            <DuskVillage />
            <figcaption><span lang="kn">ಪ್ರತಿ ಬೆಳಗಿದ ಕಿಟಕಿ, ಒಂದು ಕುಟುಂಬದ ಮನೆ.</span> Every lit window is a family home. Every lamp is a step on the way.</figcaption>
          </figure>
        </div>
      </aside>
      <section className="auth-panel">
        <div className="auth-top"><button className="link-btn" onClick={onBack}><ArrowLeft size={16} /> Mane Maarga</button><LanguageSwitch /></div>
        <div className="auth-form-wrap">
          <Logo size={52} />
          {mode === 'offline' ? (
            <>
              <h1>Explore Mane Maarga</h1>
              <p className="lead">This preview isn't connected to a live server. Open the workspace with sample families instead. Everything stays in this browser tab, and every name is invented.</p>
              <button className="btn primary wide" onClick={onDemo}><Sparkles size={16} />Explore with sample data</button>
              <details className="auth-details">
                <summary>Running your own server?</summary>
                <p>The API at <code>{API_BASE}</code> isn't responding. Start it with <code>docker compose up --build</code>, then <button className="link-btn" onClick={onRetry}>try again</button>.</p>
              </details>
            </>
          ) : (
            <>
              <h1>{bootstrap ? t('auth.setup') : t('auth.welcome')}</h1>
              <p className="lead">{bootstrap ? 'Create the first administrator. Administrators add case workers and reviewers.' : 'Sign in to the case workspace.'}</p>
              <form onSubmit={submit} className="form">
                <label className="field"><span>{t('auth.username')}</span><input autoComplete="username" required minLength={3} value={username} onChange={e => setUsername(e.target.value)} /></label>
                {bootstrap && <label className="field"><span>{t('auth.email')}</span><input type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} /></label>}
                <label className="field"><span>{t('auth.password')}</span><input type="password" autoComplete={bootstrap ? 'new-password' : 'current-password'} required minLength={bootstrap ? 12 : 1} value={password} onChange={e => setPassword(e.target.value)} />{bootstrap && <small>At least 12 characters.</small>}</label>
                {error && <Notice tone="error">{error}</Notice>}
                <button className="btn primary wide" disabled={busy}>{busy ? '…' : bootstrap ? t('auth.create') : t('auth.signin')}</button>
              </form>
              <button className="btn ghost wide" type="button" onClick={onDemo}><Sparkles size={16} />Explore with sample data instead</button>
              <p className="auth-note"><LockKeyhole size={14} /> Sessions expire after 60 minutes. Use synthetic records until a production security review is complete.</p>
            </>
          )}
        </div>
      </section>
    </div>
  )
}

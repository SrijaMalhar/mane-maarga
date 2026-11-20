import { useState, type FormEvent } from 'react'
import { ArrowLeft, LockKeyhole } from 'lucide-react'
import Mascot from '../components/Mascot'
import House from '../components/House'
import { Notice } from '../components/ui'
import { API_BASE, errorText, type AuthUser } from '../lib/api'
import { LanguageSwitch, useI18n } from '../lib/i18n'

type Props = { mode: 'signin' | 'bootstrap' | 'offline'; onAuthenticated: (token: string, user: AuthUser) => void; onRetry: () => void; onBack: () => void }

export default function AuthScreen({ mode, onAuthenticated, onRetry, onBack }: Props) {
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
          <div className="auth-houses">{[1, 2, 3, 4, 5].map(l => <House key={l} level={l} size={92} />)}</div>
        </div>
      </aside>
      <section className="auth-panel">
        <div className="auth-top"><button className="link-btn" onClick={onBack}><ArrowLeft size={16} /> Mane Maarga</button><LanguageSwitch /></div>
        <div className="auth-form-wrap">
          <Mascot size={72} mood={mode === 'offline' ? 'calm' : 'guide'} />
          {mode === 'offline' ? (
            <>
              <h1>The workspace can't be reached</h1>
              <p className="lead">The API at <code>{API_BASE}</code> isn't responding. Start the stack with <code>docker compose up --build</code>, then try again.</p>
              <button className="btn primary" onClick={onRetry}>{t('common.retry')}</button>
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
              <p className="auth-note"><LockKeyhole size={14} /> Sessions expire after 60 minutes. Use synthetic records until a production security review is complete.</p>
            </>
          )}
        </div>
      </section>
    </div>
  )
}

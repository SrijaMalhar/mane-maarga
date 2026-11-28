import { useCallback, useEffect, useMemo, useState } from 'react'
import { API_BASE, makeClient, type AuthUser, type CaseItem } from './lib/api'
import { DEMO_USER, makeDemoClient, resetDemo } from './lib/demo'
import { setTourStep } from './lib/tour'
import Kit from './pages/Kit'
import { AppContext, href, parseRoute, type Route } from './lib/app-context'
import { I18nProvider } from './lib/i18n'
import { Loading, useToast } from './components/ui'
import Shell from './components/Shell'
import CaseForm from './components/CaseForm'
import Landing from './pages/Landing'
import FamilyApproval from './pages/FamilyApproval'
import FamilyProgress from './pages/FamilyProgress'
import AuthScreen from './pages/AuthScreen'
import Overview from './pages/Overview'
import Beneficiaries from './pages/Beneficiaries'
import CaseFile from './pages/CaseFile'
import Verification from './pages/Verification'
import Finance from './pages/Finance'
import Construction from './pages/Construction'
import Intelligence from './pages/Intelligence'
import FlightRecorder from './pages/FlightRecorder'
import Tour from './pages/Tour'
import TourBar from './components/TourBar'
import Audit from './pages/Audit'
import Team from './pages/Team'

const TOKEN_KEY = 'mm_token'
const DEMO_KEY = 'mm_demo'
const readDemo = () => { try { return sessionStorage.getItem(DEMO_KEY) === '1' } catch { return false } }

function useHashRoute(): [Route, string] {
  const [hash, setHash] = useState(() => window.location.hash)
  useEffect(() => {
    const on = () => setHash(window.location.hash)
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  return [useMemo(() => parseRoute(hash), [hash]), hash]
}

function Workspace() {
  const [token, setToken] = useState(() => { try { return sessionStorage.getItem(TOKEN_KEY) || '' } catch { return '' } })
  const [demo, setDemo] = useState(readDemo)
  const [user, setUser] = useState<AuthUser | null>(null)
  const [authState, setAuthState] = useState<'checking' | 'signed-out' | 'bootstrap' | 'ready' | 'offline'>('checking')
  const [entered, setEntered] = useState(() => Boolean(token) || window.location.hash.length > 2)
  const [cases, setCases] = useState<CaseItem[]>([])
  const [casesLoading, setCasesLoading] = useState(true)
  const [casesError, setCasesError] = useState('')
  const [caseForm, setCaseForm] = useState<{ open: boolean; existing?: CaseItem }>({ open: false })
  const [route, rawHash] = useHashRoute()
  const toast = useToast()

  const signOut = useCallback(() => {
    try { sessionStorage.removeItem(TOKEN_KEY); sessionStorage.removeItem(DEMO_KEY) } catch { /* ignore */ }
    setToken(''); setUser(null); setDemo(false); setAuthState('checking')
  }, [])
  const api = useMemo(() => (demo ? makeDemoClient() : makeClient(token, signOut)), [demo, token, signOut])
  const startDemo = useCallback(() => {
    try { sessionStorage.setItem(DEMO_KEY, '1') } catch { /* ignore */ }
    setDemo(true); setEntered(true)
    if (!window.location.hash || window.location.hash.length < 3) window.location.hash = '#/overview'
  }, [])

  // Resolve who is signed in, or whether the first administrator must be created.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      if (demo) { setUser(DEMO_USER); setAuthState('ready'); return }
      try {
        if (token) {
          const r = await fetch(`${API_BASE}/api/auth/me`, { headers: { Authorization: `Bearer ${token}` } })
          if (r.ok) { const u = await r.json(); if (!cancelled) { setUser(u); setAuthState('ready') } return }
        }
        const s = await fetch(`${API_BASE}/api/auth/status`).then(r => r.json())
        if (!cancelled) { setUser(null); setAuthState(s.bootstrap_required ? 'bootstrap' : 'signed-out') }
      } catch { if (!cancelled) setAuthState('offline') }
    })()
    return () => { cancelled = true }
  }, [token, demo])

  const reloadCases = useCallback(async () => {
    setCasesLoading(true)
    try { setCases(await api.get<CaseItem[]>('/api/cases')); setCasesError('') }
    catch (e) { setCasesError(e instanceof Error ? e.message : 'Could not load beneficiaries') }
    finally { setCasesLoading(false) }
  }, [api])
  useEffect(() => { if (authState === 'ready') void reloadCases() }, [authState, reloadCases])

  const go = useCallback((r: Route) => { window.location.hash = href(r) }, [])

  if (!entered) return <Landing onEnter={() => { setEntered(true); if (!rawHash || rawHash === '#') window.location.hash = '#/overview' }} onTour={() => { setTourStep(0); startDemo(); window.location.hash = '#/tour' }} />
  if (authState === 'checking') return <div className="center-screen"><Loading /></div>
  if (authState !== 'ready' || !user) {
    return <AuthScreen mode={authState === 'bootstrap' ? 'bootstrap' : authState === 'offline' ? 'offline' : 'signin'}
      onRetry={() => setAuthState('checking')}
      onDemo={startDemo}
      onBack={() => setEntered(false)}
      onAuthenticated={(tok, u) => { try { sessionStorage.setItem(TOKEN_KEY, tok) } catch { /* ignore */ } setToken(tok); setUser(u); setAuthState('ready') }} />
  }

  const ctx = {
    api, user, demo, cases, casesLoading, casesError, reloadCases, go, toast: toast.show,
    canEdit: user.role !== 'viewer', isAdmin: user.role === 'admin',
    openCaseForm: (existing?: CaseItem) => setCaseForm({ open: true, existing }),
  }

  let page
  switch (route.name) {
    case 'beneficiaries': page = <Beneficiaries />; break
    case 'case': page = <CaseFile id={route.id} />; break
    case 'verification': page = <Verification initialCase={route.caseId} />; break
    case 'finance': page = <Finance initialCase={route.caseId} />; break
    case 'construction': page = <Construction initialCase={route.caseId} />; break
    case 'intelligence': page = <Intelligence initialCase={route.caseId} />; break
    case 'tour': page = <Tour />; break
    case 'recorder': page = <FlightRecorder runId={route.runId} initialCase={route.caseId} />; break
    case 'audit': page = <Audit />; break
    case 'team': page = <Team />; break
    default: page = <Overview />
  }

  return (
    <AppContext.Provider value={ctx}>
      <Shell route={route} onSignOut={signOut} demo={demo} onResetDemo={() => { resetDemo(); void reloadCases(); go({ name: 'overview' }) }}>{page}<TourBar routeKey={route.name} /></Shell>
      {caseForm.open && <CaseForm existing={caseForm.existing} onClose={() => setCaseForm({ open: false })} />}
      {toast.node}
    </AppContext.Provider>
  )
}

function PublicApproval({ token }: { token: string }) {
  // Opened from an SMS on the family's phone: no login, just the link and the one-time code.
  const client = useMemo(() => (readDemo() ? makeDemoClient() : makeClient('', () => {})), [])
  return <FamilyApproval token={token} client={client} />
}

function PublicProgress({ token }: { token: string }) {
  // Opened from an SMS, a QR code or a shared link: no login, read-only, verified progress only.
  const client = useMemo(() => (readDemo() ? makeDemoClient() : makeClient('', () => {})), [])
  return <FamilyProgress token={token} client={client} />
}

export default function App() {
  // Follow the hash, so a family link pasted into an open tab opens the family's page rather than the workspace.
  const [hash, setHash] = useState(() => window.location.hash)
  useEffect(() => { const on = () => setHash(window.location.hash); window.addEventListener('hashchange', on); return () => window.removeEventListener('hashchange', on) }, [])
  const approve = hash.match(/^#\/approve\/([\w-]+)/)
  if (approve) return <PublicApproval key={approve[1]} token={approve[1]} />
  const progress = hash.match(/^#\/progress\/([\w-]+)/)
  if (progress) return <PublicProgress key={progress[1]} token={progress[1]} />
  if (import.meta.env.DEV && hash === '#/kit') return <Kit />
  return <I18nProvider><Workspace /></I18nProvider>
}

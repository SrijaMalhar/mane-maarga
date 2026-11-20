import { createContext, useContext } from 'react'
import type { AuthUser, CaseItem, Client } from './api'

export type Route =
  | { name: 'overview' } | { name: 'beneficiaries' } | { name: 'case'; id: number }
  | { name: 'verification'; caseId?: number } | { name: 'finance'; caseId?: number } | { name: 'construction'; caseId?: number }
  | { name: 'intelligence'; caseId?: number } | { name: 'audit' } | { name: 'team' }

export function parseRoute(hash: string): Route {
  const [path, query = ''] = hash.replace(/^#\/?/, '').split('?')
  const caseId = Number(new URLSearchParams(query).get('case')) || undefined
  const [head, id] = path.split('/')
  switch (head) {
    case 'beneficiaries': return { name: 'beneficiaries' }
    case 'case': return Number(id) ? { name: 'case', id: Number(id) } : { name: 'beneficiaries' }
    case 'verification': return { name: 'verification', caseId }
    case 'finance': return { name: 'finance', caseId }
    case 'construction': return { name: 'construction', caseId }
    case 'intelligence': return { name: 'intelligence', caseId }
    case 'audit': return { name: 'audit' }
    case 'team': return { name: 'team' }
    default: return { name: 'overview' }
  }
}

export function href(route: Route): string {
  if (route.name === 'case') return `#/case/${route.id}`
  const caseId = 'caseId' in route && route.caseId ? `?case=${route.caseId}` : ''
  return `#/${route.name}${caseId}`
}

export type AppCtx = {
  api: Client
  user: AuthUser
  canEdit: boolean
  isAdmin: boolean
  cases: CaseItem[]
  casesLoading: boolean
  casesError: string
  reloadCases: () => Promise<void>
  go: (route: Route) => void
  toast: (text: string, tone?: 'success' | 'error') => void
  openCaseForm: (existing?: CaseItem) => void
}

export const AppContext = createContext<AppCtx | null>(null)
export function useApp() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp outside AppContext')
  return ctx
}

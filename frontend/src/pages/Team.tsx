import { useEffect, useState, type FormEvent } from 'react'
import { UserPlus } from 'lucide-react'
import { Notice, PageHead, Skeleton, Tag } from '../components/ui'
import { type ManagedUser } from '../lib/api'
import { useApp } from '../lib/app-context'
import { useI18n } from '../lib/i18n'
import { dateShort } from '../lib/format'

const roleText = { admin: 'Manages people, reads the audit trail, can change everything', operator: 'Creates and updates cases, uploads and verifies documents', viewer: 'Read-only access to cases' }

export default function Team() {
  const { api, isAdmin, toast } = useApp()
  const { t, lang } = useI18n()
  const [users, setUsers] = useState<ManagedUser[] | null>(null)
  const [form, setForm] = useState({ username: '', email: '', password: '', role: 'operator' as 'operator' | 'viewer' })
  const [err, setErr] = useState('')
  const load = () => api.get<ManagedUser[]>('/api/auth/users').then(setUsers).catch(e => setErr(e.message))
  useEffect(() => { if (isAdmin) void load() }, [isAdmin]) // eslint-disable-line react-hooks/exhaustive-deps

  async function add(e: FormEvent) {
    e.preventDefault(); setErr('')
    try { await api.post('/api/auth/users', form); setForm({ username: '', email: '', password: '', role: 'operator' }); await load(); toast('Account created') } catch (e2) { setErr(e2 instanceof Error ? e2.message : 'Could not create') }
  }
  if (!isAdmin) return <div><PageHead title={t('team.title')} /><Notice tone="warn">Only administrators can manage access.</Notice></div>
  return (
    <div className="team">
      <PageHead title={t('team.title')} lead={t('team.lead')} />
      <div className="team-grid">
        <section className="panel">
          <div className="panel-head"><h2>People</h2><span className="count-chip">{users?.length ?? 0}</span></div>
          {!users ? <Skeleton lines={4} /> : (
            <ul className="src-list">{users.map(u => (
              <li key={u.id}><span><b>{u.username}</b><small>{u.email} · since {dateShort(u.created_at, lang)}</small></span><Tag tone={u.role === 'admin' ? 'confirmed' : 'neutral'}>{u.role}</Tag></li>
            ))}</ul>
          )}
        </section>
        <section className="panel">
          <div className="panel-head"><h2>Add a person</h2></div>
          <form className="form" onSubmit={add}>
            <div className="grid-2">
              <label className="field"><span>{t('auth.username')}</span><input required minLength={3} value={form.username} onChange={e => setForm({ ...form, username: e.target.value })} /></label>
              <label className="field"><span>{t('auth.email')}</span><input required type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} /></label>
              <label className="field"><span>Temporary password</span><input required minLength={12} type="password" autoComplete="new-password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} /><small>At least 12 characters. Share it privately.</small></label>
              <label className="field"><span>Role</span><select value={form.role} onChange={e => setForm({ ...form, role: e.target.value as 'operator' })}><option value="operator">Operator</option><option value="viewer">Viewer</option></select><small>{roleText[form.role]}</small></label>
            </div>
            {err && <Notice tone="error">{err}</Notice>}
            <div className="form-actions"><button className="btn primary"><UserPlus size={16} />Create account</button></div>
          </form>
        </section>
      </div>
    </div>
  )
}

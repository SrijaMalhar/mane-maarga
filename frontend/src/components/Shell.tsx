import { useState, type ReactNode } from 'react'
import { LogOut, MoreHorizontal, RotateCcw, X } from 'lucide-react'
import Mascot from './Mascot'
import { IconBuild, IconFinance, IconInsight, IconLedger, IconOverview, IconPeople, IconRecorder, IconTeam, IconVerify } from './NavIcons'
import { href, useApp, type Route } from '../lib/app-context'
import { LanguageSwitch, useI18n } from '../lib/i18n'

type Item = { key: Route['name']; label: string; Icon: (p: { size?: number }) => JSX.Element; adminOnly?: boolean }

export default function Shell({ route, onSignOut, children, demo = false, onResetDemo }: { route: Route; onSignOut: () => void; children: ReactNode; demo?: boolean; onResetDemo?: () => void }) {
  const { t } = useI18n()
  const { user, isAdmin } = useApp()
  const [moreOpen, setMoreOpen] = useState(false)
  const items: Item[] = [
    { key: 'overview', label: t('nav.overview'), Icon: IconOverview },
    { key: 'beneficiaries', label: t('nav.beneficiaries'), Icon: IconPeople },
    { key: 'verification', label: t('nav.verification'), Icon: IconVerify },
    { key: 'finance', label: t('nav.finance'), Icon: IconFinance },
    { key: 'construction', label: t('nav.construction'), Icon: IconBuild },
    { key: 'intelligence', label: t('nav.intelligence'), Icon: IconInsight },
    { key: 'recorder', label: t('nav.recorder'), Icon: IconRecorder },
    { key: 'audit', label: t('nav.audit'), Icon: IconLedger, adminOnly: true },
    { key: 'team', label: t('nav.team'), Icon: IconTeam, adminOnly: true },
  ].filter(i => !i.adminOnly || isAdmin) as Item[]
  const active = route.name === 'case' ? 'beneficiaries' : route.name
  const mobilePrimary = items.slice(0, 4)
  const mobileMore = items.slice(4)

  const link = (i: Item, cls: string) => (
    <a key={i.key} href={href({ name: i.key } as Route)} className={`${cls} ${active === i.key ? 'active' : ''}`} aria-current={active === i.key ? 'page' : undefined} onClick={() => setMoreOpen(false)}>
      <i.Icon /><span>{i.label}</span>
    </a>
  )

  return (
    <div className="shell">
      <a className="skip-link" href="#main">{t('nav.skip')}</a>
      <nav className="rail" aria-label="Primary">
        <a className="rail-brand" href="#/overview" aria-label={t('brand.name')}>
          <Mascot size={44} />
        </a>
        <div className="rail-items">{items.map(i => link(i, 'rail-item'))}</div>
        <button className="rail-item rail-out" onClick={onSignOut}><LogOut size={20} aria-hidden /><span>{demo ? 'Leave demo' : t('nav.signout')}</span></button>
      </nav>

      <div className="shell-main">
        <header className="topbar">
          <div className="topbar-brand">
            <span className="wordmark">Mane Maarga</span>
            <span className="wordmark-kn" lang="kn">ಮನೆ ಮಾರ್ಗ</span>
          </div>
          <div className="topbar-right">
            <LanguageSwitch />
            <div className="who" title={user.email}>
              <span className="who-avatar" aria-hidden>{user.username.slice(0, 1).toUpperCase()}</span>
              <span className="who-text"><b>{user.username}</b><small>{demo ? 'demo · ' : ''}{user.role}</small></span>
            </div>
          </div>
        </header>
        {demo && (
          <div className="demo-bar" role="status">
            <span>{t('banner.demo')}</span>
            <span className="demo-actions"><button className="link-btn" onClick={onResetDemo}><RotateCcw size={14} />{t('banner.reset')}</button><button className="link-btn" onClick={onSignOut}>{t('banner.leave')}</button></span>
          </div>
        )}
        <main id="main" className="page" tabIndex={-1}>{children}</main>
      </div>

      <nav className="tabbar" aria-label="Primary">
        {mobilePrimary.map(i => link(i, 'tab'))}
        <button className={`tab ${mobileMore.some(i => i.key === active) ? 'active' : ''}`} onClick={() => setMoreOpen(true)} aria-expanded={moreOpen}>
          <MoreHorizontal size={22} aria-hidden /><span>{t('nav.more')}</span>
        </button>
      </nav>
      {moreOpen && (
        <div className="sheet-backdrop" onClick={() => setMoreOpen(false)}>
          <div className="sheet" role="dialog" aria-modal="true" aria-label={t('nav.more')} onClick={e => e.stopPropagation()}>
            <div className="sheet-head"><b>{t('nav.more')}</b><button className="icon-btn" onClick={() => setMoreOpen(false)} aria-label={t('common.close')}><X size={18} /></button></div>
            {mobileMore.map(i => link(i, 'sheet-item'))}
            <button className="sheet-item" onClick={onSignOut}><LogOut size={20} aria-hidden /><span>{t('nav.signout')}</span></button>
          </div>
        </div>
      )}
    </div>
  )
}

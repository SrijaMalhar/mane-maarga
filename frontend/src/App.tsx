import { useEffect, useMemo, useState } from 'react'
import AuthScreen from './AuthScreen'
import LandingPage from './LandingPage'
import IntelligencePanel from './IntelligencePanel'
import { Activity, ArrowUpRight, Bell, Building2, CheckCircle2, CircleDollarSign, ClipboardList, Home, LayoutDashboard, Plus, Search, Settings, Users, Wallet, X, Save, Pencil, Trash2, ChevronRight } from 'lucide-react'

type Status = 'intake'|'verified'|'planning'|'finance_review'|'construction'|'completed'
type CaseItem = { id:number; beneficiary_name:string; village:string; taluk:string; phone_last4:string; status:Status; sanctioned_amount:number; estimated_cost:number; existing_loan:number; gap_amount:number; consent_status:string; notes:string }
const API = 'http://localhost:8000'
const fmt = (n:number) => new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:0}).format(n)
const statuses:Status[]=['intake','verified','planning','finance_review','construction','completed']
const label=(s:string)=>s.replace(/_/g,' ')
const emptyForm={beneficiary_name:'',village:'',taluk:'',phone_last4:'',status:'intake' as Status,sanctioned_amount:'0',estimated_cost:'0',existing_loan:'0',notes:''}
const statusColors:Record<Status,string>={intake:'#9aa9a2',verified:'#80a98f',planning:'#a4b96b',finance_review:'#e0ad65',construction:'#79a9c5',completed:'#5e9b75'}
const navItems=[{name:'Overview',icon:LayoutDashboard},{name:'Beneficiaries',icon:Users},{name:'Case management',icon:ClipboardList},{name:'Finance planning',icon:Wallet}]

export default function App(){
 const [cases,setCases]=useState<CaseItem[]>([])
 const [error,setError]=useState('')
 const [query,setQuery]=useState('')
 const [showDashboard,setShowDashboard]=useState(false)
 const [modal,setModal]=useState(false)
 const [editing,setEditing]=useState<CaseItem|null>(null)
 const [form,setForm]=useState(emptyForm)
 const [saving,setSaving]=useState(false)
 const [consentGiven,setConsentGiven]=useState(false)
 const [notice,setNotice]=useState('')
 const [activeNav,setActiveNav]=useState('Overview')
 const [showAuth,setShowAuth]=useState(false)
 async function loadCases(){try{const r=await fetch(`${API}/api/cases`);if(!r.ok)throw new Error();setCases(await r.json());setError('')}catch{setError('API unavailable. Start the Docker stack and refresh.')}}
 useEffect(()=>{loadCases()},[])
 const filtered=useMemo(()=>cases.filter(c=>`${c.beneficiary_name} ${c.village} ${c.taluk} ${c.status}`.toLowerCase().includes(query.toLowerCase())),[cases,query])
 const totalGap=cases.reduce((sum,c)=>sum+Number(c.gap_amount||0),0)
 const active=cases.filter(c=>c.status!=='completed').length
 const completed=cases.filter(c=>c.status==='completed').length
 const completion=cases.length?Math.round(completed/cases.length*100):0
 const statusCounts=statuses.map(status=>({status,count:cases.filter(c=>c.status===status).length}))
 function openNew(){setEditing(null);setForm(emptyForm);setConsentGiven(false);setModal(true)}
 function openEdit(c:CaseItem){setEditing(c);setForm({...c,sanctioned_amount:String(c.sanctioned_amount),estimated_cost:String(c.estimated_cost),existing_loan:String(c.existing_loan)});setConsentGiven(false);setModal(true)}
 async function save(e:React.FormEvent){e.preventDefault();setSaving(true);setNotice('');try{
  const body={...form,sanctioned_amount:Number(form.sanctioned_amount),estimated_cost:Number(form.estimated_cost),existing_loan:Number(form.existing_loan)}
  const r=await fetch(`${API}/api/cases${editing?`/${editing.id}`:''}`,{method:editing?'PATCH':'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})
  if(!r.ok){const detail=await r.json().catch(()=>null);throw new Error(detail?.detail?.[0]?.msg||'Could not save case')}
  const saved=await r.json()
  if(!editing){
   const consentResponse=await fetch(`${API}/api/cases/${saved.id}/consent`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({consent_given:true,consent_scope:'case_processing',consent_text_version:'v1'})})
   if(!consentResponse.ok)throw new Error('Case was created, but consent could not be recorded. Check the case and retry consent from API docs.')
  }
  await loadCases();setModal(false);setNotice(editing?'Case updated successfully.':'Beneficiary case created and demo consent recorded.')
 }catch(err){setError(err instanceof Error?err.message:'Save failed')}finally{setSaving(false)}}
 async function removeCase(c:CaseItem){if(!window.confirm(`Delete case for ${c.beneficiary_name}? This cannot be undone.`))return;try{const r=await fetch(`${API}/api/cases/${c.id}`,{method:'DELETE'});if(!r.ok)throw new Error();await loadCases();setNotice('Case deleted.')}catch{setError('Unable to delete case.')}}
 if (!showDashboard) {
  return <LandingPage onGetStarted={() => setShowDashboard(true)} />
}

return <div className="app-shell">
  <aside className="sidebar">
   <div className="brand"><div className="brand-mark"><Home size={19}/></div><div><strong>sooru</strong><span>Housing support</span></div></div>
   <div className="workspace-switch"><div className="workspace-avatar">K</div><div><b>Karnataka Pilot</b><small>Demo workspace</small></div><ChevronRight size={15}/></div>
   <p className="nav-heading">WORKSPACE</p><nav>
    {navItems.map(({name,icon:Icon})=><button key={name} className={`nav-item ${activeNav===name?'active':''}`} onClick={()=>{setActiveNav(name);if(name==='Beneficiaries'||name==='Case management')document.getElementById('cases-panel')?.scrollIntoView({behavior:'smooth'})}}><Icon size={17}/><span>{name}</span></button>)}
   </nav>
   <div className="sidebar-bottom"><button className="nav-item"><Settings size={17}/>Settings</button><div className="profile"><div className="profile-avatar">S</div><div><b>Workspace operator</b><small>Demo account</small></div></div></div>
  </aside>
  <main className="main-content">
   <header className="topbar"><div className="breadcrumb"><span>Workspace</span><ChevronRight size={14}/><b>{activeNav}</b></div><div className="top-actions"><span className="environment"><span/>Demo environment</span><button className="icon-button" aria-label="Notifications"><Bell size={18}/><i/></button></div></header>
   <div className="page-content">
    <div className="page-heading"><div><p className="eyebrow">THURSDAY, 19 NOVEMBER 2026</p><h1>Good evening 👋</h1><p className="heading-sub">Here's what's happening across your housing support workspace.</p></div><button className="primary-button" onClick={openNew}><Plus size={17}/> Add beneficiary</button></div>
    {error&&<div className="alert error"><Activity size={16}/>{error}</div>}{notice&&<div className="alert success"><CheckCircle2 size={16}/>{notice}</div>}
    <section className="metrics-grid">
     <article className="metric-card"><div className="metric-top"><span>Total beneficiaries</span><div className="metric-icon green"><Users size={18}/></div></div><strong>{cases.length.toLocaleString('en-IN')}</strong><div className="metric-foot"><span className="metric-note">All registered cases</span><ArrowUpRight size={14}/></div></article>
     <article className="metric-card"><div className="metric-top"><span>Active cases</span><div className="metric-icon blue"><ClipboardList size={18}/></div></div><strong>{active.toLocaleString('en-IN')}</strong><div className="metric-foot"><span className="metric-note">Across all stages</span><span className="dot-label"><i/> In progress</span></div></article>
     <article className="metric-card"><div className="metric-top"><span>Estimated financing gap</span><div className="metric-icon amber"><CircleDollarSign size={18}/></div></div><strong className="metric-value">{fmt(totalGap)}</strong><div className="metric-foot"><span className="metric-note">Prototype calculation</span></div></article>
     <article className="metric-card"><div className="metric-top"><span>Completion rate</span><div className="metric-icon purple"><CheckCircle2 size={18}/></div></div><strong>{completion}%</strong><div className="metric-foot"><span className="metric-note">{completed} of {cases.length} cases completed</span><div className="mini-progress"><span style={{width:`${completion}%`}}/></div></div></article>
    </section>
    <section className="overview-grid">
     <article className="card pipeline-card"><div className="card-title-row"><div><h2>Case pipeline</h2><p>Distribution across the support journey</p></div><span className="soft-tag">{cases.length} total</span></div><div className="pipeline-list">{statusCounts.map(({status,count})=><div className="pipeline-row" key={status}><div className="pipeline-label"><span className="status-dot" style={{background:statusColors[status]}}/><span>{label(status)}</span><b>{count}</b></div><div className="pipeline-track"><span style={{width:`${cases.length?count/cases.length*100:0}%`,background:statusColors[status]}}/></div></div>)}</div></article>
     <article className="card completion-card"><div className="card-title-row"><div><h2>Case completion</h2><p>Progress overview</p></div><span className="soft-tag">This workspace</span></div><div className="completion-visual"><div className="donut" style={{background:`conic-gradient(#5e9b75 ${completion*3.6}deg, #edf1ee 0deg)`}}><div className="donut-inner"><strong>{completion}%</strong><span>completed</span></div></div></div><div className="completion-legend"><div><span className="legend-dot done"/>Completed <b>{completed}</b></div><div><span className="legend-dot remaining"/>Remaining <b>{active}</b></div></div></article>
    </section>
    <section className="card cases-card" id="cases-panel"><div className="card-title-row cases-title"><div><h2>Beneficiary cases</h2><p>Review records and track case progress</p></div><button className="primary-button" onClick={openNew}><Plus size={17}/> New case</button></div><div className="table-toolbar"><div className="search-box"><Search size={16}/><input placeholder="Search beneficiaries, villages, status..." value={query} onChange={e=>setQuery(e.target.value)}/></div><span className="records-count">Showing {filtered.length} of {cases.length}</span></div><div className="table-scroll"><table><thead><tr><th>BENEFICIARY</th><th>LOCATION</th><th>CASE STATUS</th><th>EST. CONSTRUCTION</th><th>FINANCING GAP</th><th>CONSENT</th><th/></tr></thead><tbody>{filtered.length?filtered.map(c=><tr key={c.id}><td><div className="person-cell"><div className="person-avatar">{c.beneficiary_name.trim().charAt(0).toUpperCase()}</div><div><b>{c.beneficiary_name}</b><small>Case #{c.id}{c.phone_last4?` · •••• ${c.phone_last4}`:''}</small></div></div></td><td><b className="location-main">{c.village}</b><small className="location-sub">{c.taluk}</small></td><td><span className={`status-pill ${c.status}`}><i/> {label(c.status)}</span></td><td>{fmt(Number(c.estimated_cost))}</td><td><b className="gap-value">{fmt(Number(c.gap_amount))}</b></td><td><span className={`consent-pill ${c.consent_status||'pending'}`}>{c.consent_status||'pending'}</span></td><td><div className="row-actions"><button title="Edit case" onClick={()=>openEdit(c)}><Pencil size={15}/></button><button title="Delete case" onClick={()=>removeCase(c)}><Trash2 size={15}/></button></div></td></tr>):<tr><td colSpan={7} className="empty-state"><Building2 size={24}/><b>{query?'No matching beneficiaries':'No beneficiaries yet'}</b><span>{query?'Try a different search term.':'Create your first case to get started.'}</span></td></tr>}</tbody></table></div></section>
    <div className="prototype-footer"><div><span className="footer-icon"><Activity size={16}/></span><div><b>Prototype workspace</b><p>Demo data only. Financing gap is an indicative estimate, not a loan eligibility decision.</p></div></div><a href="http://localhost:8000/docs" target="_blank" rel="noreferrer">API documentation <ArrowUpRight size={14}/></a></div>
   </div>
  </main>
  {modal&&<div className="modal-backdrop" onClick={e=>{if(e.target===e.currentTarget)setModal(false)}}><section className="modal"><div className="modal-head"><div><span className="eyebrow">{editing?'UPDATE RECORD':'NEW RECORD'}</span><h2>{editing?'Edit beneficiary case':'Add beneficiary'}</h2><p>Enter the details to {editing?'update this':'create a'} case record.</p></div><button className="icon-button" onClick={()=>setModal(false)}><X size={18}/></button></div><form onSubmit={save}><div className="form-grid"><label>Beneficiary name *<input required minLength={2} value={form.beneficiary_name} onChange={e=>setForm({...form,beneficiary_name:e.target.value})}/></label><label>Village *<input required value={form.village} onChange={e=>setForm({...form,village:e.target.value})}/></label><label>Taluk *<input required value={form.taluk} onChange={e=>setForm({...form,taluk:e.target.value})}/></label><label>Phone last 4 digits<input inputMode="numeric" pattern="[0-9]{4}" maxLength={4} placeholder="Optional" value={form.phone_last4} onChange={e=>setForm({...form,phone_last4:e.target.value})}/></label><label>Case status<select value={form.status} onChange={e=>setForm({...form,status:e.target.value as Status})}>{statuses.map(s=><option key={s} value={s}>{label(s)}</option>)}</select></label><label>Estimated construction cost (₹)<input type="number" min="0" step="1000" value={form.estimated_cost} onChange={e=>setForm({...form,estimated_cost:e.target.value})}/></label><label>Sanctioned assistance (₹)<input type="number" min="0" step="1000" value={form.sanctioned_amount} onChange={e=>setForm({...form,sanctioned_amount:e.target.value})}/></label><label>Existing loan (₹)<input type="number" min="0" step="1000" value={form.existing_loan} onChange={e=>setForm({...form,existing_loan:e.target.value})}/></label><label className="full">Notes<textarea rows={3} value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})}/></label>{!editing&&<label className="full consent-check"><input type="checkbox" checked={consentGiven} onChange={e=>setConsentGiven(e.target.checked)} required/><span><b>Demo consent recorded</b><small>I confirm this demo record is synthetic and consent is being recorded for case-processing demonstration. This is not a legally reviewed consent notice.</small></span></label>}</div><div className="modal-actions"><button type="button" className="secondary-button" onClick={()=>setModal(false)}>Cancel</button><button className="primary-button" disabled={saving||(!editing&&!consentGiven)}><Save size={16}/>{saving?'Saving…':editing?'Save changes':'Create case'}</button></div></form></section></div>}
 </div>
}

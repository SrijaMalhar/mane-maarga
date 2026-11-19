import { useEffect, useMemo, useState } from 'react'
import { Home, Users, ClipboardList, Wallet, Plus, Search, Bell, X, Save, Pencil, Trash2 } from 'lucide-react'

type Status = 'intake'|'verified'|'planning'|'finance_review'|'construction'|'completed'
type CaseItem = { id:number; beneficiary_name:string; village:string; taluk:string; phone_last4:string; status:Status; sanctioned_amount:number; estimated_cost:number; existing_loan:number; gap_amount:number; notes:string }
const API = 'http://localhost:8000'
const fmt = (n:number) => new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:0}).format(n)
const statuses:Status[]=['intake','verified','planning','finance_review','construction','completed']
const label=(s:string)=>s.replaceAll('_',' ')
const emptyForm={beneficiary_name:'',village:'',taluk:'',phone_last4:'',status:'intake' as Status,sanctioned_amount:'0',estimated_cost:'0',existing_loan:'0',notes:''}

export default function App(){
 const [cases,setCases]=useState<CaseItem[]>([])
 const [error,setError]=useState('')
 const [query,setQuery]=useState('')
 const [modal,setModal]=useState(false)
 const [editing,setEditing]=useState<CaseItem|null>(null)
 const [form,setForm]=useState(emptyForm)
 const [saving,setSaving]=useState(false)
 const [notice,setNotice]=useState('')
 async function loadCases(){try{const r=await fetch(`${API}/api/cases`);if(!r.ok)throw new Error();setCases(await r.json());setError('')}catch{setError('API unavailable. Start the Docker stack and refresh.')}}
 useEffect(()=>{loadCases()},[])
 const filtered=useMemo(()=>cases.filter(c=>`${c.beneficiary_name} ${c.village} ${c.taluk} ${c.status}`.toLowerCase().includes(query.toLowerCase())),[cases,query])
 const totalGap=cases.reduce((sum,c)=>sum+Number(c.gap_amount||0),0)
 function openNew(){setEditing(null);setForm(emptyForm);setModal(true)}
 function openEdit(c:CaseItem){setEditing(c);setForm({...c, sanctioned_amount:String(c.sanctioned_amount),estimated_cost:String(c.estimated_cost),existing_loan:String(c.existing_loan)});setModal(true)}
 async function save(e:React.FormEvent){e.preventDefault();setSaving(true);setNotice('');try{
  const body={...form,sanctioned_amount:Number(form.sanctioned_amount),estimated_cost:Number(form.estimated_cost),existing_loan:Number(form.existing_loan)}
  const r=await fetch(`${API}/api/cases${editing?`/${editing.id}`:''}`,{method:editing?'PATCH':'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})
  if(!r.ok){const detail=await r.json().catch(()=>null);throw new Error(detail?.detail?.[0]?.msg||'Could not save case')}
  await loadCases();setModal(false);setNotice(editing?'Case updated successfully.':'Beneficiary case created.')
 }catch(err){setError(err instanceof Error?err.message:'Save failed')}finally{setSaving(false)}}
 async function removeCase(c:CaseItem){if(!window.confirm(`Delete case for ${c.beneficiary_name}? This cannot be undone.`))return;try{const r=await fetch(`${API}/api/cases/${c.id}`,{method:'DELETE'});if(!r.ok)throw new Error();await loadCases();setNotice('Case deleted.')}catch{setError('Unable to delete case.')}}
 return <div className="shell">
  <aside className="sidebar"><div className="brand"><div className="logo">S</div><div><b>Sooru</b><small>Housing support</small></div></div>
   <div className="nav-label">WORKSPACE</div><nav><a className="active"><Home size={18}/> Overview</a><a><Users size={18}/> Beneficiaries</a><a><ClipboardList size={18}/> Cases</a><a><Wallet size={18}/> Finance planning</a></nav>
   <div className="sidebar-bottom"><div className="pilot">Pilot workspace<small>Karnataka · Demo</small></div></div>
  </aside>
  <main><header><div><span className="eyebrow">PILOT DASHBOARD</span><h1>Housing support cases</h1><p>Manage beneficiary records and financial readiness.</p></div><button className="icon-btn" aria-label="Notifications"><Bell size={18}/></button></header>
   {error&&<div className="error">{error}</div>}{notice&&<div className="success">{notice}</div>}
   <section className="stats"><article><span>Cases</span><strong>{cases.length}</strong><small>Recorded in workspace</small></article><article><span>In progress</span><strong>{cases.filter(c=>c.status!=='completed').length}</strong><small>Active case pipeline</small></article><article><span>Estimated financing gap</span><strong>{fmt(totalGap)}</strong><small>Prototype estimate across cases</small></article><article><span>Completed</span><strong>{cases.filter(c=>c.status==='completed').length}</strong><small>Case status</small></article></section>
   <section className="panel"><div className="panel-head"><div><h2>Beneficiary cases</h2><p>Create, search, update, and track cases</p></div><button className="primary" onClick={openNew}><Plus size={16}/> New beneficiary</button></div>
   <div className="search"><Search size={16}/><input placeholder="Search name, village, taluk, or status" value={query} onChange={e=>setQuery(e.target.value)}/></div>
   <div className="table-wrap"><table><thead><tr><th>Beneficiary</th><th>Village / Taluk</th><th>Status</th><th>Estimated cost</th><th>Financing gap</th><th>Actions</th></tr></thead><tbody>{filtered.length?filtered.map(c=><tr key={c.id}><td><b>{c.beneficiary_name}</b><small>Case #{c.id}{c.phone_last4?` · •••• ${c.phone_last4}`:''}</small></td><td>{c.village}<small>{c.taluk}</small></td><td><span className={`status ${c.status}`}>{label(c.status)}</span></td><td>{fmt(Number(c.estimated_cost))}</td><td>{fmt(Number(c.gap_amount))}</td><td><div className="actions"><button title="Edit case" onClick={()=>openEdit(c)}><Pencil size={15}/></button><button title="Delete case" onClick={()=>removeCase(c)}><Trash2 size={15}/></button></div></td></tr>):<tr><td colSpan={6} className="empty">{query?'No matching beneficiaries.':'No beneficiaries yet. Create the first case.'}</td></tr>}</tbody></table></div></section>
   <section className="notice"><b>Prototype notice</b><p>Demo workspace only. No official PMAY-G, lender, payment, identity verification, or government integration is active. The financing gap is a simple estimate and is not a loan eligibility decision.</p></section>
  </main>
  {modal&&<div className="modal-backdrop" onClick={e=>{if(e.target===e.currentTarget)setModal(false)}}><section className="modal"><div className="modal-head"><div><span className="eyebrow">{editing?'UPDATE RECORD':'NEW RECORD'}</span><h2>{editing?'Edit beneficiary case':'Add beneficiary'}</h2></div><button className="icon-btn" onClick={()=>setModal(false)}><X size={18}/></button></div>
   <form onSubmit={save}><div className="form-grid"><label>Beneficiary name *<input required minLength={2} value={form.beneficiary_name} onChange={e=>setForm({...form,beneficiary_name:e.target.value})}/></label><label>Village *<input required value={form.village} onChange={e=>setForm({...form,village:e.target.value})}/></label><label>Taluk *<input required value={form.taluk} onChange={e=>setForm({...form,taluk:e.target.value})}/></label><label>Phone last 4 digits<input inputMode="numeric" pattern="[0-9]{4}" maxLength={4} placeholder="Optional" value={form.phone_last4} onChange={e=>setForm({...form,phone_last4:e.target.value})}/></label><label>Status<select value={form.status} onChange={e=>setForm({...form,status:e.target.value as Status})}>{statuses.map(s=><option key={s} value={s}>{label(s)}</option>)}</select></label><label>Estimated construction cost (₹)<input type="number" min="0" step="1000" value={form.estimated_cost} onChange={e=>setForm({...form,estimated_cost:e.target.value})}/></label><label>Sanctioned assistance (₹)<input type="number" min="0" step="1000" value={form.sanctioned_amount} onChange={e=>setForm({...form,sanctioned_amount:e.target.value})}/></label><label>Existing loan (₹)<input type="number" min="0" step="1000" value={form.existing_loan} onChange={e=>setForm({...form,existing_loan:e.target.value})}/></label><label className="full">Notes<textarea rows={3} value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})}/></label></div><div className="modal-actions"><button type="button" className="secondary" onClick={()=>setModal(false)}>Cancel</button><button className="primary" disabled={saving}><Save size={16}/>{saving?'Saving…':editing?'Save changes':'Create case'}</button></div></form>
  </section></div>}
 </div>
}

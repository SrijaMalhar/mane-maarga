import { useState, type FormEvent } from 'react'
import { Home, ShieldCheck, LockKeyhole } from 'lucide-react'
const API = 'http://localhost:8000'
type AuthUser = { id:number; username:string; email:string; role:'admin'|'operator'|'viewer'; is_active:boolean }
export default function AuthScreen({bootstrapRequired,onAuthenticated}:{bootstrapRequired:boolean;onAuthenticated:(token:string,user:AuthUser)=>void}) {
 const [username,setUsername]=useState(''); const [email,setEmail]=useState(''); const [password,setPassword]=useState(''); const [busy,setBusy]=useState(false); const [error,setError]=useState('')
 async function submit(e:FormEvent){e.preventDefault();setBusy(true);setError('');try{
  const path=bootstrapRequired?'/api/auth/bootstrap':'/api/auth/login'
  const payload=bootstrapRequired?{username,email,password}:{username,password}
  const r=await fetch(`${API}${path}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)})
  const data=await r.json().catch(()=>({}))
  if(!r.ok)throw new Error(data.detail||'Authentication failed')
  onAuthenticated(data.access_token,data.user)
 }catch(err){setError(err instanceof Error?err.message:'Unable to authenticate')}finally{setBusy(false)}}
 return <div className="auth-screen"><div className="auth-card"><div className="auth-brand"><div className="brand-mark"><Home size={20}/></div><div><strong>sooru</strong><span>Housing support workspace</span></div></div><div className="auth-title"><div className="auth-shield"><ShieldCheck size={22}/></div><h1>{bootstrapRequired?'Set up your workspace':'Welcome back'}</h1><p>{bootstrapRequired?'Create the first administrator account to secure your workspace.':'Sign in to access beneficiary case records.'}</p></div><form onSubmit={submit} className="auth-form"><label>Username<input autoComplete="username" required minLength={3} value={username} onChange={e=>setUsername(e.target.value)}/></label>{bootstrapRequired&&<label>Email address<input type="email" autoComplete="email" required value={email} onChange={e=>setEmail(e.target.value)}/></label>}<label>Password<input type="password" autoComplete={bootstrapRequired?'new-password':'current-password'} required minLength={bootstrapRequired?12:1} value={password} onChange={e=>setPassword(e.target.value)}/>{bootstrapRequired&&<small>Use at least 12 characters for the administrator password.</small>}</label>{error&&<div className="auth-error">{error}</div>}<button className="primary-button auth-submit" disabled={busy}>{busy?'Please wait…':bootstrapRequired?'Create administrator':'Sign in'}</button></form><div className="auth-security"><LockKeyhole size={15}/><span>Protected access · Session token expires in 60 minutes</span></div></div><p className="auth-foot">Sooru prototype · Do not use real beneficiary data until production security review.</p></div>
}

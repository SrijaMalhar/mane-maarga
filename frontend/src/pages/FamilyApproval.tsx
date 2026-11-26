/* The page a family opens from an SMS link. Kannada first, large type, one decision.
   It says what will happen, how much, and who receives it; approving needs the one-time code. */
import { useEffect, useState } from 'react'
import { CheckCircle2, ShieldCheck, Volume2, XCircle } from 'lucide-react'
import type { OutboxItem, PublicApproval } from '../lib/api'
import { formatINR } from '../lib/money'
import { sameOrigin, speak, stopSpeaking } from '../lib/voice'

export type PublicClient = { get: <T>(p: string) => Promise<T>; post: <T>(p: string, b?: unknown) => Promise<T> }

const DONE: Record<string, [string, string]> = {
  executed: ['ಮುಗಿದಿದೆ. ನಿಮ್ಮ ಒಪ್ಪಿಗೆಯಂತೆ ಕೆಲಸ ಆಗಿದೆ.', 'Done. This was carried out as you approved.'],
  approved: ['ನೀವು ಒಪ್ಪಿಗೆ ನೀಡಿದ್ದೀರಿ.', 'You approved this.'],
  rejected: ['ನೀವು ಬೇಡ ಎಂದಿದ್ದೀರಿ. ಏನೂ ಆಗುವುದಿಲ್ಲ.', 'You said no. Nothing will happen.'],
  expired: ['ಈ ಲಿಂಕ್‌ನ ಸಮಯ ಮುಗಿದಿದೆ. ಸಿಬ್ಬಂದಿಯನ್ನು ಕೇಳಿ.', 'This link has expired. Ask the case worker.'],
}

export default function FamilyApproval({ token, client, onClose, demoSms = false }: { token: string; client: PublicClient; onClose?: () => void; demoSms?: boolean }) {
  const [sms, setSms] = useState('')
  const [a, setA] = useState<PublicApproval | null>(null)
  const [err, setErr] = useState('')
  const [step, setStep] = useState<'read' | 'code'>('read')
  const [code, setCode] = useState('')
  const [sentTo, setSentTo] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => { client.get<PublicApproval>(`/api/public/approvals/${token}`).then(setA).catch(e => setErr(e instanceof Error ? e.message : 'This link is not valid.')) }, [client, token])
  useEffect(() => () => stopSpeaking(), [])

  async function sendCode() {
    setBusy(true)
    try {
      const r = await client.post<{ sent_to: string }>(`/api/public/approvals/${token}/otp`); setSentTo(r.sent_to); setStep('code'); setErr('')
      if (demoSms && a) {
        const box = await client.get<OutboxItem[]>(`/api/outbox?case_id=${a.case_id}`).catch(() => [] as OutboxItem[])
        setSms(box.find(m => m.channel === 'sms')?.body ?? '')
      }
    }
    catch (e) { setErr(e instanceof Error ? e.message : 'Could not send the code') } finally { setBusy(false) }
  }
  async function decide(decision: 'approve' | 'reject') {
    setBusy(true)
    try { setA(await client.post<PublicApproval>(`/api/public/approvals/${token}/decision`, { decision, code })); setErr('') }
    catch (e) { setErr(e instanceof Error ? e.message : 'Something went wrong'); setCode('') } finally { setBusy(false) }
  }

  if (!a) return <main className="fam"><div className="fam-card">{err ? <p className="fam-err" role="alert">{err}</p> : <p>ಲೋಡ್ ಆಗುತ್ತಿದೆ… Loading…</p>}</div></main>
  const done = DONE[a.status]
  return (
    <main className="fam" lang="kn">
      <div className="fam-card">
        {sms && <div className="fam-sms" role="status"><b>SMS · Simulated</b><span>{sms}</span></div>}
        <p className="fam-brand">ಮನೆ ಮಾರ್ಗ · Mane Maarga {onClose && <button className="link-btn" onClick={onClose}>Close preview</button>}</p>
        <p className="fam-hello">ನಮಸ್ಕಾರ {a.beneficiary_first_name}.</p>
        <h1 className="fam-title">{a.label_kn}</h1>
        <p className="fam-sub" lang="en">{a.label_en}</p>
        <div className="fam-what">
          <p className="fam-summary">{a.summary_kn}</p>
          <button className="fam-listen" onClick={() => void speak(a.summary_kn, 'kn', { fetcher: sameOrigin, bhashini: true, gender: 'female' })}><Volume2 size={18} /> ಕೇಳಿ · Listen</button>
          <p className="fam-en" lang="en">{a.summary_en}</p>
        </div>
        <dl className="fam-facts">
          {a.amount_inr != null && <><dt>ಮೊತ್ತ · Amount</dt><dd className="fam-amount">{formatINR(a.amount_inr)}</dd></>}
          {a.recipient && <><dt>ಯಾರಿಗೆ · To</dt><dd>{a.recipient}</dd></>}
        </dl>
        {done ? (
          <div className={`fam-done ${a.status}`} role="status">
            {a.status === 'executed' || a.status === 'approved' ? <CheckCircle2 size={28} /> : <XCircle size={28} />}
            <p>{done[0]}<br /><span lang="en">{done[1]}</span></p>
          </div>
        ) : step === 'read' ? (
          <div className="fam-actions">
            <button className="fam-yes" onClick={() => void sendCode()} disabled={busy}>ಒಪ್ಪುತ್ತೇನೆ<span lang="en">I agree</span></button>
            <button className="fam-no" onClick={() => void decide('reject')} disabled={busy}>ಬೇಡ<span lang="en">No</span></button>
          </div>
        ) : (
          <form className="fam-code" onSubmit={e => { e.preventDefault(); void decide('approve') }}>
            <label htmlFor="otp">ನಿಮ್ಮ ಫೋನ್ {sentTo} ಗೆ ಬಂದ 6 ಅಂಕಿಯ ಸಂಕೇತ ಬರೆಯಿರಿ<span lang="en">Enter the 6-digit code sent to {sentTo}</span></label>
            <input id="otp" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ''))} autoFocus />
            <button className="fam-yes" type="submit" disabled={busy || code.length !== 6}><ShieldCheck size={20} /> ದೃಢಪಡಿಸಿ<span lang="en">Confirm</span></button>
            <button type="button" className="link-btn" onClick={() => void sendCode()} disabled={busy}>ಹೊಸ ಸಂಕೇತ ಕಳುಹಿಸಿ · Send a new code</button>
          </form>
        )}
        {err && <p className="fam-err" role="alert">{err}</p>}
        <p className="fam-fine">ನಿಮ್ಮ ಒಪ್ಪಿಗೆ ಇಲ್ಲದೆ ಹಣ, ಸಾಲ ಅಥವಾ ಅರ್ಜಿ ಮುಂದೆ ಹೋಗುವುದಿಲ್ಲ. ಸಂಕೇತವನ್ನು ಯಾರಿಗೂ ಹೇಳಬೇಡಿ.<span lang="en">No money, loan or application moves without your approval. Never share the code.</span></p>
      </div>
    </main>
  )
}

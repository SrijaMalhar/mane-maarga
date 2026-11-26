import { useState, type FormEvent } from 'react'
import { Dialog, Notice } from './ui'
import { STATUSES, type CaseItem, type Status } from '../lib/api'
import { useApp } from '../lib/app-context'
import { useI18n } from '../lib/i18n'

export default function CaseForm({ existing, onClose }: { existing?: CaseItem; onClose: () => void }) {
  const { api, reloadCases, toast, go } = useApp()
  const { t } = useI18n()
  const [form, setForm] = useState({
    beneficiary_name: existing?.beneficiary_name ?? '', village: existing?.village ?? '', taluk: existing?.taluk ?? '',
    phone_last4: existing?.phone_last4 ?? '', status: (existing?.status ?? 'intake') as Status,
    estimated_cost: String(existing?.estimated_cost ?? ''), sanctioned_amount: String(existing?.sanctioned_amount ?? ''),
    existing_loan: String(existing?.existing_loan ?? ''), notes: existing?.notes ?? '',
    plot: existing?.plot_lat != null && existing?.plot_lon != null ? `${existing.plot_lat}, ${existing.plot_lon}` : '',
  })
  const [locating, setLocating] = useState(false)
  function here() {
    if (!navigator.geolocation) { setError('This browser cannot share its location.'); return }
    setLocating(true)
    navigator.geolocation.getCurrentPosition(p => { setForm(f => ({ ...f, plot: `${p.coords.latitude.toFixed(6)}, ${p.coords.longitude.toFixed(6)}` })); setLocating(false) }, () => { setError('Location was not shared. Type the pin instead.'); setLocating(false) }, { enableHighAccuracy: true, timeout: 15000 })
  }
  const [consent, setConsent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm(f => ({ ...f, [k]: e.target.value }))

  async function submit(e: FormEvent) {
    e.preventDefault(); setBusy(true); setError('')
    const pin = form.plot.trim() ? form.plot.split(',').map(x => Number(x.trim())) : null
    if (pin && (pin.length !== 2 || !pin.every(Number.isFinite) || Math.abs(pin[0]) > 90 || Math.abs(pin[1]) > 180)) { setBusy(false); setError('Plot pin: give latitude, longitude, e.g. 12.7960, 77.3905'); return }
    const { plot: _plot, ...rest } = form; void _plot
    const body = { ...rest, estimated_cost: Number(form.estimated_cost || 0), sanctioned_amount: Number(form.sanctioned_amount || 0), existing_loan: Number(form.existing_loan || 0), plot_lat: pin ? pin[0] : null, plot_lon: pin ? pin[1] : null }
    try {
      if (existing) {
        await api.patch(`/api/cases/${existing.id}`, body)
        toast('Case updated')
      } else {
        const created = await api.post<CaseItem>('/api/cases', body)
        await api.post(`/api/cases/${created.id}/consent`, { consent_given: true, consent_scope: 'case_processing', consent_text_version: 'v1' })
        toast('Family added and consent recorded')
        go({ name: 'case', id: created.id })
      }
      await reloadCases(); onClose()
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not save') } finally { setBusy(false) }
  }

  return (
    <Dialog title={existing ? `Edit · ${existing.beneficiary_name}` : t('overview.add')} eyebrow={existing ? `Case #${existing.id}` : 'New household'} onClose={onClose}>
      <form onSubmit={submit} className="form">
        <fieldset>
          <legend>Household</legend>
          <div className="grid-2">
            <label className="field span-2"><span>Beneficiary name *</span><input required minLength={2} maxLength={160} value={form.beneficiary_name} onChange={set('beneficiary_name')} autoComplete="off" /></label>
            <label className="field"><span>Village *</span><input required maxLength={160} value={form.village} onChange={set('village')} /></label>
            <label className="field"><span>Taluk *</span><input required maxLength={160} value={form.taluk} onChange={set('taluk')} /></label>
            <label className="field"><span>Phone, last 4 digits</span><input inputMode="numeric" pattern="[0-9]{4}" maxLength={4} value={form.phone_last4} onChange={set('phone_last4')} placeholder="Optional" /><small>Only the last four digits are ever stored.</small></label>
            <label className="field"><span>Journey stage</span><select value={form.status} onChange={set('status')}>{STATUSES.map(s => <option key={s} value={s}>{t(`status.${s}` as never)}</option>)}</select></label>
          </div>
        </fieldset>
        <fieldset>
          <legend>Money, in rupees</legend>
          <div className="grid-3">
            <label className="field"><span>Estimated construction cost</span><input type="number" min="0" step="1000" value={form.estimated_cost} onChange={set('estimated_cost')} /></label>
            <label className="field"><span>Sanctioned assistance</span><input type="number" min="0" step="1000" value={form.sanctioned_amount} onChange={set('sanctioned_amount')} /><small>Confirmed by a sanction order.</small></label>
            <label className="field"><span>Existing household loan</span><input type="number" min="0" step="1000" value={form.existing_loan} onChange={set('existing_loan')} /><small>A liability, never counted as funding.</small></label>
          </div>
        </fieldset>
        <label className="field"><span>Plot pin (latitude, longitude)</span><span className="pin-row"><input value={form.plot} onChange={set('plot')} placeholder="12.7960, 77.3905" inputMode="decimal" /><button type="button" className="btn ghost small" onClick={here} disabled={locating}>{locating ? 'Locating…' : 'Use my location'}</button></span><small>Stand on the plot and tap the button. Site photos are checked against this pin.</small></label>
        <label className="field"><span>Notes</span><textarea rows={3} value={form.notes} onChange={set('notes')} /></label>
        {!existing && (
          <label className="consent-box">
            <input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} required />
            <span><b>The family has agreed to this record being created.</b><small>Consent is recorded with your name and time, and can be withdrawn from the case file. This prototype notice has not been legally reviewed — use synthetic records only.</small></span>
          </label>
        )}
        {error && <Notice tone="error">{error}</Notice>}
        <div className="form-actions">
          <button type="button" className="btn ghost" onClick={onClose}>{t('common.cancel')}</button>
          <button className="btn primary" disabled={busy || (!existing && !consent)}>{busy ? 'Saving…' : existing ? t('common.save') : t('overview.add')}</button>
        </div>
      </form>
    </Dialog>
  )
}

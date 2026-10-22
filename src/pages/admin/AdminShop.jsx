// Admin: shop settings (delivery prices, contacts, pausing orders,
// first-order discount) and discount codes.
import { useCallback, useEffect, useState } from 'react'
import { useDispatch } from 'react-redux'
import { useI18n } from '../../contexts/I18nContext'
import { useToast } from '../../contexts/ToastContext'
import Icon from '../../components/Icons'
import { formatPrice } from '../../utils/productHelpers'
import { settingsSet } from '../../store/settingsSlice'

const LANGS = [['tm', 'Türkmençe'], ['ru', 'Русский'], ['tr', 'Türkçe']]

// server field -> message (L key)
const SETTINGS_ERR = {
  deliveryPrice: 'setENumber', freeDeliveryFrom: 'setENumber', firstOrderDiscount: 'setEPercent',
  phone: 'setEPhone', email: 'setEEmail', instagram: 'setELink',
}

function Field({ id, label, hint, error, children }) {
  return (
    <div className="form-field" style={{ marginBottom: 14 }}>
      <label htmlFor={id}>{label}</label>
      {children}
      {hint && <small className="muted" style={{ display: 'block', marginTop: 6 }}>{hint}</small>}
      {error && <small role="alert" className="field-error">{error}</small>}
    </div>
  )
}

// ---- settings ---------------------------------------------------------------------------
export function AdminSettings({ L, call }) {
  const { t } = useI18n()
  const { toast } = useToast()
  const dispatch = useDispatch()
  const [form, setForm] = useState(null) // null = loading
  const [failed, setFailed] = useState(false)
  const [errors, setErrors] = useState({})
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setFailed(false)
    try {
      const { settings } = await call('/api/admin/settings')
      setForm({ ...settings, address: { ...settings.address }, hours: { ...settings.hours } })
    } catch { setFailed(true) }
  }, [call])
  useEffect(() => { load() }, [load])

  if (failed) {
    return (
      <div className="empty-state" role="alert">
        <h3>{L.loadFailed}</h3>
        <button type="button" className="btn btn-primary" onClick={load}>{L.retry}</button>
      </div>
    )
  }
  if (!form) return <p className="muted" role="status">{t('loading.wait')}</p>

  const set = (field) => (e) => {
    setForm((f) => ({ ...f, [field]: e.target.value }))
    setErrors((er) => ({ ...er, [field]: undefined }))
  }
  const setLang = (group, lang) => (e) => setForm((f) => ({ ...f, [group]: { ...f[group], [lang]: e.target.value } }))
  const err = (field) => (errors[field] ? L[SETTINGS_ERR[field]] || L.setENumber : null)

  async function onSubmit(e) {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    try {
      const { settings } = await call('/api/admin/settings', {
        method: 'PUT',
        body: {
          ...form,
          deliveryPrice: Number(form.deliveryPrice),
          freeDeliveryFrom: Number(form.freeDeliveryFrom),
          firstOrderDiscount: Number(form.firstOrderDiscount),
        },
      })
      dispatch(settingsSet(settings)) // the shop shows the new values at once
      setForm({ ...settings, address: { ...settings.address }, hours: { ...settings.hours } })
      setErrors({})
      toast(L.setSaved)
    } catch (err2) {
      if (err2?.data?.fields) setErrors(err2.data.fields)
      else toast(L.loadFailed, 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="summary adm-settings" style={{ position: 'static' }} onSubmit={onSubmit} noValidate>
      <h3 className="with-ico"><Icon name="truck" size={20} />{L.setOrders}</h3>
      <label className="check adm-stock" style={{ marginBottom: 18 }}>
        <input type="checkbox" checked={form.ordersOpen} onChange={(e) => setForm({ ...form, ordersOpen: e.target.checked })} />
        <span><strong>{L.setOrdersOpen}</strong><small className="muted">{L.setOrdersOpenHint}</small></span>
      </label>
      <div className="form-grid">
        <Field id="set-price" label={L.setDeliveryPrice} error={err('deliveryPrice')}>
          <input id="set-price" className="field" type="number" min="0" step="1" inputMode="numeric" value={form.deliveryPrice} onChange={set('deliveryPrice')} />
        </Field>
        <Field id="set-free" label={L.setFreeFrom} hint={L.setFreeFromHint} error={err('freeDeliveryFrom')}>
          <input id="set-free" className="field" type="number" min="0" step="1" inputMode="numeric" value={form.freeDeliveryFrom} onChange={set('freeDeliveryFrom')} />
        </Field>
      </div>
      <Field id="set-first" label={L.setFirstOrder} hint={L.setFirstOrderHint} error={err('firstOrderDiscount')}>
        <input id="set-first" className="field" type="number" min="0" max="90" step="1" inputMode="numeric" value={form.firstOrderDiscount} onChange={set('firstOrderDiscount')} />
      </Field>

      <h3 className="with-ico" style={{ marginTop: 26 }}><Icon name="phone" size={20} />{L.setContacts}</h3>
      <div className="form-grid">
        <Field id="set-phone" label={L.setPhone} error={err('phone')}>
          <input id="set-phone" className="field" type="tel" maxLength={40} placeholder="+993 12 000 000" value={form.phone} onChange={set('phone')} />
        </Field>
        <Field id="set-email" label={L.setEmail} error={err('email')}>
          <input id="set-email" className="field" type="email" maxLength={254} value={form.email} onChange={set('email')} />
        </Field>
      </div>
      <Field id="set-insta" label="Instagram" hint={L.setInstagramHint} error={err('instagram')}>
        <input id="set-insta" className="field" type="url" maxLength={300} placeholder="https://www.instagram.com/…" value={form.instagram} onChange={set('instagram')} />
      </Field>
      <fieldset className="de-section">
        <legend>{L.setAddress}</legend>
        {LANGS.map(([l, label]) => (
          <Field key={l} id={`set-addr-${l}`} label={label}>
            <input id={`set-addr-${l}`} className="field" maxLength={200} value={form.address[l] || ''} onChange={setLang('address', l)} />
          </Field>
        ))}
      </fieldset>
      <fieldset className="de-section">
        <legend>{L.setHours}</legend>
        {LANGS.map(([l, label]) => (
          <Field key={l} id={`set-hours-${l}`} label={label}>
            <input id={`set-hours-${l}`} className="field" maxLength={200} value={form.hours[l] || ''} onChange={setLang('hours', l)} />
          </Field>
        ))}
      </fieldset>
      <button className="btn btn-primary btn-block" type="submit" disabled={busy} aria-busy={busy}>{busy ? L.saving : L.setSave}</button>
    </form>
  )
}

// ---- discount codes --------------------------------------------------------------------
// date input (yyyy-mm-dd, the shop's own time) <-> ISO time on the server.
// A code starts at the beginning of its first day and ends at the end of its last day.
const toDay = (iso) => {
  if (!iso) return ''
  const d = new Date(iso)
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}
const dayStart = (day) => (day ? new Date(`${day}T00:00:00`).toISOString() : null)
const dayEnd = (day) => (day ? new Date(`${day}T23:59:59`).toISOString() : null)

const emptyCode = () => ({ code: '', kind: 'percent', value: '', minTotal: '', maxUses: '', startDay: '', endDay: '', firstOrderOnly: false, active: true })
const CODE_ERR = { code: 'dcECode', value: 'dcEValue', minTotal: 'dcENumber', maxUses: 'dcENumber', startsAt: 'dcEDate', endsAt: 'dcEDate', kind: 'dcEValue' }

export function AdminDiscounts({ L, call }) {
  const { lang, t } = useI18n()
  const { toast } = useToast()
  const [list, setList] = useState(null) // null = loading
  const [failed, setFailed] = useState(false)
  const [form, setForm] = useState(emptyCode)
  const [editing, setEditing] = useState(null) // id being edited
  const [errors, setErrors] = useState({})
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setFailed(false)
    try { setList((await call('/api/admin/discounts')).discounts) } catch { setFailed(true) }
  }, [call])
  useEffect(() => { load() }, [load])

  const set = (field) => (e) => {
    setForm((f) => ({ ...f, [field]: e.target.value }))
    setErrors((er) => ({ ...er, [field]: undefined, startsAt: undefined, endsAt: undefined }))
  }
  const err = (field) => (errors[field] ? (errors[field] === 'taken' ? L.dcETaken : L[CODE_ERR[field]]) : null)

  function reset() {
    setForm(emptyCode())
    setEditing(null)
    setErrors({})
  }

  function startEdit(d) {
    setEditing(d.id)
    setErrors({})
    setForm({
      code: d.code, kind: d.kind, value: String(d.value), minTotal: d.minTotal ? String(d.minTotal) : '',
      maxUses: d.maxUses ? String(d.maxUses) : '', startDay: toDay(d.startsAt), endDay: toDay(d.endsAt),
      firstOrderOnly: d.firstOrderOnly, active: d.active,
    })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const body = (f) => ({
    code: f.code, kind: f.kind, value: Number(f.value), minTotal: f.minTotal, maxUses: f.maxUses,
    startsAt: dayStart(f.startDay), endsAt: dayEnd(f.endDay), firstOrderOnly: f.firstOrderOnly, active: f.active,
  })

  async function onSubmit(e) {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    try {
      const path = editing ? `/api/admin/discounts/${editing}` : '/api/admin/discounts'
      const { discount } = await call(path, { method: editing ? 'PUT' : 'POST', body: body(form) })
      setList((l) => (editing ? l.map((x) => (x.id === discount.id ? discount : x)) : [discount, ...(l || [])]))
      toast(editing ? L.dcUpdated : L.dcAdded)
      reset()
    } catch (err2) {
      if (err2?.data?.fields) setErrors(err2.data.fields)
      else toast(L.loadFailed, 'error')
    } finally {
      setBusy(false)
    }
  }

  async function toggle(d) {
    try {
      const f = { ...d, startDay: toDay(d.startsAt), endDay: toDay(d.endsAt), active: !d.active }
      const { discount } = await call(`/api/admin/discounts/${d.id}`, {
        method: 'PUT',
        body: { ...body(f), startsAt: d.startsAt, endsAt: d.endsAt }, // keep the exact times
      })
      setList((l) => l.map((x) => (x.id === discount.id ? discount : x)))
    } catch { toast(L.loadFailed, 'error') }
  }

  async function remove(d) {
    if (!window.confirm(L.dcDeleteConfirm.replace('{code}', d.code))) return
    try {
      await call(`/api/admin/discounts/${d.id}`, { method: 'DELETE' })
      setList((l) => l.filter((x) => x.id !== d.id))
      if (editing === d.id) reset()
      toast(L.dcDeleted)
    } catch { toast(L.loadFailed, 'error') }
  }

  const fmtDay = (iso) => new Date(iso).toLocaleDateString(lang === 'tm' ? 'tk' : lang)
  const rules = (d) => [
    d.minTotal ? L.dcRuleMin.replace('{n}', formatPrice(d.minTotal)) : null,
    d.firstOrderOnly ? L.dcRuleFirst : null,
    d.startsAt ? L.dcRuleFrom.replace('{d}', fmtDay(d.startsAt)) : null,
    d.endsAt ? L.dcRuleUntil.replace('{d}', fmtDay(d.endsAt)) : null,
    L.dcRuleUsed.replace('{n}', d.usedCount) + (d.maxUses ? ` / ${d.maxUses}` : ''),
  ].filter(Boolean).join(' · ')
  const expired = (d) => d.endsAt && new Date(d.endsAt) < new Date()

  return (
    <>
      <form className="summary adm-settings" style={{ position: 'static', marginBottom: 24 }} onSubmit={onSubmit} noValidate>
        <h3 className="with-ico"><Icon name={editing ? 'edit' : 'plus'} size={20} />{editing ? L.dcEdit : L.dcAdd}</h3>
        <div className="form-grid">
          <Field id="dc-code" label={L.dcCode} hint={L.dcCodeHint} error={err('code')}>
            <input id="dc-code" className="field dc-code-input" maxLength={30} autoCapitalize="characters" placeholder="SPRING10" value={form.code} onChange={set('code')} />
          </Field>
          <Field id="dc-value" label={form.kind === 'percent' ? L.dcValuePercent : L.dcValueAmount} error={err('value')}>
            <div className="dc-value">
              <input id="dc-value" className="field" type="number" min="1" max={form.kind === 'percent' ? 100 : undefined} step="1" inputMode="numeric" value={form.value} onChange={set('value')} />
              <select className="field" aria-label={L.dcKind} value={form.kind} onChange={set('kind')}>
                <option value="percent">%</option>
                <option value="amount">TMT</option>
              </select>
            </div>
          </Field>
          <Field id="dc-min" label={L.dcMin} hint={L.dcMinHint} error={err('minTotal')}>
            <input id="dc-min" className="field" type="number" min="0" step="1" inputMode="numeric" placeholder="0" value={form.minTotal} onChange={set('minTotal')} />
          </Field>
          <Field id="dc-uses" label={L.dcMaxUses} hint={L.dcMaxUsesHint} error={err('maxUses')}>
            <input id="dc-uses" className="field" type="number" min="1" step="1" inputMode="numeric" value={form.maxUses} onChange={set('maxUses')} />
          </Field>
          <Field id="dc-start" label={L.dcStart} error={err('startsAt')}>
            <input id="dc-start" className="field" type="date" value={form.startDay} onChange={set('startDay')} />
          </Field>
          <Field id="dc-end" label={L.dcEnd} hint={L.dcEndHint} error={err('endsAt')}>
            <input id="dc-end" className="field" type="date" value={form.endDay} onChange={set('endDay')} />
          </Field>
        </div>
        <label className="check adm-stock" style={{ marginBottom: 12 }}>
          <input type="checkbox" checked={form.firstOrderOnly} onChange={(e) => setForm({ ...form, firstOrderOnly: e.target.checked })} />
          <span><strong>{L.dcFirstOnly}</strong><small className="muted">{L.dcFirstOnlyHint}</small></span>
        </label>
        <label className="check adm-stock" style={{ marginBottom: 18 }}>
          <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />
          <span><strong>{L.dcActive}</strong><small className="muted">{L.dcActiveHint}</small></span>
        </label>
        <button className="btn btn-primary btn-block" type="submit" disabled={busy} aria-busy={busy}>{busy ? L.saving : editing ? L.saveEdit : L.dcAdd}</button>
        {editing && <button className="btn btn-outline btn-block" type="button" style={{ marginTop: 10 }} onClick={reset} disabled={busy}>{L.cancel}</button>}
      </form>

      <div className="adm-list">
        {failed && (
          <div className="empty-state" role="alert">
            <h3>{L.loadFailed}</h3>
            <button type="button" className="btn btn-primary" onClick={load}>{L.retry}</button>
          </div>
        )}
        {!failed && list === null && <p className="muted" role="status">{t('loading.wait')}</p>}
        {list && !list.length && <div className="empty-state"><div className="es-icon"><Icon name="percent" size={32} /></div><h3>{L.dcEmpty}</h3></div>}
        {list?.map((d) => (
          <article key={d.id} className={`adm-card-row adm-discount${d.active && !expired(d) ? '' : ' is-off'}`}>
            <div className="adm-customer-main">
              <strong className="order-code">{d.code}</strong>
              <span>{d.kind === 'percent' ? `−${d.value}%` : `−${formatPrice(d.value)}`}</span>
              <small className="muted">{rules(d)}</small>
              <div className="adm-cus-tags">
                {!d.active && <span className="adm-cus-tag is-blocked">{L.dcOff}</span>}
                {d.active && expired(d) && <span className="adm-cus-tag is-blocked">{L.dcExpired}</span>}
              </div>
            </div>
            <div className="adm-customer-actions">
              <button type="button" className="btn btn-outline btn-sm" aria-pressed={d.active} onClick={() => toggle(d)}>{d.active ? L.dcTurnOff : L.dcTurnOn}</button>
              <button type="button" className="btn btn-outline btn-sm" onClick={() => startEdit(d)}><Icon name="edit" size={16} />{L.editBtn}</button>
              <button type="button" className="btn btn-outline btn-sm adm-cus-delete" onClick={() => remove(d)} aria-label={`${L.del} – ${d.code}`}><Icon name="trash" size={16} />{L.del}</button>
            </div>
          </article>
        ))}
      </div>
    </>
  )
}

import { useState } from 'react'
import PageHead from '../components/PageHead'
import { api, errorMessage } from '../api'
import { useI18n } from '../contexts/I18nContext'
import { useToast } from '../contexts/ToastContext'
import Icon from '../components/Icons'
import FormField from '../components/FormField'
import { useSettings } from '../store/hooks'
import { checkFields, clearError, focusFirstError, keysFromServer } from '../utils/formCheck'

export default function Contact() {
  const { t } = useI18n()
  const { toast } = useToast()
  const { phone, email, addressText, hoursText } = useSettings()
  const [busy, setBusy] = useState(false)
  const [errors, setErrors] = useState({}) // field -> translation key

  async function onSubmit(e) {
    e.preventDefault()
    if (busy) return
    const f = e.target
    const errs = checkFields(f, { cName: { required: true }, cEmail: { required: true, email: true }, cPhone: { phone: true }, cMessage: { required: true } })
    setErrors(errs)
    if (Object.keys(errs).length) { focusFirstError(f, errs); return }
    setBusy(true)
    try {
      await api('/api/contact', {
        method: 'POST',
        body: { name: f.cName.value.trim(), email: f.cEmail.value.trim(), phone: f.cPhone.value.trim(), message: f.cMessage.value.trim() },
      })
      toast(t('contact.ok'))
      f.reset()
    } catch (err) {
      if (err.code === 'validation' && err.data?.fields) {
        const map = { name: 'cName', email: 'cEmail', phone: 'cPhone', message: 'cMessage' }
        const errs2 = Object.fromEntries(Object.entries(keysFromServer(err.data.fields)).map(([k, v]) => [map[k] || k, v]))
        setErrors(errs2)
        focusFirstError(f, errs2)
      }
      toast(errorMessage(t, err), 'error')
    } finally {
      setBusy(false)
    }
  }
  return (
    <>
      <PageHead title={t('contact.title')} sub={t('contact.sub')} crumbs={[{ label: t('contact.title') }]} />
      <section className="section">
        <div className="container">
          <div className="info-grid" style={{ marginBottom: 50 }}>
            {phone && <div className="info-card"><span className="ic"><Icon name="phone" size={24} /></span><h3>{t('contact.phone')}</h3><p><a href={`tel:${phone.replace(/[^\d+]/g, '')}`}>{phone}</a></p></div>}
            {email && <div className="info-card"><span className="ic"><Icon name="mail" size={24} /></span><h3>{t('contact.email')}</h3><p><a href={`mailto:${email}`}>{email}</a></p></div>}
            <div className="info-card"><span className="ic"><Icon name="pin" size={24} /></span><h3>{t('contact.address')}</h3><p>{addressText}</p></div>
            <div className="info-card"><span className="ic"><Icon name="clock" size={24} /></span><h3>{t('contact.hours')}</h3><p>{hoursText}</p></div>
          </div>
          <div className="grid-2">
            <div className="summary" style={{ position: 'static' }}>
              <h3>{t('contact.form')}</h3>
              <form onSubmit={onSubmit} onInput={clearError(setErrors)} noValidate>
                <FormField id="cName" name="cName" label={t('contact.name')} error={errors.cName} style={{ marginBottom: 14 }} autoComplete="name" maxLength={120} />
                <FormField id="cEmail" name="cEmail" label={t('contact.email')} error={errors.cEmail} style={{ marginBottom: 14 }} type="email" autoComplete="email" maxLength={254} />
                <FormField id="cPhone" name="cPhone" label={t('contact.phone')} error={errors.cPhone} style={{ marginBottom: 14 }} type="tel" autoComplete="tel" maxLength={30} />
                <FormField id="cMessage" name="cMessage" label={t('contact.message')} error={errors.cMessage} style={{ marginBottom: 20 }} textarea maxLength={3000} />
                <button className="btn btn-primary btn-block" type="submit" disabled={busy} aria-busy={busy}>{busy ? t('form.sending') : t('contact.send')}</button>
              </form>
            </div>
            <div className="map-box">
              <div className="map-pin">
                <div className="pin"><span><Icon name="pin" size={24} /></span></div>
                <strong>{t('contact.mapTitle')}</strong>
                <small>{t('contact.mapSub')}</small>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  )
}

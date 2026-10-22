import { useState } from 'react'
import { Link } from 'react-router-dom'
import { api, errorMessage } from '../api'
import { useI18n } from '../contexts/I18nContext'
import { useToast } from '../contexts/ToastContext'
import { FLOWER_TYPES } from '../data/navigation'
import Icon from './Icons'
import { useAuth, useSettings } from '../store/hooks'
import { EMAIL_RE } from '../utils/formCheck'

const LOGO = '/images/lale%20gulleri.jpg'

export default function Footer() {
  const { t } = useI18n()
  const { toast } = useToast()
  const { phone, email, instagram } = useSettings()
  const { user } = useAuth()
  const year = new Date().getFullYear()
  const [busy, setBusy] = useState(false)

  async function subscribe(e) {
    e.preventDefault()
    if (busy) return
    const form = e.target
    const email = form.email.value.trim()
    if (!EMAIL_RE.test(email)) { toast(t('auth.errEmail'), 'error'); form.email.focus(); return }
    setBusy(true)
    try {
      await api('/api/newsletter', { method: 'POST', body: { email } })
      toast(t('news.ok'))
      form.reset()
    } catch (err) {
      toast(err.code === 'validation' ? t('auth.errEmail') : errorMessage(t, err), 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <footer className="site-footer">
      <div className="footer-news">
        <div className="container footer-news-inner">
          <div>
            <h3>{t('foot.newsTitle')}</h3>
            <p>{t('news.text')}</p>
          </div>
          <form onSubmit={subscribe} noValidate>
            <input type="email" name="email" placeholder={t('news.ph')} aria-label={t('news.ph')} autoComplete="email" maxLength={254} />
            <button className="btn btn-primary" type="submit" disabled={busy}>{busy ? t('form.sending') : t('news.btn')}</button>
          </form>
        </div>
      </div>

      <div className="container">
        <div className="footer-top">
          <div>
            <div className="footer-brand">
              <img src={LOGO} alt="Lale gülleri logo" />
              <div>
                <strong>Lale Gülleri</strong>
                <small>{t('brand.tagline')}</small>
              </div>
            </div>
            <p className="footer-desc">{t('foot.desc')}</p>
            <h4 className="footer-social-title">{t('foot.social')}</h4>
            <div className="socials">
              {instagram && (
                <a href={instagram} target="_blank" rel="noopener noreferrer" aria-label="Instagram">
                  <Icon name="instagram" size={19} />
                </a>
              )}
              {phone && <a href={`tel:${phone.replace(/[^\d+]/g, '')}`} aria-label={t('contact.phone')}><Icon name="phone" size={18} /></a>}
              {email && <a href={`mailto:${email}`} aria-label={t('contact.email')}><Icon name="mail" size={18} /></a>}
              <Link to="/contact" aria-label={t('contact.address')}><Icon name="pin" size={18} /></Link>
            </div>
          </div>
          <div className="footer-col">
            <h4>{t('foot.catalog')}</h4>
            <Link to="/catalog">{t('menu.allFlowers')}</Link>
            {FLOWER_TYPES.map((c) => (
              <Link key={c.key} to={c.to}>{t(`cat.${c.key}`)}</Link>
            ))}
          </div>
          <div className="footer-col">
            <h4>{t('foot.company')}</h4>
            <Link to="/about">{t('nav.about')}</Link>
            <Link to="/delivery">{t('foot.delivery')}</Link>
            <Link to="/categories">{t('cat.eyebrow')}</Link>
            <Link to="/delivery">{t('foot.payment')}</Link>
          </div>
          <div className="footer-col">
            <h4>{t('foot.contact')}</h4>
            <Link to="/contact">{t('nav.contact')}</Link>
            <Link to="/contact">{t('foot.faq')}</Link>
            <Link to="/track">{t('top.track')}</Link>
            {user ? <Link to="/profile">{t('top.account')}</Link> : <Link to="/login">{t('auth.loginBtn')}</Link>}
          </div>
        </div>
        <div className="footer-bottom">
          <span>© {year} Lale Gülleri. {t('foot.rights')}</span>
          <div className="pay">
            <span>VISA</span><span>MasterCard</span><span>{t('checkout.cash')}</span>
          </div>
        </div>
      </div>
    </footer>
  )
}

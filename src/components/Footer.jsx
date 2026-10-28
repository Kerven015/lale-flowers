import { Link } from 'react-router-dom'
import { useI18n } from '../contexts/I18nContext'
import Icon from './Icons'
import { useAuth, useFlowerTypeLinks, useSettings } from '../store/hooks'
import { LOGO } from '../utils/assets'

export default function Footer() {
  const { t } = useI18n()
  const { phone, email, instagram } = useSettings()
  const { user } = useAuth()
  const types = useFlowerTypeLinks()
  const year = new Date().getFullYear()

  return (
    <footer className="site-footer">
      <div className="container">
        <div className="footer-top">
          <div>
            <div className="footer-brand">
              <img src={LOGO} alt="Läle gülleri logo" />
              <div>
                <strong>Läle Gülleri</strong>
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
            {types.map((c) => (
              <Link key={c.key} to={c.to}>{c.label}</Link>
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
            <Link to="/privacy">{t('privacy.title')}</Link>
            {user ? <Link to="/profile">{t('top.account')}</Link> : <Link to="/login">{t('auth.loginBtn')}</Link>}
          </div>
        </div>
        <div className="footer-bottom">
          <span>© {year} Läle Gülleri. {t('foot.rights')}</span>
          <div className="pay">
            <span>VISA</span><span>MasterCard</span><span>{t('checkout.cash')}</span>
          </div>
        </div>
      </div>
    </footer>
  )
}

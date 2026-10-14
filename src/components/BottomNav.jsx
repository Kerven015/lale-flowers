import { NavLink } from 'react-router-dom'
import { useI18n } from '../contexts/I18nContext'
import Icon from './Icons'
import { CountBadge } from '../motion/RollingNumber'
import { useCart } from '../store/hooks'

export default function BottomNav() {
  const { count } = useCart()
  const { t } = useI18n()
  return (
    <nav className="bottom-nav" aria-label={t('a11y.menu')}>
      <NavLink to="/" end className="bottom-nav-item">
        <span className="bottom-nav-icon"><Icon name="home" size={22} /></span>
        <span className="bottom-nav-label">{t('nav.home')}</span>
      </NavLink>
      <NavLink to="/catalog" className="bottom-nav-item">
        <span className="bottom-nav-icon"><Icon name="flower" size={22} /></span>
        <span className="bottom-nav-label">{t('nav.catalog')}</span>
      </NavLink>
      <NavLink to="/cart" className="bottom-nav-item">
        <span className="bottom-nav-icon">
          <Icon name="cart" size={22} /><CountBadge count={count} id="cartBadgeMobile" />
        </span>
        <span className="bottom-nav-label">{t('cart.title')}</span>
      </NavLink>
      <NavLink to="/profile" className="bottom-nav-item">
        <span className="bottom-nav-icon"><Icon name="user" size={22} /></span>
        <span className="bottom-nav-label">{t('profile.title')}</span>
      </NavLink>
    </nav>
  )
}

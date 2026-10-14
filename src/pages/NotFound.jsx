import { Link } from 'react-router-dom'
import { useI18n } from '../contexts/I18nContext'

export default function NotFound() {
  const { t } = useI18n()
  return (
    <section className="section">
      <div className="container">
        <div className="empty-state">
          <div className="es-icon">404</div>
          <h3>{t('nf.title')}</h3>
          <p>{t('nf.text')}</p>
          <Link className="btn btn-primary" to="/">{t('nav.home')}</Link>
        </div>
      </div>
    </section>
  )
}

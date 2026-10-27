import PageHead from '../components/PageHead'
import { useI18n } from '../contexts/I18nContext'
import { GOOGLE_PRIVACY_URL, PRIVACY, UPDATED } from '../data/privacy'
import { useSettings } from '../store/hooks'
import { fill } from '../utils/productHelpers'

export default function Privacy() {
  const { t, lang } = useI18n()
  const { phone, email, addressText } = useSettings()
  const p = PRIVACY[lang] || PRIVACY.tm
  return (
    <>
      <PageHead title={t('privacy.title')} sub={fill(t('privacy.updated'), { date: UPDATED })} crumbs={[{ label: t('privacy.title') }]} />
      <section className="section">
        <div className="container legal">
          <p className="legal-intro">{p.intro}</p>
          {p.sections.map((s) => (
            <section key={s.title}>
              <h2>{s.title}</h2>
              {s.list && <ul>{s.list.map((li) => <li key={li}>{li}</li>)}</ul>}
              {s.text?.map((para) => <p key={para}>{para}</p>)}
              {s.google && <p><a href={GOOGLE_PRIVACY_URL} target="_blank" rel="noopener noreferrer">{s.google}</a></p>}
            </section>
          ))}
          <section>
            <h2>{p.contactTitle}</h2>
            <ul>
              {email && <li>{t('contact.email')}: <a href={`mailto:${email}`}>{email}</a></li>}
              {phone && <li>{t('contact.phone')}: <a href={`tel:${phone.replace(/[^\d+]/g, '')}`}>{phone}</a></li>}
              {addressText && <li>{t('contact.address')}: {addressText}</li>}
            </ul>
          </section>
        </div>
      </section>
    </>
  )
}

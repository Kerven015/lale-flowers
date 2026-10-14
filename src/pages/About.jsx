import { Link } from 'react-router-dom'
import PageHead from '../components/PageHead'
import { useI18n } from '../contexts/I18nContext'
import Icon from '../components/Icons'

const LOGO = '/images/lale%20gulleri.jpg'

export default function About() {
  const { t } = useI18n()
  return (
    <>
      <PageHead title={t('aboutPage.title')} sub={t('aboutPage.sub')} crumbs={[{ label: t('aboutPage.title') }]} />
      <section className="section">
        <div className="container">
          <div className="grid-2" style={{ alignItems: 'center' }}>
            <div>
              <span className="eyebrow">{t('aboutPage.story')}</span>
              <h2>{t('aboutPage.story')}</h2>
              <p className="muted">{t('aboutPage.storyText')}</p>
              <Link className="btn btn-primary" to="/catalog">{t('pop.all')}</Link>
            </div>
            <div className="img-zoom" style={{ borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
              <img src={LOGO} alt="Lale gülleri" style={{ width: '100%', aspectRatio: '1/1', objectFit: 'cover' }} />
            </div>
          </div>
        </div>
      </section>
      <section className="section section-alt">
        <div className="container">
          <div className="stats-grid">
            <div className="stat"><strong>10+</strong><span>{t('aboutPage.stat1')}</span></div>
            <div className="stat"><strong>12K+</strong><span>{t('aboutPage.stat2')}</span></div>
            <div className="stat"><strong>45K+</strong><span>{t('aboutPage.stat3')}</span></div>
            <div className="stat"><strong>5</strong><span>{t('aboutPage.stat4')}</span></div>
          </div>
        </div>
      </section>
      <section className="section">
        <div className="container">
          <div className="section-head"><div><span className="eyebrow">{t('aboutPage.adv')}</span><h2>{t('aboutPage.adv')}</h2></div></div>
          <div className="info-grid">
            <article className="info-card"><span className="ic"><Icon name="gem" size={24} /></span><h3>{t('aboutPage.adv1')}</h3><p>{t('aboutPage.adv1t')}</p></article>
            <article className="info-card"><span className="ic"><Icon name="flower" size={24} /></span><h3>{t('aboutPage.adv2')}</h3><p>{t('aboutPage.adv2t')}</p></article>
            <article className="info-card"><span className="ic"><Icon name="truck" size={24} /></span><h3>{t('aboutPage.adv3')}</h3><p>{t('aboutPage.adv3t')}</p></article>
            <article className="info-card"><span className="ic"><Icon name="handshake" size={24} /></span><h3>{t('aboutPage.adv4')}</h3><p>{t('aboutPage.adv4t')}</p></article>
          </div>
        </div>
      </section>
      <section className="section section-alt">
        <div className="container">
          <div className="section-head">
            <div>
              <span className="eyebrow">{t('aboutPage.team')}</span>
              <h2>{t('aboutPage.team')}</h2>
              <p>{t('aboutPage.teamSub')}</p>
            </div>
          </div>
          <div className="team-grid">
            <div className="team-card"><span className="avatar">A</span><h3>{t('aboutPage.member1')}</h3><span>{t('aboutPage.member1r')}</span></div>
            <div className="team-card"><span className="avatar">M</span><h3>{t('aboutPage.member2')}</h3><span>{t('aboutPage.member2r')}</span></div>
            <div className="team-card"><span className="avatar">S</span><h3>{t('aboutPage.member3')}</h3><span>{t('aboutPage.member3r')}</span></div>
          </div>
        </div>
      </section>
    </>
  )
}

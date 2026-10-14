import { Link } from 'react-router-dom'
import ProductGrid from '../components/ProductGrid'
import { useI18n } from '../contexts/I18nContext'
import Icon from '../components/Icons'
import { useProducts } from '../store/hooks'

const LOGO = '/images/lale%20gulleri.jpg'

export default function Home() {
  const { t } = useI18n()
  const { products } = useProducts()
  const popular = [...products].sort((a, b) => b.rating - a.rating).slice(0, 8)

  return (
    <>
      <section className="hero">
        <div className="container hero-inner">
          <div className="hero-text">
            <span className="hero-badge"><Icon name="sparkles" size={16} /> {t('hero.badge')}</span>
            <h1 dangerouslySetInnerHTML={{ __html: t('hero.title') }} />
            <p className="hero-sub">{t('hero.sub')}</p>
            <div className="hero-actions">
              <Link className="btn btn-primary btn-lg" to="/catalog">{t('hero.shop')}</Link>
              <Link className="btn btn-outline btn-lg" to="/categories">{t('hero.catalog')}</Link>
            </div>
            <div className="hero-stats">
              <div><strong>12K+</strong><span>{t('hero.stat1')}</span></div>
              <div><strong>150+</strong><span>{t('hero.stat2')}</span></div>
              <div><strong>2s</strong><span>{t('hero.stat3')}</span></div>
            </div>
          </div>
          <div className="hero-visual">
            <img src={LOGO} alt="Lale gülleri" />
            <div className="hero-float">
              <span className="dot"><Icon name="truck" size={20} /></span>
              <div>
                <strong>{t('hero.floatTitle')}</strong>
                <small>{t('hero.floatSub')}</small>
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="container">
        <div className="trust">
          <div className="trust-item"><span className="ti"><Icon name="flower" size={22} /></span><div><strong>{t('trust.fresh')}</strong><span>{t('trust.freshSub')}</span></div></div>
          <div className="trust-item"><span className="ti"><Icon name="truck" size={22} /></span><div><strong>{t('trust.delivery')}</strong><span>{t('trust.deliverySub')}</span></div></div>
          <div className="trust-item"><span className="ti"><Icon name="card" size={22} /></span><div><strong>{t('trust.payment')}</strong><span>{t('trust.paymentSub')}</span></div></div>
          <div className="trust-item"><span className="ti"><Icon name="message" size={22} /></span><div><strong>{t('trust.support')}</strong><span>{t('trust.supportSub')}</span></div></div>
        </div>
      </div>

      <section className="section">
        <div className="container">
          <div className="section-head">
            <div>
              <span className="eyebrow">{t('cat.eyebrow')}</span>
              <h2>{t('cat.title')}</h2>
              <p>{t('cat.sub')}</p>
            </div>
          </div>
          <div className="cat-grid">
            {[
              ['/roses', 'flower', 'cat.roses', 4],
              ['/tulips', 'blossom', 'cat.tulips', 3],
              ['/bouquets', 'sparkles', 'cat.bouquets', 6],
              ['/gifts', 'gift', 'cat.gifts', 2],
              ['/catalog?cat=plants', 'sprout', 'cat.plants', 1],
              ['/catalog?cat=bouquets', 'heart', 'cat.romantic', 6],
            ].map(([href, icon, key, n]) => (
              <Link key={key} className="cat-card" to={href}>
                <span className="ci"><Icon name={icon} size={24} /></span>
                <h3>{t(key)}</h3>
                <span>{n} {t('cat.items')}</span>
                <span className="arrow">{t('cat.view')} →</span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="section section-alt">
        <div className="container">
          <div className="section-head">
            <div>
              <span className="eyebrow">{t('pop.eyebrow')}</span>
              <h2>{t('pop.title')}</h2>
              <p>{t('pop.sub')}</p>
            </div>
            <Link className="btn btn-outline" to="/catalog">{t('pop.all')}</Link>
          </div>
          <ProductGrid products={popular} />
        </div>
      </section>

      <section className="section">
        <div className="container">
          <div className="promo">
            <div>
              <h2>{t('promo.title')}</h2>
              <p dangerouslySetInnerHTML={{ __html: t('promo.text') }} />
              <Link className="btn btn-light btn-lg" to="/catalog">{t('promo.btn')}</Link>
            </div>
            <div className="promo-art">
              <img src={LOGO} alt="" />
            </div>
          </div>
        </div>
      </section>

      <section className="section section-alt">
        <div className="container">
          <div className="section-head">
            <div>
              <span className="eyebrow">{t('about.eyebrow')}</span>
              <h2>{t('about.title')}</h2>
              <p>{t('about.text')}</p>
            </div>
            <Link className="btn btn-outline" to="/about">{t('about.btn')}</Link>
          </div>
          <div className="info-grid">
            <article className="info-card"><span className="ic"><Icon name="flower" size={24} /></span><h3>{t('about.f1')}</h3><p>{t('about.f1t')}</p></article>
            <article className="info-card"><span className="ic"><Icon name="sprout" size={24} /></span><h3>{t('about.f2')}</h3><p>{t('about.f2t')}</p></article>
            <article className="info-card"><span className="ic"><Icon name="zap" size={24} /></span><h3>{t('about.f3')}</h3><p>{t('about.f3t')}</p></article>
          </div>
        </div>
      </section>

    </>
  )
}

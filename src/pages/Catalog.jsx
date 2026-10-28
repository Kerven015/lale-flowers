import { useEffect, useState } from 'react'
import { Link, useLocation, useSearchParams } from 'react-router-dom'
import CatalogBrowser from '../components/CatalogBrowser'
import ShipPicker from '../components/ShipPicker'
import TrustRow from '../components/TrustRow'
import { useI18n } from '../contexts/I18nContext'
import { OCCASIONS, occasionByKey } from '../data/navigation'
import AnimatedTitle, { TextLoop } from '../motion/AnimatedTitle'
import ReviewsStrip from '../motion/ReviewsStrip'
import { filtersFromParams } from '../utils/catalogFilter'
import { useProducts } from '../store/hooks'
import { usePageTitle } from '../utils/pageTitle'

export default function Catalog({ presetCat = '', home = false }) {
  const { t } = useI18n()
  const { products, catName } = useProducts()
  const [params] = useSearchParams()
  const location = useLocation()

  const [filters, setFilters] = useState(() => filtersFromParams(params, presetCat))
  const [q, setQ] = useState(() => params.get('q') || '')
  const [sort, setSort] = useState('recommended')

  // Every navigation (menu link, "Ählisini gör", ?cat=, ?occasion=, header search)
  // starts fresh from the URL. Plain /catalog therefore always shows every flower.
  useEffect(() => {
    setFilters(filtersFromParams(params, presetCat))
    setQ(params.get('q') || '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.key, presetCat])

  const occasion = occasionByKey(filters.occasion)
  const title = presetCat ? catName(presetCat) : occasion ? t(occasion.label) : home ? t('cat.title') : t('catalog.title')
  usePageTitle(home ? '' : title)
  const crumbs = presetCat || occasion
    ? [{ label: t('nav.catalog'), to: '/catalog' }, { label: title }]
    : [{ label: t('nav.catalog') }]

  return (
    <section className="listing">
      <div className="container">
        {!home && (
          <nav className="crumbs listing-crumbs" aria-label={t('a11y.breadcrumb')}>
            <Link to="/">{t('nav.home')}</Link>
            {crumbs.map((c, i) => (
              <span key={i} className="crumb">
                <span className="sep">›</span>
                {c.to ? <Link to={c.to}>{c.label}</Link> : <span aria-current="page">{c.label}</span>}
              </span>
            ))}
          </nav>
        )}

        <div className="listing-title">
          <AnimatedTitle text={title} />
        </div>
        {home && (
          <TextLoop
            lead={t('loop.lead')}
            items={OCCASIONS.filter((o) => ['birthday', 'love', 'wedding', 'thanks'].includes(o.key)).map((o) => ({ label: t(o.label), to: `/catalog?occasion=${o.key}` }))}
          />
        )}

        {!home && <ShipPicker />}
        {!home && <TrustRow />}

        <CatalogBrowser
          products={products}
          filters={filters}
          setFilters={setFilters}
          query={q}
          setQuery={setQ}
          sort={sort}
          setSort={setSort}
          resetKey={`${location.key}|${presetCat}`}
        />

        {home && (
          <div className="home-after">
            <ShipPicker />
            <TrustRow />
            <ReviewsStrip />
          </div>
        )}
      </div>
    </section>
  )
}

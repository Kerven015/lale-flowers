import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import PageHead from '../components/PageHead'
import { useI18n } from '../contexts/I18nContext'
import { occasionByKey } from '../data/navigation'
import { filterProducts } from '../utils/catalogFilter'
import Icon from '../components/Icons'
import { useProducts } from '../store/hooks'

// [link, icon, title key, filter used to count the products]
const ITEMS = [
  ['/roses', 'flower', 'cat.roses', { cats: ['roses'] }],
  ['/tulips', 'blossom', 'cat.tulips', { cats: ['tulips'] }],
  ['/bouquets', 'sparkles', 'cat.bouquets', { cats: ['bouquets'] }],
  ['/gifts', 'gift', 'cat.gifts', { cats: ['gifts'] }],
  ['/catalog?cat=plants', 'sprout', 'cat.plants', { cats: ['plants'] }],
  ['/catalog?occasion=love', 'heart', 'cat.romantic', { occasion: 'love' }],
]

export default function Categories() {
  const { t } = useI18n()
  const { products } = useProducts()
  // Counts follow the real catalog, so they stay right after admin changes.
  const counts = useMemo(() => ITEMS.map(([, , , f]) => {
    const occ = f.occasion ? occasionByKey(f.occasion) : null
    return filterProducts(products, f, '', { occasionIds: occ ? occ.ids : null }).length
  }), [products])
  return (
    <>
      <PageHead title={t('cat.title')} sub={t('cat.sub')} crumbs={[{ label: t('cat.eyebrow') }]} />
      <section className="section">
        <div className="container">
          <div className="cat-grid">
            {ITEMS.map(([href, icon, key], i) => (
              <Link className="cat-card" key={key} to={href}>
                <span className="ci"><Icon name={icon} size={24} /></span>
                <h3>{t(key)}</h3>
                <span>{counts[i]} {t('cat.items')}</span>
                <span className="arrow">{t('cat.view')} →</span>
              </Link>
            ))}
          </div>
        </div>
      </section>
    </>
  )
}

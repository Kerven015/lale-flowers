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
  const { products, addedCategories, catName } = useProducts()
  // built-in cards, then the categories the admin added
  const items = useMemo(() => [
    ...ITEMS.map(([href, icon, key, f]) => ({ href, icon, label: t(key), f })),
    ...addedCategories.map((c) => ({ href: `/category/${c.key}`, icon: 'tag', label: catName(c.key), f: { cats: [c.key] } })),
  ], [addedCategories, catName, t])
  // Counts follow the real catalog, so they stay right after admin changes.
  const counts = useMemo(() => items.map(({ f }) => {
    const occ = f.occasion ? occasionByKey(f.occasion) : null
    return filterProducts(products, f, '', { occasionIds: occ ? occ.ids : null }).length
  }), [products, items])
  return (
    <>
      <PageHead title={t('cat.title')} sub={t('cat.sub')} crumbs={[{ label: t('cat.eyebrow') }]} />
      <section className="section">
        <div className="container">
          <div className="cat-grid">
            {items.map(({ href, icon, label }, i) => (
              <Link className="cat-card" key={href} to={href}>
                <span className="ci"><Icon name={icon} size={24} /></span>
                <h3>{label}</h3>
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

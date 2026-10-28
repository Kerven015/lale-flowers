import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import PageHead from '../components/PageHead'
import { useI18n } from '../contexts/I18nContext'
import { categoryIcon, occasionPath } from '../data/navigation'
import { filterProducts } from '../utils/catalogFilter'
import Icon from '../components/Icons'
import { useFlowerTypeLinks, useOccasions, useProducts } from '../store/hooks'

export default function Categories() {
  const { t } = useI18n()
  const { products } = useProducts()
  const types = useFlowerTypeLinks()
  // every category (admin's order and names), then the romantic bouquets
  const { occasionName } = useOccasions()
  const items = useMemo(() => [
    ...types.map((c) => ({ href: c.to, icon: categoryIcon(c.key), label: c.label, f: { cats: [c.key] } })),
    // the romantic bouquets, while the "love" occasion exists
    ...(occasionName('love') ? [{ href: occasionPath('love'), icon: 'heart', label: t('cat.romantic'), f: { occasion: 'love' } }] : []),
  ], [types, t, occasionName])
  // Counts follow the real catalog, so they stay right after admin changes.
  const counts = useMemo(
    () => items.map(({ f }) => filterProducts(products, f, '', { occasionIds: f.occasion ? [] : null }).length),
    [products, items],
  )
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

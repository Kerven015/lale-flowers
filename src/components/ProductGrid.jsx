import { useState } from 'react'
import { useStaggerReveal } from '../motion/motion'
import { useI18n } from '../contexts/I18nContext'
import ProductCard from './ProductCard'
import Icon from './Icons'
import { useProducts } from '../store/hooks'

// Grey placeholder cards while the flowers load for the first time.
function Skeleton({ count = 8 }) {
  const { t } = useI18n()
  return (
    <div className="product-grid" aria-busy="true" aria-label={t('loading.products')}>
      {Array.from({ length: count }, (_, i) => (
        <div className="product-card skel" key={i} aria-hidden="true">
          <div className="product-media" />
          <div className="product-body"><span className="skel-line" /><span className="skel-line short" /><span className="skel-line price" /></div>
        </div>
      ))}
    </div>
  )
}

// renderCard (optional) draws each product differently, e.g. the admin's cards.
export default function ProductGrid({ products, id, renderCard }) {
  const { t } = useI18n()
  const { status, retry } = useProducts()
  const [box, setBox] = useState(null)
  useStaggerReveal(box)
  if (!products?.length) {
    if (status === 'loading') return <Skeleton />
    if (status === 'error') {
      return (
        <div className="empty-state" style={{ gridColumn: '1 / -1' }} role="alert">
          <div className="es-icon"><Icon name="alert" size={32} /></div>
          <h3>{t('loading.error')}</h3>
          <p>{t('err.network')}</p>
          <button type="button" className="btn btn-primary" onClick={retry}>{t('loading.retry')}</button>
        </div>
      )
    }
    return (
      <div className="empty-state" style={{ gridColumn: '1 / -1' }}>
        <div className="es-icon"><Icon name="search" size={32} /></div>
        <h3>{t('catalog.none')}</h3>
      </div>
    )
  }
  return (
    <div className="product-grid" id={id} ref={setBox}>
      {products.map((p) => (renderCard ? renderCard(p) : <ProductCard key={p.id} product={p} />))}
    </div>
  )
}

import { Link } from 'react-router-dom'
import PageHead from '../components/PageHead'
import ProductGrid from '../components/ProductGrid'
import { useI18n } from '../contexts/I18nContext'
import Icon from '../components/Icons'
import { useCart, useProducts } from '../store/hooks'

export default function Favorites() {
  const { t } = useI18n()
  const { favorites, addMany, notify } = useCart()
  const { get, loading } = useProducts()
  const list = favorites.map((id) => get(id)).filter(Boolean)

  return (
    <>
      <PageHead title={t('fav.title')} sub={t('fav.sub')} crumbs={[{ label: t('fav.title') }]} />
      <section className="section">
        <div className="container">
          {!loading && !!list.length && (
            <div style={{ marginBottom: 24 }}>
              <button className="btn btn-primary" onClick={() => {
                const r = addMany(list.map((p) => p.id))
                if (r) notify('notify.allAdded')
                else if (r === false) notify('prod.out', 'error') // every favourite is sold out
              }}>{t('fav.addAll')}</button>
            </div>
          )}
          {loading ? <ProductGrid products={[]} /> : !list.length ? (
            <div className="empty-state">
              <div className="es-icon"><Icon name="heart" size={32} /></div>
              <h3>{t('fav.empty')}</h3>
              <p>{t('fav.emptyText')}</p>
              <Link className="btn btn-primary" to="/catalog">{t('fav.emptyBtn')}</Link>
            </div>
          ) : <ProductGrid products={list} />}
        </div>
      </section>
    </>
  )
}

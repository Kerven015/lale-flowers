import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import ProductGrid from '../components/ProductGrid'
import { useI18n } from '../contexts/I18nContext'
import { discountPercent, formatPrice, galleryImages } from '../utils/productHelpers'
import Icon from '../components/Icons'
import { typeKey } from '../utils/productTypes'
import Stars from '../components/Stars'
import ProductGallery from '../components/ProductGallery'
import ProductDescription from '../components/ProductDescription'
import { productDetails } from '../utils/richText'
import { useMagnetic, useSlidingPill } from '../motion/motion'
import { REVIEWS } from '../data/reviews'
import { useCart, useProducts } from '../store/hooks'
import { usePageTitle } from '../utils/pageTitle'

export default function Product() {
  const { id } = useParams()
  const { t, lang } = useI18n()
  const { get, name, typeName, products, status, retry } = useProducts()
  const { add, isFavorite, toggleFavorite, notify } = useCart()
  const navigate = useNavigate()
  const [qty, setQty] = useState(1)
  const [tab, setTab] = useState('delivery')
  const product = get(id)
  usePageTitle(product ? name(product) : '')
  const addBtnRef = useRef(null)
  const tabsRef = useRef(null)
  useMagnetic(addBtnRef, undefined, [product?.id, product?.inStock])
  useSlidingPill(tabsRef, 'button.active', [tab, lang, product?.id])

  // Phones: when the page's own buttons are off screen, a bar with the price
  // and "Add to basket" stays fixed above the bottom menu.
  const actionsRef = useRef(null)
  const [barShown, setBarShown] = useState(false)
  useEffect(() => {
    const el = actionsRef.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver(([entry]) => setBarShown(!entry.isIntersecting), {
      // ignore the part of the screen covered by the bottom menu + bar
      rootMargin: '0px 0px -150px 0px',
    })
    io.observe(el)
    return () => io.disconnect()
  }, [product?.id])

  if (!product && status !== 'ready') {
    return (
      <section className="section">
        <div className="container">
          {status === 'loading'
            ? <p className="muted" role="status" aria-live="polite">{t('loading.products')}</p>
            : (
              <div className="empty-state" role="alert">
                <div className="es-icon"><Icon name="alert" size={32} /></div>
                <h3>{t('loading.error')}</h3>
                <p>{t('err.network')}</p>
                <button type="button" className="btn btn-primary" onClick={retry}>{t('loading.retry')}</button>
              </div>
            )}
        </div>
      </section>
    )
  }

  if (!product) {
    return (
      <section className="section">
        <div className="container">
          <div className="empty-state">
            <div className="es-icon"><Icon name="blossom" size={32} /></div>
            <h3>{t('product.notFound')}</h3>
            <p>{t('product.notFoundText')}</p>
            <Link className="btn btn-primary" to="/catalog">{t('product.backCatalog')}</Link>
          </div>
        </div>
      </section>
    )
  }

  const disc = discountPercent(product)
  const fav = isFavorite(product.id)
  const related = products.filter((p) => typeKey(p) === typeKey(product) && p.id !== product.id).slice(0, 4)

  return (
    <>
      <section className="section">
        <div className="container">
          <div className="product-view">
            <div className="gallery">
              <ProductGallery key={product.id} images={galleryImages(product)} alt={name(product)} />
            </div>
            <div className="pv-info">
              <nav className="crumbs" aria-label={t('a11y.breadcrumb')}>
                <Link to="/">{t('nav.home')}</Link><span>/</span>
                <Link to="/catalog">{t('nav.catalog')}</Link><span>/</span>
                <span>{typeName(product)}</span>
              </nav>
              <h1 className="pv-title">{name(product)}</h1>
              {product.reviews > 0 && (
                <div className="rating">
                  <Stars rating={product.rating} />
                  <span>{Number(product.rating || 0).toFixed(1)} · {product.reviews} {t('prod.reviews')}</span>
                </div>
              )}
              <div className="pv-price">
                <span className="now">{formatPrice(product.price)}</span>
                {product.old ? <span className="old">{formatPrice(product.old)}</span> : null}
                {disc > 0 ? <span className="tag" style={{ position: 'static' }}>-{disc}%</span> : null}
              </div>
              <div className="pv-actions" ref={actionsRef}>
                <div className="qty">
                  <button type="button" aria-label={t('cart.less')} onClick={() => setQty((v) => Math.max(1, v - 1))}>−</button>
                  <input type="number" value={qty} min="1" max="99" aria-label={t('product.qty')} onChange={(e) => setQty(Math.min(99, Math.max(1, +e.target.value || 1)))} />
                  <button type="button" aria-label={t('cart.more')} onClick={() => setQty((v) => Math.min(99, v + 1))}>+</button>
                </div>
                {product.inStock ? (
                  <button ref={addBtnRef} className="btn btn-primary btn-lg" onClick={() => { if (add(product.id, qty)) notify('notify.added') }}>
                    {t('product.addCart')}
                  </button>
                ) : (
                  <button className="btn btn-outline btn-lg" disabled>{t('prod.out')}</button>
                )}
                {product.inStock && (
                  <button className="btn btn-outline btn-lg" onClick={() => { add(product.id, qty); navigate('/checkout') }}>
                    {t('product.buyNow')}
                  </button>
                )}
                <button
                  type="button"
                  className={`fav-btn${fav ? ' active' : ''}`}
                  aria-label={fav ? t('product.inFav') : t('product.addFav')}
                  aria-pressed={fav}
                  title={fav ? t('product.inFav') : t('product.addFav')}
                  style={{ position: 'static', width: 52, height: 52, borderRadius: '50%' }}
                  onClick={() => notify(toggleFavorite(product.id) ? 'notify.favAdded' : 'notify.favRemoved')}
                >
                  <Icon name="heart" size={20} />
                </button>
              </div>
              <div className="pv-meta">
                <div><span>{t('product.sku')}</span><span>LG-{String(product.id).padStart(4, '0')}</span></div>
                <div><span>{t('product.category')}</span><span>{typeName(product)}</span></div>
                <div>
                  <span>{t('product.stock')}</span>
                  <span className={product.inStock ? 'in-stock' : 'out-stock'}>
                    {product.inStock ? t('avail.in') : t('avail.out')}
                  </span>
                </div>
              </div>
            </div>
            <ProductDescription details={productDetails(product, lang)} className="pv-description" />
          </div>
        </div>
      </section>

      <section className="section section-alt">
        <div className="container">
          <div className="tabs" ref={tabsRef}>
            {['delivery', 'reviews'].map((key) => (
              <button key={key} type="button" className={tab === key ? 'active' : ''} onClick={() => setTab(key)}>
                {t(`product.${key}`)}
              </button>
            ))}
          </div>
          {tab === 'delivery' && (
            <div className="info-card">
              <p>{t('delivery.infoText')}</p>
              <Link className="btn btn-outline" to="/delivery">{t('delivery.title')}</Link>
            </div>
          )}
          {tab === 'reviews' && (
            product.reviews > 0 ? (
              <>
                {REVIEWS.map((r) => (
                  <article className="review" key={r.name}>
                    <div className="review-head"><span className="avatar">{r.name[0]}</span><div><strong>{r.name}</strong><div className="rating"><Stars rating={r.rating || 5} size={13} /></div></div></div>
                    <p className="muted">{r.text}</p>
                  </article>
                ))}
              </>
            ) : (
              <p className="muted">{t('product.noReviews')}</p>
            )
          )}
        </div>
      </section>

      {related.length > 0 && (
        <section className="section">
          <div className="container">
            <div className="section-head"><h2>{t('product.related')}</h2></div>
            <ProductGrid products={related} />
          </div>
        </section>
      )}

      <div className={`pv-buybar${barShown ? ' show' : ''}`} aria-hidden={!barShown}>
        <div className="pv-buybar-price">
          <span className="now">{formatPrice(product.price)}</span>
          {product.old ? <span className="old">{formatPrice(product.old)}</span> : null}
        </div>
        {product.inStock ? (
          <button
            className="btn btn-primary"
            type="button"
            tabIndex={barShown ? 0 : -1}
            onClick={() => { if (add(product.id, qty)) notify('notify.added') }}
          >
            <Icon name="cart" size={18} />{t('product.addCart')}{qty > 1 ? ` (${qty})` : ''}
          </button>
        ) : (
          <button className="btn btn-outline" type="button" disabled>{t('prod.out')}</button>
        )}
      </div>
    </>
  )
}

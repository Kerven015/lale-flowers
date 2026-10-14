import { Link, useNavigate } from 'react-router-dom'
import { useDelivery } from '../contexts/DeliveryContext'
import { useI18n } from '../contexts/I18nContext'
import { discountPercent, formatPrice, productImage } from '../utils/productHelpers'
import Icon from './Icons'
import Stars from './Stars'
import { useQuickView } from '../motion/QuickView'
import { useCart, useProducts } from '../store/hooks'

// admin (optional) turns the card into the admin panel's version: edit and
// delete buttons instead of the heart, no "add to basket", and a selection
// mode for deleting several products at once.
//   { onEdit, onDelete, selecting, selected, onToggleSelect, removing, labels: { edit, del, select } }
export default function ProductCard({ product, admin }) {
  const { t } = useI18n()
  const { name, typeName } = useProducts()
  const { add, isFavorite, toggleFavorite, notify } = useCart()
  const { isSameDay } = useDelivery()
  const fav = isFavorite(product.id)
  const disc = discountPercent(product)
  const qv = useQuickView()
  const navigate = useNavigate()
  // opens the quick preview; pages without it go straight to the product page
  const openQuick = (e) => {
    const img = e.currentTarget.closest('.product-media')?.querySelector('img')
    if (qv) qv.open(product, img)
    else navigate(`/product/${product.id}`)
  }

  let tag = null
  if (!product.inStock) tag = <span className="tag tag-out">{t('prod.out')}</span>
  else if (disc > 0) tag = <span className="tag">-{disc}%</span>
  else if (product.isNew) tag = <span className="tag tag-new">{t('prod.new')}</span>

  const selecting = !!admin?.selecting
  const cardClass = [
    'product-card',
    admin && 'adm-card',
    selecting && 'is-selecting',
    admin?.selected && 'is-selected',
    admin?.removing && 'is-removing',
  ].filter(Boolean).join(' ')
  // In selection mode the whole card is one big checkbox.
  const selectProps = selecting ? {
    role: 'checkbox',
    'aria-checked': !!admin.selected,
    'aria-label': `${admin.labels?.select || ''} ${name(product)}`.trim(),
    tabIndex: 0,
    onClickCapture: (e) => { e.preventDefault(); e.stopPropagation(); admin.onToggleSelect() },
    onKeyDown: (e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); admin.onToggleSelect() } },
  } : {}

  return (
    <article className={cardClass} data-id={product.id} {...selectProps}>
      <div className="product-media">
        <img
          src={productImage(product)}
          alt={name(product)}
          loading="lazy"
          onClick={admin ? undefined : openQuick}
        />
        {tag}
        {admin ? (
          <>
            {selecting ? (
              <span className={`adm-check${admin.selected ? ' on' : ''}`} aria-hidden="true">
                {admin.selected && <Icon name="check" size={16} />}
              </span>
            ) : (
              <div className="adm-actions">
                <button type="button" className="adm-act" onClick={admin.onEdit} aria-label={`${admin.labels?.edit} – ${name(product)}`} title={admin.labels?.edit}>
                  <Icon name="edit" size={17} />
                </button>
                <button type="button" className="adm-act adm-del" onClick={admin.onDelete} aria-label={`${admin.labels?.del} – ${name(product)}`} title={admin.labels?.del}>
                  <Icon name="trash" size={17} />
                </button>
              </div>
            )}
          </>
        ) : (
        <button
          className={`fav-btn${fav ? ' active' : ''}`}
          onClick={() => {
            const added = toggleFavorite(product.id)
            notify(added ? 'notify.favAdded' : 'notify.favRemoved')
          }}
          aria-label={`${t('a11y.favorites')} – ${name(product)}`}
          aria-pressed={fav}
        >
          <Icon name="heart" size={18} />
        </button>
        )}
        {!admin && product.inStock && (
          <button
            type="button"
            className="mob-add"
            aria-label={t('prod.add')}
            title={t('prod.add')}
            onClick={() => { if (add(product.id, 1)) notify('notify.added') }}
          >
            <Icon name="cart" size={18} />
          </button>
        )}
        {!admin && (
        <div className="quick">
          {product.inStock ? (
            <button
              className="btn btn-primary"
              onClick={() => {
                if (add(product.id, 1)) notify('notify.added')
              }}
            >
              {t('prod.add')}
            </button>
          ) : (
            <button className="btn btn-outline" disabled>{t('prod.out')}</button>
          )}
          <button type="button" className="btn btn-ghost" aria-haspopup="dialog" onClick={openQuick}>{t('prod.view')}</button>
        </div>
        )}
      </div>
      <div className="product-body">
        <span className="product-cat">{typeName(product)}</span>
        <h3 className="product-name">
          <Link to={`/product/${product.id}`}>{name(product)}</Link>
        </h3>
        {product.reviews > 0 && (
          <div className="rating">
            <Stars rating={product.rating} />
            <span>{Number(product.rating || 0).toFixed(1)} ({product.reviews}<span className="r-word"> {t('prod.reviews')}</span>)</span>
          </div>
        )}
        {/* price on the left, "Delivery today" on the right, one row */}
        <div className="price-row">
          <div className="price">
            <span className="now">{formatPrice(product.price)}</span>
            {product.old ? <span className="old">{formatPrice(product.old)}</span> : null}
          </div>
          {isSameDay(product) && (
            <span className="sameday-badge" title={t('card.sameDay')} aria-label={t('card.sameDay')}>
              <Icon name="truck" size={15} /><span className="sd-text">{t('card.today')}</span>
            </span>
          )}
        </div>
      </div>
    </article>
  )
}

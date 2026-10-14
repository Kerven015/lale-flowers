// 2 · Quick view: tapping a product photo (or "View") grows the photo into a
// large preview with price, description and "Add to basket", and shrinks it
// back into the card when closed (✕, Esc, tap outside).
import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link, useLocation } from 'react-router-dom'
import { useDelivery } from '../contexts/DeliveryContext'
import { useI18n } from '../contexts/I18nContext'
import { discountPercent, formatPrice, productImage } from '../utils/productHelpers'
import { htmlToText, productDetails } from '../utils/richText'
import Icon from '../components/Icons'
import Stars from '../components/Stars'
import { prefersReducedMotion, useMagnetic } from './motion'
import { useCart, useProducts } from '../store/hooks'

const QuickViewContext = createContext(null)
export const useQuickView = () => useContext(QuickViewContext)

export function QuickViewProvider({ children }) {
  const [state, setState] = useState(null) // { product, from: HTMLElement }
  const open = useCallback((product, from) => setState({ product, from }), [])
  const close = useCallback(() => setState(null), [])
  // leaving the page (e.g. the Back button) closes the preview
  const { pathname } = useLocation()
  useEffect(() => { setState(null) }, [pathname])
  return (
    <QuickViewContext.Provider value={{ open }}>
      {children}
      {state && <QuickViewDialog key={state.product.id} product={state.product} from={state.from} onClosed={close} />}
    </QuickViewContext.Provider>
  )
}

const EASE = 'cubic-bezier(0.4, 0, 0.2, 1)'

function QuickViewDialog({ product, from, onClosed }) {
  const { t, lang } = useI18n()
  const { name, typeName } = useProducts()
  const { add, isFavorite, toggleFavorite, notify } = useCart()
  const { isSameDay } = useDelivery()
  const [shown, setShown] = useState(false)
  const rootRef = useRef(null)
  const panelRef = useRef(null)
  const imgRef = useRef(null)
  const closeRef = useRef(null)
  const addRef = useRef(null)
  const geo = useRef(null)
  const closing = useRef(false)
  useMagnetic(addRef)

  const disc = discountPercent(product)
  const fav = isFavorite(product.id)
  const text = htmlToText(productDetails(product, lang).html)

  // The panel starts shrunk onto the card's photo (only its photo part
  // visible) and grows into place.
  const animate = useCallback((direction) => {
    const panel = panelRef.current
    const img = imgRef.current
    const src = from && from.isConnected ? from.getBoundingClientRect() : null
    if (!panel || !img || prefersReducedMotion() || !panel.animate) return Promise.resolve()
    if (!src || !src.width) {
      return panel.animate([{ opacity: 0, transform: 'scale(.96)' }, { opacity: 1, transform: 'none' }],
        { duration: 260, easing: EASE, direction, fill: 'both' }).finished
    }
    const pa = panel.getBoundingClientRect()
    const b = img.getBoundingClientRect()
    const ox = b.left - pa.left
    const oy = b.top - pa.top
    const sx = src.width / b.width
    const sy = src.height / b.height
    const tx = src.left - pa.left - ox * sx
    const ty = src.top - pa.top - oy * sy
    panel.style.transformOrigin = '0 0'
    geo.current = true
    return panel.animate([
      { transform: `translate(${tx}px, ${ty}px) scale(${sx}, ${sy})`, clipPath: `inset(${oy}px ${pa.width - ox - b.width}px ${pa.height - oy - b.height}px ${ox}px round ${16 / Math.min(sx, sy)}px)` },
      { transform: 'none', clipPath: 'inset(0px 0px 0px 0px round 24px)' },
    ], { duration: 460, easing: EASE, direction, fill: 'both' }).finished
  }, [from])

  useLayoutEffect(() => {
    if (from) from.style.visibility = 'hidden'
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    requestAnimationFrame(() => setShown(true))
    animate('normal').then(() => {
      if (panelRef.current) { panelRef.current.getAnimations?.().forEach((a) => a.cancel()); panelRef.current.style.transformOrigin = '' }
    })
    // focus moves into the preview (Tab then reaches ✕, buttons, link)
    panelRef.current?.focus({ preventScroll: true })
    return () => {
      document.body.style.overflow = overflow
      if (from) from.style.visibility = ''
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const close = useCallback(async (immediate) => {
    if (closing.current) return
    closing.current = true
    setShown(false)
    if (!immediate) await animate('reverse').catch(() => {})
    if (from) from.style.visibility = ''
    onClosed()
    if (!immediate) {
      const focusTarget = from?.closest('.product-card')?.querySelector('a, button')
      focusTarget?.focus({ preventScroll: true })
    }
  }, [animate, from, onClosed])

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') { e.preventDefault(); close() }
      if (e.key === 'Tab') {
        const els = [...(rootRef.current?.querySelectorAll('a[href], button:not([disabled])') || [])]
        if (!els.length) return
        const i = els.indexOf(document.activeElement)
        if (e.shiftKey && (i <= 0)) { e.preventDefault(); els[els.length - 1].focus() }
        else if (!e.shiftKey && i === els.length - 1) { e.preventDefault(); els[0].focus() }
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [close])

  return createPortal(
    <div className={`qv${shown ? ' open' : ''}`} ref={rootRef}>
      <div className="qv-scrim" onClick={() => close()} />
      <div className="qv-panel" ref={panelRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="qv-title">
        <button ref={closeRef} type="button" className="qv-close" aria-label={t('gallery.close')} onClick={() => close()}>
          <Icon name="close" size={18} />
        </button>
        <div className="qv-img" ref={imgRef}>
          <img src={productImage(product)} alt={name(product)} />
        </div>
        <div className="qv-body">
          <span className="product-cat">{typeName(product)}</span>
          <h2 id="qv-title" className="qv-title">{name(product)}</h2>
          {product.reviews > 0 && (
            <div className="rating">
              <Stars rating={product.rating} />
              <span>{Number(product.rating || 0).toFixed(1)} · {product.reviews} {t('prod.reviews')}</span>
            </div>
          )}
          <div className="qv-price">
            <span className="now">{formatPrice(product.price)}</span>
            {product.old ? <span className="old">{formatPrice(product.old)}</span> : null}
            {disc > 0 ? <span className="tag">-{disc}%</span> : null}
          </div>
          {isSameDay(product) && <span className="sameday-badge qv-sameday"><Icon name="truck" size={15} />{t('card.sameDay')}</span>}
          {text && <p className="qv-desc">{text}</p>}
          <div className="qv-actions">
            {product.inStock ? (
              <button ref={addRef} type="button" className="btn btn-primary" onClick={() => { if (add(product.id, 1)) notify('notify.added') }}>
                <Icon name="cart" size={18} />{t('prod.add')}
              </button>
            ) : (
              <button type="button" className="btn btn-outline" disabled>{t('prod.out')}</button>
            )}
            <button
              type="button"
              className={`fav-btn qv-fav${fav ? ' active' : ''}`}
              aria-label={t('a11y.favorites')}
              aria-pressed={fav}
              onClick={() => notify(toggleFavorite(product.id) ? 'notify.favAdded' : 'notify.favRemoved')}
            >
              <Icon name="heart" size={20} />
            </button>
          </div>
          <Link className="qv-more" to={`/product/${product.id}`} onClick={() => close(true)}>
            {t('qv.details')} <Icon name="next" size={16} />
          </Link>
        </div>
      </div>
    </div>,
    document.body,
  )
}

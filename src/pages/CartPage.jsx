import { Link } from 'react-router-dom'
import PageHead from '../components/PageHead'
import { useI18n } from '../contexts/I18nContext'
import { fewLeft, fill, formatPrice, productImage } from '../utils/productHelpers'
import { maxQtyFor } from '../store/cartSlice'
import Icon from '../components/Icons'
import RollingNumber from '../motion/RollingNumber'
import { useCart, useProducts } from '../store/hooks'

export default function CartPage() {
  const { t } = useI18n()
  const { cart, orderable, soldOut, setQty, remove, clear, subtotal, delivery, total, notify } = useCart()
  const { get, name, typeName, loading } = useProducts()

  return (
    <>
      <PageHead title={t('cart.title')} sub={t('cart.sub')} crumbs={[{ label: t('cart.title') }]} />
      <section className="section">
        <div className="container">
          <div className="cart-layout">
            <div>
              {loading ? (
                <p className="muted" role="status" aria-live="polite">{t('loading.products')}</p>
              ) : !cart.length ? (
                <div className="empty-state">
                  <div className="es-icon"><Icon name="cart" size={32} /></div>
                  <h3>{t('cart.empty')}</h3>
                  <p>{t('cart.emptyText')}</p>
                  <Link className="btn btn-primary" to="/catalog">{t('cart.emptyBtn')}</Link>
                </div>
              ) : cart.map((item) => {
                const p = get(item.id)
                if (!p) return null
                const out = !p.inStock
                return (
                  <div className={`cart-row${out ? ' is-out' : ''}`} key={p.id}>
                    <img src={productImage(p)} alt={name(p)} />
                    <div className="cr-info">
                      <div className="cr-name">{name(p)}</div>
                      <div className="cr-cat">{out ? <span className="out-stock">{t('prod.out')}</span> : typeName(p)}</div>
                      {!out && fewLeft(p) && <div className="stock-left">{fill(t('stock.left'), { n: fewLeft(p) })}</div>}
                    </div>
                    <div className="qty">
                      <button type="button" aria-label={t('cart.less')} disabled={out} onClick={() => setQty(p.id, item.qty - 1)}>−</button>
                      <input type="number" inputMode="numeric" value={item.qty} min="1" max={maxQtyFor(p)} disabled={out} aria-label={t('cart.qty')} onChange={(e) => setQty(p.id, Math.max(1, +e.target.value || 1))} />
                      <button type="button" aria-label={t('cart.more')} disabled={out || item.qty >= maxQtyFor(p)} onClick={() => setQty(p.id, item.qty + 1)}>+</button>
                    </div>
                    <div className="cr-price">{out ? '—' : formatPrice(p.price * item.qty)}</div>
                    <button className="remove" onClick={() => { remove(p.id); notify('notify.removed') }} aria-label={t('cart.remove')}><Icon name="close" size={16} /></button>
                  </div>
                )
              })}
              {!loading && soldOut.length > 0 && (
                <p className="form-error" role="status" style={{ marginTop: 12 }}>{t('cart.soldOutNote')}</p>
              )}
              {!!cart.length && (
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 18 }}>
                  <button className="btn btn-outline" onClick={() => { clear(); notify('notify.cleared') }}>{t('cart.clear')}</button>
                  <Link className="btn btn-ghost" to="/catalog">{t('cart.continue')}</Link>
                </div>
              )}
            </div>
            <aside className="summary">
              <h3>{t('checkout.summary')}</h3>
              <div className="summary-row"><span>{t('cart.subtotal')}</span><span><RollingNumber value={subtotal} suffix=" TMT" /></span></div>
              <div className="summary-row"><span>{t('cart.delivery')}</span><span>{delivery === 0 ? t('cart.free') : formatPrice(delivery)}</span></div>
              <div className="summary-row total"><span>{t('cart.grand')}</span><span><RollingNumber value={total} suffix=" TMT" /></span></div>
              {orderable.length > 0 ? (
                <Link className="btn btn-primary btn-block btn-lg" to="/checkout" style={{ marginTop: 18 }}>{t('cart.checkout')}</Link>
              ) : (
                <button type="button" className="btn btn-primary btn-block btn-lg" style={{ marginTop: 18 }} disabled>{t('cart.checkout')}</button>
              )}
            </aside>
          </div>
        </div>
      </section>
    </>
  )
}

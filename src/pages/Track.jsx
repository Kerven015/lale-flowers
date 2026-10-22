import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import PageHead from '../components/PageHead'
import { useI18n } from '../contexts/I18nContext'
import { StatusSteps, lineName, orderDate } from '../components/OrderStatus'
import { formatPrice } from '../utils/productHelpers'
import { api, errorMessage } from '../api'

export default function Track() {
  const { t, lang } = useI18n()
  const [params] = useSearchParams()
  const [code, setCode] = useState(() => params.get('code') || '')
  const [result, setResult] = useState(undefined) // undefined = not searched, null = not found
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const search = useCallback(async (value) => {
    const wanted = value.trim().toUpperCase().replace(/\s+/g, '')
    if (!wanted) { setResult(undefined); setError(t('form.required')); return }
    setBusy(true)
    setError('')
    try {
      const data = await api(`/api/orders/${encodeURIComponent(wanted)}`)
      setResult(data.order)
    } catch (err) {
      if (err.status === 404) setResult(null)
      else { setResult(undefined); setError(errorMessage(t, err)) }
    } finally {
      setBusy(false)
    }
  }, [t])

  // opened from Profile with ?code=LG-...
  useEffect(() => {
    const c = params.get('code')
    if (c) { setCode(c); search(c) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params])

  return (
    <>
      <PageHead title={t('track.title')} sub={t('track.sub')} crumbs={[{ label: t('track.title') }]} />
      <section className="section">
        <div className="container" style={{ maxWidth: 640 }}>
          <form className="summary track-form" style={{ position: 'static' }} onSubmit={(e) => { e.preventDefault(); search(code) }} noValidate>
            <input
              className="field"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder={t('track.ph')}
              aria-label={t('track.ph')}
              autoCapitalize="characters"
              autoComplete="off"
              spellCheck={false}
              maxLength={20}
            />
            <button className="btn btn-primary" type="submit" disabled={busy}>{busy ? t('form.sending') : t('track.btn')}</button>
          </form>
          {error && <p className="form-error" role="alert" style={{ marginTop: 18 }}>{error}</p>}
          {result === null && <p className="muted" role="status" style={{ marginTop: 18 }}>{t('track.none')}</p>}
          {result && (
            <div className="summary" style={{ position: 'static', marginTop: 20 }} aria-live="polite">
              <h3>{t('checkout.orderNo')}: {result.code}</h3>
              <StatusSteps status={result.status} />
              <div className="summary-row"><span>{t('profile.orderDate')}</span><span>{orderDate(result.createdAt, lang)}</span></div>
              <div className="summary-row"><span>{t('checkout.delivery')}</span><span>{t(result.deliveryType === 'pickup' ? 'checkout.pickup' : 'checkout.deliveryHome')}</span></div>
              <div className="summary-row"><span>{t('when.title')}</span><span>{result.deliveryDate
                ? `${new Date(`${result.deliveryDate}T00:00:00Z`).toLocaleDateString(lang === 'tm' ? 'tk' : lang, { day: 'numeric', month: 'long', timeZone: 'UTC' })}, ${result.deliverySlot}`
                : t('when.asap')}</span></div>
              {result.items.map((i, k) => (
                <div className="summary-row" key={k}><span>{lineName(i, lang)} × {i.qty}</span><span>{formatPrice(i.price * i.qty)}</span></div>
              ))}
              {result.discount > 0 && <div className="summary-row discount-row"><span>{t('disc.saved')}</span><span>−{formatPrice(result.discount)}</span></div>}
              <div className="summary-row"><span>{t('cart.delivery')}</span><span>{result.deliveryFee === 0 ? t('cart.free') : formatPrice(result.deliveryFee)}</span></div>
              <div className="summary-row total"><span>{t('cart.grand')}</span><span>{formatPrice(result.total)}</span></div>
            </div>
          )}
        </div>
      </section>
    </>
  )
}

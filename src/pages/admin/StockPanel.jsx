// Admin flower form: change the stock (flowers received, wilted / damaged,
// counting correction) and see its history (orders, cancellations, changes).
import { useCallback, useEffect, useState } from 'react'
import { useI18n } from '../../contexts/I18nContext'
import { useToast } from '../../contexts/ToastContext'
import { api, errorMessage } from '../../api'
import { orderDate } from '../../components/OrderStatus'

const REASONS = ['received', 'damaged', 'correction']

export default function StockPanel({ product, L, onChanged, onSessionLost }) {
  const { t, lang } = useI18n()
  const { toast } = useToast()
  const [reason, setReason] = useState('received')
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [history, setHistory] = useState(null)

  const loadHistory = useCallback(async () => {
    try { setHistory((await api(`/api/admin/products/${product.id}/stock`)).movements) } catch { setHistory([]) }
  }, [product.id])
  useEffect(() => { loadHistory() }, [loadHistory])

  async function submit() {
    const n = Math.abs(parseInt(amount, 10))
    if (!n) { toast(L.eStock, 'error'); return }
    // received adds, damaged takes away; a correction can be either (sign typed)
    const change = reason === 'received' ? n : reason === 'damaged' ? -n : parseInt(amount, 10)
    setBusy(true)
    try {
      const { product: p } = await api(`/api/admin/products/${product.id}/stock`, { method: 'POST', body: { change, reason, note } })
      setAmount('')
      setNote('')
      toast(L.stockSaved.replace('{n}', p.stock))
      onChanged(p.stock)
      loadHistory()
    } catch (err) {
      if (err.status === 401) onSessionLost()
      else toast(err.code === 'not_enough_stock' ? L.stockBelowZero : err.code === 'not_counted' ? L.stockNotCountedErr : errorMessage(t, err), 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <fieldset className="de-section stock-panel">
      <legend>{L.stockAdjust}</legend>
      <p className="muted" style={{ margin: '0 0 10px' }}>
        {product.stock === null || product.stock === undefined ? L.stockNotCounted : L.stockN.replace('{n}', product.stock)}
      </p>
      <div className="stock-adjust">
        <select className="field" aria-label={L.stockReason} value={reason} onChange={(e) => setReason(e.target.value)}>
          {REASONS.map((r) => <option key={r} value={r}>{L[`reason_${r}`]}</option>)}
        </select>
        <input
          className="field" type="number" inputMode="numeric" step="1" aria-label={L.stockAmount}
          placeholder={reason === 'correction' ? '+5 / -2' : '5'} value={amount} onChange={(e) => setAmount(e.target.value)}
        />
        <input className="field" maxLength={300} aria-label={L.stockNote} placeholder={L.stockNote} value={note} onChange={(e) => setNote(e.target.value)} />
        <button type="button" className="btn btn-outline" disabled={busy || !amount} onClick={submit}>{L.stockApply}</button>
      </div>
      {history && history.length > 0 && (
        <details className="stock-history">
          <summary>{L.stockHistory} ({history.length})</summary>
          <ul>
            {history.map((m) => (
              <li key={m.id}>
                <span className={m.change < 0 ? 'neg' : 'pos'}>{m.change > 0 ? '+' : ''}{m.change}</span>
                <span>{L[`reason_${m.reason}`] || m.reason}{m.orderCode ? ` · ${m.orderCode}` : ''}{m.note ? ` · ${m.note}` : ''}</span>
                <span className="muted">→ {m.stockAfter ?? '—'} · {orderDate(m.createdAt, lang, true)}{m.admin ? ` · ${m.admin}` : ''}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </fieldset>
  )
}

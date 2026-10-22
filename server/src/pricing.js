// What an order costs: flower prices from the database, delivery from the
// shop settings, and at most one discount (a code typed at checkout or the
// first-order discount, whichever takes off more). Also checks stock.
// Used by placing an order and by the checkout preview (/api/orders/quote).
import { LANGS } from './config.js'
import { HttpError } from './http.js'
import { deliveryFee, getShopSettings } from './settings.js'

export const CODE_RE = /^[A-Z0-9_-]{3,30}$/
export const normalizeCode = (v) => String(v ?? '').trim().toUpperCase()

export function discountFor(kind, value, subtotal) {
  const off = kind === 'percent' ? Math.round((subtotal * value) / 100) : value
  return Math.max(0, Math.min(subtotal, off))
}

// A customer's first order = they have no order that was not cancelled.
export async function isFirstOrder(db, customerId) {
  if (!customerId) return false
  const { rows } = await db.query(`SELECT 1 FROM orders WHERE customer_id = $1 AND status <> 'cancelled' LIMIT 1`, [customerId])
  return !rows.length
}

// The usable code row, or throws a validation error saying why not
// (fields.discountCode = not_found | expired | not_started | used_up | min_total | first_order | login).
async function usableCode(db, code, { subtotal, customerId, lock }) {
  const why = (reason, extra = {}) => new HttpError(400, 'validation', { fields: { discountCode: reason }, ...extra })
  if (!CODE_RE.test(code)) throw why('not_found')
  const { rows } = await db.query(
    `SELECT * FROM discount_codes WHERE upper(code) = $1 AND active ${lock ? 'FOR UPDATE' : ''}`,
    [code],
  )
  const c = rows[0]
  if (!c) throw why('not_found')
  const now = Date.now()
  if (c.starts_at && new Date(c.starts_at).getTime() > now) throw why('not_started')
  if (c.ends_at && new Date(c.ends_at).getTime() <= now) throw why('expired')
  if (c.max_uses !== null && c.used_count >= c.max_uses) throw why('used_up')
  if (subtotal < c.min_total) throw why('min_total', { minTotal: c.min_total })
  if (c.first_order_only) {
    if (!customerId) throw why('login')
    if (!(await isFirstOrder(db, customerId))) throw why('first_order')
  }
  return c
}

// qtyById: Map(productId -> qty). lock = true while placing the order (rows
// stay locked until the transaction ends, so stock and code uses are exact).
export async function priceOrder(db, { qtyById, deliveryType, discountCode, customerId, lock = false }) {
  const settings = await getShopSettings()
  const ids = [...qtyById.keys()]
  const { rows: products } = await db.query(
    `SELECT id, price, in_stock, stock, i18n FROM products WHERE id = ANY($1::int[]) AND deleted_at IS NULL
     ${lock ? 'ORDER BY id FOR UPDATE' : ''}`,
    [ids],
  )
  const byId = new Map(products.map((p) => [p.id, p]))
  const missing = ids.filter((id) => !byId.has(id))
  const soldOut = ids.filter((id) => byId.has(id) && (!byId.get(id).in_stock || byId.get(id).stock === 0))
  if (missing.length || soldOut.length) throw new HttpError(409, 'unavailable', { productIds: [...missing, ...soldOut] })
  const short = ids.filter((id) => byId.get(id).stock !== null && qtyById.get(id) > byId.get(id).stock)
  if (short.length) throw new HttpError(409, 'not_enough_stock', { items: short.map((id) => ({ id, left: byId.get(id).stock })) })

  const lines = ids.map((id) => {
    const p = byId.get(id)
    return { id, qty: qtyById.get(id), price: p.price, stock: p.stock, names: Object.fromEntries(LANGS.map((l) => [l, p.i18n?.[l]?.name || p.i18n?.tm?.name || ''])) }
  })
  const subtotal = lines.reduce((s, l) => s + l.price * l.qty, 0)
  const fee = deliveryFee(settings, subtotal, deliveryType)

  // the discount: the larger of the typed code and the first-order discount
  let best = { amount: 0, source: '', code: '', row: null }
  const code = normalizeCode(discountCode)
  if (code) {
    const row = await usableCode(db, code, { subtotal, customerId, lock })
    best = { amount: discountFor(row.kind, row.value, subtotal), source: 'code', code: row.code.toUpperCase(), row }
  }
  if (settings.firstOrderDiscount > 0 && (await isFirstOrder(db, customerId))) {
    const amount = discountFor('percent', settings.firstOrderDiscount, subtotal)
    if (amount > best.amount) best = { amount, source: 'first_order', code: '', row: null }
  }
  return {
    lines,
    subtotal,
    deliveryFee: fee,
    discount: best.amount,
    discountSource: best.source, // '' | 'code' | 'first_order'
    discountCode: best.code,
    codeRow: best.row,
    total: subtotal - best.amount + fee,
    firstOrderPercent: settings.firstOrderDiscount,
  }
}

// Checks and merges the basket from the browser: [{ id, qty }] -> Map(id -> qty).
export function basketFromBody(items, errors, { maxLines, maxQty }) {
  const qtyById = new Map()
  if (!Array.isArray(items) || !items.length || items.length > maxLines) { errors.items = 'invalid'; return qtyById }
  for (const it of items) {
    const id = Number(it?.id)
    const qty = Number(it?.qty)
    if (!Number.isInteger(id) || id < 1 || id > 2147483647 || !Number.isInteger(qty) || qty < 1 || qty > maxQty) { errors.items = 'invalid'; break }
    qtyById.set(id, Math.min(maxQty, (qtyById.get(id) || 0) + qty))
  }
  return qtyById
}

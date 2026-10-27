// Public shop API: products, placing and tracking orders, contact form.
import crypto from 'node:crypto'
import { LANGS, SHOP } from '../config.js'
import { pool, query, transaction } from '../db.js'
import { HttpError, badRequest, clientIp, sendJson } from '../http.js'
import { checkDelivery, deliveryCalendar } from '../delivery.js'
import { recordMovement } from '../inventory.js'
import { basketFromBody, priceOrder } from '../pricing.js'
import { PRODUCT_COLUMNS, toProduct } from '../products.js'
import { failureLimit, limit, optionalCustomer, requireCustomer } from '../security.js'
import { getShopSettings } from '../settings.js'
import { email, oneOf, phone, text } from '../validate.js'
import { json } from './common.js'

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // no 0/O, 1/I
// Orders a customer may have waiting at the same time (not done or cancelled).
export const MAX_OPEN_ORDERS = 5
// Discount codes that do not exist, per IP address: stops guessing codes.
const codeFailures = failureLimit('discount-code', 20, 10)

// priceOrder, but a guessed code that does not exist is counted.
async function priceWithCode(ctx, db, options) {
  if (!options.discountCode.trim()) return priceOrder(db, options)
  const ip = clientIp(ctx.req)
  codeFailures.check(ctx, ip)
  try {
    return await priceOrder(db, options)
  } catch (err) {
    if (err.extra?.fields?.discountCode === 'not_found') codeFailures.fail(ip)
    throw err
  }
}

const newCode = () => 'LG-' + Array.from({ length: 8 }, () => CODE_CHARS[crypto.randomInt(CODE_CHARS.length)]).join('')

export function orderForCustomer(o, items) {
  return {
    code: o.code,
    status: o.status,
    createdAt: o.created_at,
    deliveryType: o.delivery_type,
    payment: o.payment,
    subtotal: o.subtotal,
    discount: o.discount || 0,
    discountCode: o.discount_code || '',
    deliveryFee: o.delivery_fee,
    total: o.total,
    deliveryDate: dayText(o.delivery_date),
    deliverySlot: o.delivery_slot || '',
    items: items.map((i) => ({ productId: i.product_id, names: i.names, price: i.price, qty: i.qty })),
  }
}

// A date column -> 'YYYY-MM-DD' or null (db.js keeps dates as text).
export const dayText = (d) => (d ? String(d).slice(0, 10) : null)

// What the website shows and may use from the shop settings.
export function publicSettings(s) {
  return {
    deliveryPrice: s.deliveryPrice, freeDeliveryFrom: s.freeDeliveryFrom, ordersOpen: s.ordersOpen,
    firstOrderDiscount: s.firstOrderDiscount, phone: s.phone, email: s.email, instagram: s.instagram,
    address: s.address, hours: s.hours, scheduledDelivery: s.scheduledDelivery,
  }
}

// Everything, for the admin's Settings tab.
export function adminSettings(s) {
  return {
    ...publicSettings(s),
    lowStockThreshold: s.lowStockThreshold, deliverySlots: s.deliverySlots,
    deliveryDaysAhead: s.deliveryDaysAhead, slotCapacity: s.slotCapacity,
  }
}

// Counted flowers: the ordered amount comes off the stock; at 0 the flower
// is sold out. (Rows are already locked by priceOrder.) Written to the stock history.
export async function takeStock(db, lines, orderId) {
  for (const l of lines) {
    if (l.stock === null || l.stock === undefined) continue
    // "stock >= $2" as well: never below zero, even if two orders race
    const { rows } = await db.query(
      `UPDATE products SET stock = stock - $2, in_stock = (stock - $2 > 0), updated_at = now()
       WHERE id = $1 AND stock >= $2 RETURNING stock`,
      [l.id, l.qty],
    )
    if (!rows[0]) {
      const left = (await db.query('SELECT stock FROM products WHERE id = $1', [l.id])).rows[0]?.stock ?? 0
      throw new HttpError(409, 'not_enough_stock', { items: [{ id: l.id, left }] })
    }
    await recordMovement(db, { productId: l.id, change: -l.qty, stockAfter: rows[0].stock, reason: 'order', orderId })
  }
}

export async function itemsFor(orderIds) {
  if (!orderIds.length) return new Map()
  const { rows } = await query(
    'SELECT order_id, product_id, names, price, qty FROM order_items WHERE order_id = ANY($1::int[]) ORDER BY id',
    [orderIds],
  )
  const map = new Map(orderIds.map((id) => [id, []]))
  for (const r of rows) map.get(r.order_id).push(r)
  return map
}

export function register(router) {
  router.get('/api/health', async (ctx) => {
    await query('SELECT 1')
    sendJson(ctx.res, 200, { ok: true })
  })

  router.get('/api/products', async (ctx) => {
    const { rows } = await query(`SELECT ${PRODUCT_COLUMNS} FROM products WHERE deleted_at IS NULL ORDER BY sort_order, id`)
    sendJson(ctx.res, 200, { products: rows.map(toProduct) })
  })

  // Days and time slots a customer can choose at checkout.
  router.get('/api/delivery/slots', limit('slots', 240, 10), async (ctx) => {
    sendJson(ctx.res, 200, await deliveryCalendar(pool, await getShopSettings()))
  })

  router.get('/api/settings', async (ctx) => {
    sendJson(ctx.res, 200, { settings: publicSettings(await getShopSettings()) })
  })

  // Checkout preview: what the order would cost now (delivery, discount code,
  // first-order discount). Body: { items, deliveryType, discountCode }.
  router.post('/api/orders/quote', json(), limit('quote', 120, 10), optionalCustomer, async (ctx) => {
    const errors = {}
    const qtyById = basketFromBody(ctx.body.items, errors, { maxLines: SHOP.maxOrderLines, maxQty: SHOP.maxQty })
    if (Object.keys(errors).length) throw badRequest(errors)
    const q = await priceWithCode(ctx, pool, {
      qtyById,
      deliveryType: ctx.body.deliveryType === 'pickup' ? 'pickup' : 'delivery',
      discountCode: typeof ctx.body.discountCode === 'string' ? ctx.body.discountCode.slice(0, 40) : '',
      customerId: ctx.customerId,
    })
    sendJson(ctx.res, 200, {
      quote: {
        subtotal: q.subtotal, deliveryFee: q.deliveryFee, discount: q.discount, discountSource: q.discountSource,
        discountCode: q.discountCode, total: q.total, firstOrderPercent: q.firstOrderPercent,
      },
    })
  })

  // Place an order. Prices always come from the database, never from the browser.
  // Only for logged-in customers: a stranger cannot empty the stock with fake orders.
  router.post('/api/orders', json(), limit('order', 30, 10), requireCustomer, async (ctx) => {
    const b = ctx.body
    const errors = {}
    const deliveryType = oneOf(errors, b, 'deliveryType', ['delivery', 'pickup'], 'delivery')
    const c = b.customer || {}
    const customer = {
      first: text(errors, c, 'first', { required: true, max: 80 }),
      last: text(errors, c, 'last', { required: true, max: 80 }),
      phone: phone(errors, c, 'phone'),
      email: email(errors, c, 'email'),
      city: text(errors, c, 'city', { required: deliveryType === 'delivery', max: 80 }),
      address: text(errors, c, 'address', { required: deliveryType === 'delivery', max: 300 }),
      notes: text(errors, c, 'notes', { max: 1000 }),
    }
    const cardMessage = text(errors, b, 'cardMessage', { max: 300 })
    const payment = oneOf(errors, b, 'payment', ['card', 'cash'], 'cash')
    const lang = LANGS.includes(b.lang) ? b.lang : 'tm'
    const qtyById = basketFromBody(b.items, errors, { maxLines: SHOP.maxOrderLines, maxQty: SHOP.maxQty })
    if (Object.keys(errors).length) throw badRequest(errors)
    const settings = await getShopSettings()
    if (!settings.ordersOpen) throw new HttpError(409, 'orders_closed')

    const order = await transaction(async (db) => {
      // the customer row lock makes two orders at the same moment wait for each other
      await db.query('SELECT 1 FROM customers WHERE id = $1 FOR UPDATE', [ctx.customerId])
      const open = await db.query(
        `SELECT count(*)::int AS n FROM orders WHERE customer_id = $1 AND status NOT IN ('done', 'cancelled')`, [ctx.customerId])
      if (open.rows[0].n >= MAX_OPEN_ORDERS) throw new HttpError(409, 'too_many_open_orders', { max: MAX_OPEN_ORDERS })
      const when = await checkDelivery(db, settings, b, errors)
      if (Object.keys(errors).length) throw badRequest(errors)
      const price = await priceWithCode(ctx, db, {
        qtyById, deliveryType, customerId: ctx.customerId, lock: true,
        discountCode: typeof b.discountCode === 'string' ? b.discountCode.slice(0, 40) : '',
      })
      const { lines, subtotal, deliveryFee, discount, total } = price

      let row
      for (let attempt = 0; !row; attempt++) {
        try {
          await db.query('SAVEPOINT code_try')
          const r = await db.query(
            `INSERT INTO orders (code, customer_id, first_name, last_name, phone, email, city, address, notes,
               delivery_type, payment, lang, subtotal, delivery_fee, total, discount, discount_code,
               delivery_date, delivery_slot, card_message)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
             RETURNING id, code, status, created_at, delivery_type, payment, subtotal, delivery_fee, total, discount, discount_code,
               delivery_date, delivery_slot`,
            [newCode(), ctx.customerId, customer.first, customer.last, customer.phone, customer.email,
              customer.city, deliveryType === 'pickup' ? '' : customer.address, customer.notes,
              deliveryType, payment, lang, subtotal, deliveryFee, total, discount, price.discountCode,
              when.date, when.slot, cardMessage],
          )
          row = r.rows[0]
        } catch (err) {
          await db.query('ROLLBACK TO SAVEPOINT code_try')
          if (err.code !== '23505' || attempt > 4) throw err // 23505 = order code already used, try another
        }
      }
      for (const l of lines) {
        await db.query(
          'INSERT INTO order_items (order_id, product_id, names, price, qty) VALUES ($1, $2, $3, $4, $5)',
          [row.id, l.id, JSON.stringify(l.names), l.price, l.qty],
        )
      }
      await takeStock(db, lines, row.id)
      if (price.codeRow) await db.query('UPDATE discount_codes SET used_count = used_count + 1 WHERE id = $1', [price.codeRow.id])
      return orderForCustomer(row, lines.map((l) => ({ product_id: l.id, names: l.names, price: l.price, qty: l.qty })))
    })
    sendJson(ctx.res, 201, { order })
  })

  // Track an order by its code. Shows no names, phone numbers or addresses.
  router.get('/api/orders/:code', limit('track', 120, 10), async (ctx) => {
    const code = String(ctx.params.code || '').trim().toUpperCase()
    if (!/^LG-[A-Z0-9]{4,12}$/.test(code)) throw new HttpError(404, 'not_found')
    const { rows } = await query(
      `SELECT id, code, status, created_at, delivery_type, payment, subtotal, delivery_fee, total, discount, discount_code,
         delivery_date, delivery_slot FROM orders WHERE code = $1`,
      [code],
    )
    if (!rows[0]) throw new HttpError(404, 'not_found')
    const items = await itemsFor([rows[0].id])
    sendJson(ctx.res, 200, { order: orderForCustomer(rows[0], items.get(rows[0].id)) })
  })

  router.post('/api/contact', json(), limit('contact', 20, 10), async (ctx) => {
    const errors = {}
    const msg = {
      name: text(errors, ctx.body, 'name', { required: true, max: 120 }),
      email: email(errors, ctx.body, 'email'),
      phone: phone(errors, ctx.body, 'phone', { required: false }),
      message: text(errors, ctx.body, 'message', { required: true, max: 3000 }),
    }
    if (Object.keys(errors).length) throw badRequest(errors)
    await query('INSERT INTO messages (name, email, phone, message) VALUES ($1, $2, $3, $4)', [msg.name, msg.email, msg.phone, msg.message])
    sendJson(ctx.res, 201, { ok: true })
  })
}

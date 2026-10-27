// Dashboard numbers, order status rules, scheduled delivery, stock
// adjustments and history, featured flowers, the activity log and a
// customer's orders.
import assert from 'node:assert/strict'
import { after, before, beforeEach, describe, test } from 'node:test'
import { browser, dropSchema, pool, resetDatabase, startServer } from './helpers.js'
import { hashPassword } from '../src/security.js'
import { addDays, shopDay } from '../src/shopTime.js'

let server
let admin
before(async () => {
  await resetDatabase()
  server = await startServer()
  await pool.query(`INSERT INTO admins (username, password_hash) VALUES ('boss', $1)`, [await hashPassword('admin-pass')])
  admin = browser(server.base)
  assert.equal((await admin.post('/api/admin/login', { username: 'boss', password: 'admin-pass' })).status, 200)
})
after(async () => {
  await server?.close()
  await dropSchema()
  await pool.end()
})

async function adminCall(method, p, body) {
  const res = await fetch(server.base + p, {
    method,
    headers: { 'X-Lale': '1', 'X-Real-IP': admin.ip, 'Content-Type': 'application/json', Cookie: [...admin.jar].map(([k, v]) => `${k}=${v}`).join('; ') },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  return { status: res.status, data: await res.json().catch(() => null) }
}
async function setSettings(changes) {
  const cur = (await adminCall('GET', '/api/admin/settings')).data.settings
  const r = await adminCall('PUT', '/api/admin/settings', { ...cur, ...changes })
  assert.equal(r.status, 200, JSON.stringify(r.data))
  return r.data.settings
}
async function addProduct({ price = 100, stock = null, name = 'Gül' } = {}) {
  const i18n = JSON.stringify({ tm: { name }, ru: { name }, tr: { name } })
  const { rows } = await pool.query(
    `INSERT INTO products (slug, cat, price, in_stock, stock, i18n) VALUES ('f', 'roses', $1, true, $2, $3) RETURNING id`,
    [price, stock, i18n],
  )
  return rows[0].id
}
let n = 0
async function customer() {
  const b = browser(server.base)
  const r = await b.post('/api/auth/register', { first: 'A', last: 'B', email: `ins${n++}@x.com`, phone: '+993 61 234567', password: 'secret123' })
  assert.equal(r.status, 201)
  b.id = r.data.user.id
  return b
}
const orderBody = (items, extra = {}) => ({
  items, deliveryType: 'delivery', payment: 'cash', lang: 'ru',
  customer: { first: 'A', last: 'B', phone: '+993 61 234567', email: 'a@x.com', city: 'Aşgabat', address: 'Street 1' },
  ...extra,
})
async function placeOrder(b, items, extra) {
  const r = await b.post('/api/orders', orderBody(items, extra))
  assert.equal(r.status, 201, JSON.stringify(r.data))
  const id = (await pool.query('SELECT id FROM orders WHERE code = $1', [r.data.order.code])).rows[0].id
  return { ...r.data.order, id }
}
const setStatus = (id, status, from) => adminCall('PATCH', `/api/admin/orders/${id}`, from === undefined ? { status } : { status, from })

beforeEach(async () => {
  await setSettings({ firstOrderDiscount: 0, ordersOpen: true, deliveryPrice: 25, freeDeliveryFrom: 200, scheduledDelivery: true, slotCapacity: 0, deliveryDaysAhead: 14, deliverySlots: ['09:00–12:00', '12:00–15:00', '15:00–18:00', '18:00–21:00'] })
})

// ---- order status rules ------------------------------------------------------------------
describe('order status changes', () => {
  test('forward steps (skipping allowed), cancel before done; done is final', async () => {
    const id = await addProduct()
    const o = await placeOrder(await customer(), [{ id, qty: 1 }])
    assert.equal((await setStatus(o.id, 'preparing')).status, 200) // skip "confirmed"
    let r = await setStatus(o.id, 'confirmed') // backwards
    assert.equal(r.status, 409)
    assert.deepEqual(r.data, { error: 'bad_status_change', status: 'preparing' })
    assert.equal((await setStatus(o.id, 'done')).status, 200)
    r = await setStatus(o.id, 'cancelled')
    assert.equal(r.data.error, 'bad_status_change')
    assert.equal((await setStatus(o.id, 'delivering')).data.error, 'bad_status_change')
  })

  test('a cancelled order can only come back as "new"', async () => {
    const id = await addProduct()
    const o = await placeOrder(await customer(), [{ id, qty: 1 }])
    assert.equal((await setStatus(o.id, 'cancelled')).status, 200)
    assert.equal((await setStatus(o.id, 'done')).data.error, 'bad_status_change')
    assert.equal((await setStatus(o.id, 'new')).status, 200)
  })

  test('two admins pressing the same button: the second is told the order changed', async () => {
    const id = await addProduct({ stock: 5 })
    const o = await placeOrder(await customer(), [{ id, qty: 2 }])
    const results = await Promise.all([setStatus(o.id, 'cancelled', 'new'), setStatus(o.id, 'cancelled', 'new')])
    assert.deepEqual(results.map((r) => r.status).sort(), [200, 409])
    assert.equal(results.find((r) => r.status === 409).data.error, 'status_changed')
    // the flowers went back only once
    assert.equal((await pool.query('SELECT stock FROM products WHERE id = $1', [id])).rows[0].stock, 5)
  })

  test('unknown statuses and notes without status still work as before', async () => {
    const id = await addProduct()
    const o = await placeOrder(await customer(), [{ id, qty: 1 }])
    assert.equal((await setStatus(o.id, 'shipped')).status, 400)
    assert.equal((await adminCall('PATCH', `/api/admin/orders/${o.id}`, { adminNote: 'call before' })).status, 200)
  })
})

// ---- scheduled delivery ---------------------------------------------------------------------
describe('delivery day and time slot', () => {
  const tomorrow = () => addDays(shopDay(), 1)

  test('the calendar lists the coming days with their slots', async () => {
    const { data } = await browser(server.base).get('/api/delivery/slots')
    assert.equal(data.enabled, true)
    assert.ok(data.days.length >= 14)
    assert.ok(data.days.some((d) => d.date === tomorrow() && d.slots.every((s) => s.open)))
  })

  test('a chosen day, slot and greeting card are saved and shown to the admin', async () => {
    const id = await addProduct()
    const o = await placeOrder(await customer(), [{ id, qty: 1 }], { deliveryDate: tomorrow(), deliverySlot: '12:00–15:00', cardMessage: 'Happy birthday, mum!' })
    assert.deepEqual([o.deliveryDate, o.deliverySlot], [tomorrow(), '12:00–15:00'])
    const { data } = await adminCall('GET', `/api/admin/orders?status=all&day=${tomorrow()}`)
    const mine = data.orders.find((x) => x.code === o.code)
    assert.deepEqual([mine.deliveryDate, mine.deliverySlot, mine.cardMessage], [tomorrow(), '12:00–15:00', 'Happy birthday, mum!'])
    // order tracking (public, by code) does not show the card text
    const track = await browser(server.base).get(`/api/orders/${o.code}`)
    assert.equal(track.data.order.deliveryDate, tomorrow())
    assert.equal(track.data.order.cardMessage, undefined)
  })

  test('without a day it is "as soon as possible"', async () => {
    const id = await addProduct()
    const o = await placeOrder(await customer(), [{ id, qty: 1 }])
    assert.deepEqual([o.deliveryDate, o.deliverySlot], [null, ''])
  })

  test('past days, days too far ahead, unknown slots and slots already started are refused', async () => {
    const id = await addProduct()
    const b = await customer()
    const fields = async (extra) => (await b.post('/api/orders', orderBody([{ id, qty: 1 }], extra))).data.fields
    assert.deepEqual(await fields({ deliveryDate: addDays(shopDay(), -1), deliverySlot: '09:00–12:00' }), { deliveryDate: 'invalid' })
    assert.deepEqual(await fields({ deliveryDate: addDays(shopDay(), 15), deliverySlot: '09:00–12:00' }), { deliveryDate: 'invalid' })
    assert.deepEqual(await fields({ deliveryDate: '2026-02-30', deliverySlot: '09:00–12:00' }), { deliveryDate: 'invalid' })
    assert.deepEqual(await fields({ deliveryDate: tomorrow(), deliverySlot: '03:00–04:00' }), { deliverySlot: 'invalid' })
    await setSettings({ deliverySlots: ['00:00–01:00', '09:00–12:00'] })
    assert.deepEqual(await fields({ deliveryDate: shopDay(), deliverySlot: '00:00–01:00' }), { deliverySlot: 'too_late' })
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM orders WHERE customer_id = $1', [b.id])).rows[0].n, 0)
  })

  test('a full slot is refused; a cancelled order frees its place', async () => {
    await setSettings({ slotCapacity: 1 })
    const id = await addProduct()
    const when = { deliveryDate: tomorrow(), deliverySlot: '15:00–18:00' }
    const first = await placeOrder(await customer(), [{ id, qty: 1 }], when)
    const r = await (await customer()).post('/api/orders', orderBody([{ id, qty: 1 }], when))
    assert.deepEqual([r.status, r.data.error], [409, 'slot_full'])
    const cal = (await browser(server.base).get('/api/delivery/slots')).data
    assert.equal(cal.days.find((d) => d.date === tomorrow()).slots.find((s) => s.slot === '15:00–18:00').open, false)
    await setStatus(first.id, 'cancelled')
    assert.equal((await (await customer()).post('/api/orders', orderBody([{ id, qty: 1 }], when))).status, 201)
  })

  test('two customers taking the last place at once: only one gets it', async () => {
    await setSettings({ slotCapacity: 1 })
    const id = await addProduct()
    const when = { deliveryDate: addDays(shopDay(), 2), deliverySlot: '18:00–21:00' }
    const [a, b] = await Promise.all([customer(), customer()])
    const res = await Promise.all([a, b].map((c) => c.post('/api/orders', orderBody([{ id, qty: 1 }], when))))
    assert.deepEqual(res.map((r) => r.status).sort(), [201, 409])
  })

  test('scheduled delivery switched off: no calendar, a chosen day is refused', async () => {
    await setSettings({ scheduledDelivery: false })
    assert.deepEqual((await browser(server.base).get('/api/delivery/slots')).data, { enabled: false, days: [] })
    const id = await addProduct()
    const r = await (await customer()).post('/api/orders', orderBody([{ id, qty: 1 }], { deliveryDate: tomorrow(), deliverySlot: '09:00–12:00' }))
    assert.equal(r.status, 400)
  })

  test('slot settings are checked', async () => {
    const cur = (await adminCall('GET', '/api/admin/settings')).data.settings
    for (const deliverySlots of [['9-12'], ['25:00–26:00'], ['09:00–12:00', '09:00–12:00'], []]) {
      const r = await adminCall('PUT', '/api/admin/settings', { ...cur, deliverySlots })
      assert.equal(r.status, 400, JSON.stringify(deliverySlots))
      assert.ok(r.data.fields.deliverySlots)
    }
  })
})

// ---- stock adjustments --------------------------------------------------------------------
describe('stock adjustments and history', () => {
  const adjust = (id, body) => adminCall('POST', `/api/admin/products/${id}/stock`, body)

  test('received / damaged / correction change the stock and are written to the history', async () => {
    const id = await addProduct({ stock: 5 })
    assert.equal((await adjust(id, { change: 10, reason: 'received', note: 'Monday delivery' })).data.product.stock, 15)
    assert.equal((await adjust(id, { change: -3, reason: 'damaged', note: 'wilted' })).data.product.stock, 12)
    assert.equal((await adjust(id, { change: -12, reason: 'correction' })).data.product.inStock, false)
    const o = await adjust(id, { change: 2, reason: 'correction' })
    assert.deepEqual(o.data.product, { id, stock: 2, inStock: true })
    const order = await placeOrder(await customer(), [{ id, qty: 1 }])
    await setStatus(order.id, 'cancelled')
    const hist = (await adminCall('GET', `/api/admin/products/${id}/stock`)).data.movements
    assert.deepEqual(hist.map((m) => [m.reason, m.change, m.stockAfter]), [
      ['cancel', 1, 2], ['order', -1, 1], ['correction', 2, 2], ['correction', -12, 0], ['damaged', -3, 12], ['received', 10, 15],
    ])
    assert.equal(hist[0].orderCode, order.code)
    assert.equal(hist[0].admin, 'boss')
    assert.equal(hist.at(-1).note, 'Monday delivery')
  })

  test('cannot go below zero; wrong signs and reasons are refused', async () => {
    const id = await addProduct({ stock: 2 })
    assert.equal((await adjust(id, { change: -5, reason: 'damaged' })).data.error, 'not_enough_stock')
    assert.equal((await adjust(id, { change: 3, reason: 'damaged' })).status, 400)
    assert.equal((await adjust(id, { change: -3, reason: 'received' })).status, 400)
    assert.equal((await adjust(id, { change: 1, reason: 'stolen' })).status, 400)
    assert.equal((await adjust(id, { change: 1.5, reason: 'received' })).status, 400)
    assert.equal((await adjust(id, { change: 0, reason: 'correction' })).status, 400)
    assert.equal((await pool.query('SELECT stock FROM products WHERE id = $1', [id])).rows[0].stock, 2)
  })

  test('a flower that is not counted starts counting when flowers are received', async () => {
    const id = await addProduct({ stock: null })
    assert.equal((await adjust(id, { change: -1, reason: 'damaged' })).data.error, 'not_counted')
    assert.equal((await adjust(id, { change: 7, reason: 'received' })).data.product.stock, 7)
  })

  test('typing a new count in the flower form is recorded too', async () => {
    const id = await addProduct({ stock: 4 })
    const p = (await browser(server.base).get('/api/products')).data.products.find((x) => x.id === id)
    const r = await adminCall('PUT', `/api/admin/products/${id}`, {
      lang: 'ru', name: 'Gül', type: 'roses', occasions: ['love'], price: 100, images: p.images, details: {}, stock: 9,
    })
    assert.equal(r.status, 200, JSON.stringify(r.data))
    const hist = (await adminCall('GET', `/api/admin/products/${id}/stock`)).data.movements
    assert.deepEqual([hist[0].reason, hist[0].change, hist[0].stockAfter], ['set', 5, 9])
  })

  test('needs an admin', async () => {
    assert.equal((await browser(server.base).post('/api/admin/products/1/stock', { change: 5, reason: 'received' })).status, 401)
    assert.equal((await browser(server.base).get('/api/admin/products/1/stock')).status, 401)
  })
})

// ---- featured ------------------------------------------------------------------------------
test('featured flowers are saved and shown on the public list', async () => {
  const PNG = 'data:image/png;base64,' + Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]).toString('base64')
  const r = await adminCall('POST', '/api/admin/products', { lang: 'ru', name: 'Star', type: 'roses', occasions: ['love'], price: 50, images: [PNG], details: {}, featured: true })
  assert.equal(r.data.product.featured, true)
  const pub = (await browser(server.base).get('/api/products')).data.products.find((p) => p.id === r.data.product.id)
  assert.equal(pub.featured, true)
})

// ---- dashboard ---------------------------------------------------------------------------------
describe('dashboard numbers', () => {
  // fresh orders on fixed past days (shop time), written straight to the database
  const DAY1 = '2026-03-02'
  const DAY2 = '2026-03-03'
  async function rawOrder({ day, status, total, items = [], discount = 0 }) {
    const { rows } = await pool.query(
      `INSERT INTO orders (code, status, first_name, last_name, phone, email, delivery_type, payment, subtotal, delivery_fee, total, discount, created_at)
       VALUES ('LG-' || substr(md5(random()::text), 1, 8), $1, 'X', 'Y', '1', 'x@y.z', 'pickup', 'cash', $2, 0, $2, $3, ($4::date + time '10:00') AT TIME ZONE 'Asia/Ashgabat')
       RETURNING id`,
      [status, total, discount, day],
    )
    for (const it of items) {
      await pool.query('INSERT INTO order_items (order_id, product_id, names, price, qty) VALUES ($1, $2, $3, $4, $5)',
        [rows[0].id, it.id, JSON.stringify({ ru: it.name }), it.price, it.qty])
    }
  }

  test('totals, revenue rules, averages, per-day series and best sellers match the orders', async () => {
    const rose = await addProduct({ name: 'Rose' })
    const tulip = await addProduct({ name: 'Tulip' })
    await rawOrder({ day: DAY1, status: 'done', total: 300, items: [{ id: rose, name: 'Rose', price: 100, qty: 3 }] })
    await rawOrder({ day: DAY1, status: 'done', total: 100, items: [{ id: tulip, name: 'Tulip', price: 50, qty: 2 }] })
    await rawOrder({ day: DAY1, status: 'new', total: 200, discount: 20, items: [{ id: tulip, name: 'Tulip', price: 50, qty: 4 }] })
    await rawOrder({ day: DAY2, status: 'cancelled', total: 999, items: [{ id: rose, name: 'Rose', price: 100, qty: 9 }] })
    await rawOrder({ day: DAY2, status: 'delivering', total: 50, items: [{ id: rose, name: 'Rose', price: 50, qty: 1 }] })
    await rawOrder({ day: '2026-02-01', status: 'done', total: 5000 }) // outside the range

    const { status, data } = await adminCall('GET', `/api/admin/stats?from=${DAY1}&to=${DAY2}`)
    assert.equal(status, 200)
    assert.deepEqual(data.totals, {
      orders: 4, delivered: 2, cancelled: 1,
      revenue: 400,           // only delivered
      orderValue: 650,        // everything not cancelled
      discounts: 20,
      avgDelivered: 200, avgOrder: 163,
    })
    assert.deepEqual(data.series, [
      { period: DAY1, orders: 3, revenue: 400, orderValue: 600 },
      { period: DAY2, orders: 1, revenue: 0, orderValue: 50 },
    ])
    // cancelled orders are not "sold"
    assert.deepEqual(data.bestSellers.map((b) => [b.names.ru, b.qty, b.amount]), [['Tulip', 6, 300], ['Rose', 4, 350]])

    const month = await adminCall('GET', `/api/admin/stats?from=2026-02-01&to=${DAY2}&group=month`)
    assert.deepEqual(month.data.series.map((s) => [s.period, s.revenue]), [['2026-02-01', 5000], ['2026-03-01', 400]])
  })

  test('the "now" numbers, recent orders and low-stock list', async () => {
    await setSettings({ lowStockThreshold: 3 })
    const low = await addProduct({ stock: 2, name: 'Almost gone' })
    await addProduct({ stock: 50 })
    const o = await placeOrder(await customer(), [{ id: low, qty: 1 }], { deliveryDate: shopDay(), deliverySlot: '18:00–21:00' }).catch(() => null)
    const { data } = await adminCall('GET', '/api/admin/stats')
    assert.ok(data.now.todayOrders >= 1)
    assert.equal(data.now.pending, Object.entries(data.now.byStatus).filter(([k]) => !['done', 'cancelled'].includes(k)).reduce((s, [, v]) => s + v, 0))
    assert.ok(data.lowStock.some((p) => p.id === low && p.stock === 1))
    assert.ok(!data.lowStock.some((p) => p.stock > 3))
    assert.equal(data.recent.length <= 8, true)
    if (o) assert.equal(data.recent[0].code, o.code)
    assert.equal((await adminCall('GET', '/api/admin/summary')).data.lowStock, data.lowStock.length)
  })

  test('bad ranges are refused; empty ranges are zeros; needs an admin', async () => {
    assert.equal((await adminCall('GET', '/api/admin/stats?from=2026-05-02&to=2026-05-01')).status, 400)
    assert.equal((await adminCall('GET', '/api/admin/stats?from=yesterday')).status, 400)
    const empty = await adminCall('GET', '/api/admin/stats?from=2001-01-01&to=2001-01-31')
    assert.deepEqual([empty.data.totals.orders, empty.data.totals.revenue, empty.data.series, empty.data.bestSellers], [0, 0, [], []])
    assert.equal((await browser(server.base).get('/api/admin/stats')).status, 401)
  })
})

// ---- activity log and customers ---------------------------------------------------------------
describe('activity log', () => {
  test('important admin actions are recorded, never passwords', async () => {
    const bad = browser(server.base)
    await bad.post('/api/admin/login', { username: 'boss', password: 'wrong' })
    const id = await addProduct({ stock: 3 })
    await adminCall('POST', `/api/admin/products/${id}/stock`, { change: 2, reason: 'received' })
    const c = await customer()
    await adminCall('POST', `/api/admin/customers/${c.id}/password`)
    await setSettings({ deliveryPrice: 31 })
    const o = await placeOrder(await customer(), [{ id, qty: 1 }]) // c was logged out by the new password
    await setStatus(o.id, 'confirmed')

    const { data } = await adminCall('GET', '/api/admin/log')
    const actions = data.entries.map((e) => e.action)
    for (const a of ['admin.login', 'admin.login_failed', 'stock.adjust', 'customer.new_password', 'settings.update', 'order.status']) {
      assert.ok(actions.includes(a), a)
    }
    const status = data.entries.find((e) => e.action === 'order.status')
    assert.deepEqual([status.admin, status.target, status.details], ['boss', `order:${o.code}`, { from: 'new', to: 'confirmed' }])
    assert.deepEqual(data.entries.find((e) => e.action === 'settings.update').details.changed, ['deliveryPrice'])
    assert.equal(data.entries.find((e) => e.action === 'admin.login_failed').admin, 'boss') // the name that was tried
    assert.ok(!JSON.stringify(data).includes('wrong'))
    assert.ok(!JSON.stringify(data.entries.find((e) => e.action === 'customer.new_password')).match(/password":/))
  })

  test('pages back with ?before, needs an admin', async () => {
    const first = (await adminCall('GET', '/api/admin/log')).data
    const older = (await adminCall('GET', `/api/admin/log?before=${first.entries.at(-1).id}`)).data
    assert.ok(older.entries.every((e) => e.id < first.entries.at(-1).id))
    assert.equal((await browser(server.base).get('/api/admin/log')).status, 401)
  })
})

test("a customer's orders, for the admin", async () => {
  const id = await addProduct({ name: 'Peony' })
  const c = await customer()
  const o = await placeOrder(c, [{ id, qty: 2 }])
  const { data } = await adminCall('GET', `/api/admin/customers/${c.id}/orders`)
  assert.deepEqual(data.orders.map((x) => [x.code, x.items[0].qty, x.items[0].names.ru]), [[o.code, 2, 'Peony']])
  assert.equal((await browser(server.base).get(`/api/admin/customers/${c.id}/orders`)).status, 401)
})

describe('saving the flower form while stock changes', () => {
  async function form(id, extra) {
    const p = (await browser(server.base).get('/api/products')).data.products.find((x) => x.id === id)
    return adminCall('PUT', `/api/admin/products/${id}`, {
      lang: 'ru', name: 'Gül', type: 'roses', occasions: ['love'], price: 120, images: p.images, details: {}, ...extra,
    })
  }

  test('an order came in while the form was open: the untouched count is kept', async () => {
    const id = await addProduct({ stock: 5 })
    await placeOrder(await customer(), [{ id, qty: 2 }]) // stock now 3
    const r = await form(id, { stock: 5, stockSeen: 5 }) // admin only changed the price
    assert.equal(r.status, 200)
    assert.deepEqual([r.data.product.stock, r.data.product.price], [3, 120])
  })

  test('the admin typed a new count but it changed meanwhile: refused with the live count', async () => {
    const id = await addProduct({ stock: 5 })
    await placeOrder(await customer(), [{ id, qty: 2 }])
    const r = await form(id, { stock: 10, stockSeen: 5 })
    assert.deepEqual([r.status, r.data.error, r.data.stock], [409, 'stock_changed', 3])
    assert.equal((await pool.query('SELECT stock FROM products WHERE id = $1', [id])).rows[0].stock, 3)
  })
})

describe('clearing order history', () => {
  const del = (id) => adminCall('DELETE', `/api/admin/orders/${id}`)
  const clear = (body) => adminCall('POST', '/api/admin/orders/clear', body)
  const exists = async (id) => (await pool.query('SELECT 1 FROM orders WHERE id = $1', [id])).rows.length === 1

  test('a delivered or cancelled order can be deleted; one in progress cannot', async () => {
    const id = await addProduct({ stock: 5 })
    const b = await customer()
    const done = await placeOrder(b, [{ id, qty: 1 }])
    const cancelled = await placeOrder(b, [{ id, qty: 1 }])
    const active = await placeOrder(b, [{ id, qty: 1 }])
    await setStatus(done.id, 'done')
    await setStatus(cancelled.id, 'cancelled')
    await setStatus(active.id, 'preparing')
    assert.equal((await del(done.id)).status, 200)
    assert.equal((await del(cancelled.id)).status, 200)
    const r = await del(active.id)
    assert.deepEqual([r.status, r.data.error], [409, 'order_active'])
    assert.deepEqual([await exists(done.id), await exists(cancelled.id), await exists(active.id)], [false, false, true])
    assert.equal((await del(999999)).status, 404)
    // the flowers' stock is not changed by deleting history
    assert.equal((await pool.query('SELECT stock FROM products WHERE id = $1', [id])).rows[0].stock, 3)
    // gone from tracking and the customer's own list
    assert.equal((await browser(server.base).get(`/api/orders/${done.code}`)).status, 404)
    assert.ok(!(await b.get('/api/account/orders')).data.orders.some((o) => o.code === done.code))
  })

  test('"clear history" removes only the chosen finished orders, counts first, and is logged', async () => {
    const id = await addProduct()
    const b = await customer()
    const o = {}
    for (const k of ['oldDone', 'newDone', 'oldCancelled', 'active']) o[k] = await placeOrder(b, [{ id, qty: 1 }])
    await setStatus(o.oldDone.id, 'done')
    await setStatus(o.newDone.id, 'done')
    await setStatus(o.oldCancelled.id, 'cancelled')
    await pool.query(`UPDATE orders SET created_at = now() - interval '100 days' WHERE id = ANY($1::int[])`, [[o.oldDone.id, o.oldCancelled.id, o.active.id]])

    // older than 90 days, delivered only: just oldDone
    let r = await clear({ statuses: ['done'], olderThanDays: 90, dryRun: true })
    assert.ok(r.data.count >= 1)
    const before = r.data.count
    r = await clear({ statuses: ['done'], olderThanDays: 90 })
    assert.equal(r.data.deleted, before)
    assert.deepEqual([await exists(o.oldDone.id), await exists(o.newDone.id), await exists(o.oldCancelled.id), await exists(o.active.id)], [false, true, true, true])

    // everything finished, any age: the active (100-day-old, in progress) order still stays
    r = await clear({ statuses: ['done', 'cancelled'], olderThanDays: 0 })
    assert.ok(r.data.deleted >= 2)
    assert.deepEqual([await exists(o.newDone.id), await exists(o.oldCancelled.id), await exists(o.active.id)], [false, false, true])

    const log = (await adminCall('GET', '/api/admin/log')).data.entries.find((e) => e.action === 'orders.clear')
    assert.deepEqual(log.details.statuses, ['done', 'cancelled'])
  })

  test('bad requests are refused; in-progress statuses cannot be cleared', async () => {
    assert.equal((await clear({ statuses: [] })).status, 400)
    assert.equal((await clear({ statuses: ['new', 'preparing'] })).status, 400) // ignored -> nothing left -> refused
    assert.equal((await clear({ statuses: ['done'], olderThanDays: 7 })).status, 400)
    assert.equal((await browser(server.base).post('/api/admin/orders/clear', { statuses: ['done'] })).status, 401)
  })
})

// Shop settings, discount codes, flowers left in stock, new flower fields
// and duplicating a flower.
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { after, before, beforeEach, describe, test } from 'node:test'
import { browser, config, dropSchema, pool, resetDatabase, startServer } from './helpers.js'
import { hashPassword } from '../src/security.js'
import { forgetShopSettings } from '../src/settings.js'

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
  await fs.rm(config.uploadDir, { recursive: true, force: true })
  await dropSchema()
  await pool.end()
})

// ---- helpers ------------------------------------------------------------------------
async function adminCall(method, p, body) {
  const res = await fetch(server.base + p, {
    method,
    headers: { 'X-Lale': '1', 'X-Real-IP': admin.ip, 'Content-Type': 'application/json', Cookie: [...admin.jar].map(([k, v]) => `${k}=${v}`).join('; ') },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  return { status: res.status, data: await res.json().catch(() => null) }
}

async function addProduct({ price = 100, stock = null, inStock = true } = {}) {
  const { rows } = await pool.query(
    `INSERT INTO products (slug, cat, price, in_stock, stock, i18n, sort_order)
     VALUES ('rose', 'roses', $1, $2, $3, '{"tm":{"name":"Gül"},"ru":{"name":"Роза"},"tr":{"name":"Gül"}}', 1) RETURNING id`,
    [price, inStock, stock],
  )
  return rows[0].id
}
const stockOf = async (id) => (await pool.query('SELECT stock, in_stock FROM products WHERE id = $1', [id])).rows[0]

let n = 0
async function customer() {
  const b = browser(server.base)
  const r = await b.post('/api/auth/register', { first: 'A', last: 'B', email: `c${n++}@x.com`, phone: '+993 61 234567', password: 'secret123' })
  assert.equal(r.status, 201)
  return b
}
const orderBody = (items, extra = {}) => ({
  items, deliveryType: 'delivery', payment: 'cash', lang: 'ru',
  customer: { first: 'A', last: 'B', phone: '+993 61 234567', email: 'a@x.com', city: 'Aşgabat', address: 'Street 1' },
  ...extra,
})

async function setSettings(changes) {
  const cur = (await adminCall('GET', '/api/admin/settings')).data.settings
  const r = await adminCall('PUT', '/api/admin/settings', { ...cur, ...changes })
  assert.equal(r.status, 200, JSON.stringify(r.data))
  return r.data.settings
}

// first-order discount off unless a test turns it on (simpler sums)
beforeEach(async () => { await setSettings({ firstOrderDiscount: 0, ordersOpen: true, deliveryPrice: 25, freeDeliveryFrom: 200 }) })

// ---- settings -------------------------------------------------------------------------
describe('shop settings', () => {
  test('the migration starts with the old values; the public endpoint shows them', async () => {
    forgetShopSettings()
    const { data } = await browser(server.base).get('/api/settings')
    assert.equal(data.settings.deliveryPrice, 25)
    assert.equal(data.settings.freeDeliveryFrom, 200)
    assert.equal(data.settings.ordersOpen, true)
    assert.ok(data.settings.address.ru)
  })

  test('only an admin can read or change them', async () => {
    assert.equal((await browser(server.base).get('/api/admin/settings')).status, 401)
    const res = await fetch(server.base + '/api/admin/settings', { method: 'PUT', headers: { 'X-Lale': '1', 'Content-Type': 'application/json' }, body: '{}' })
    assert.equal(res.status, 401)
  })

  test('bad values are refused field by field', async () => {
    const cur = (await adminCall('GET', '/api/admin/settings')).data.settings
    const r = await adminCall('PUT', '/api/admin/settings', {
      ...cur, deliveryPrice: -5, freeDeliveryFrom: 'lots', firstOrderDiscount: 95, phone: 'call me', email: 'nope', instagram: 'javascript:alert(1)',
    })
    assert.equal(r.status, 400)
    assert.deepEqual(Object.keys(r.data.fields).sort(), ['deliveryPrice', 'email', 'firstOrderDiscount', 'freeDeliveryFrom', 'instagram', 'phone'])
  })

  test('new delivery prices are used for orders at once', async () => {
    await setSettings({ deliveryPrice: 40, freeDeliveryFrom: 500 })
    const id = await addProduct({ price: 300 })
    const b = await customer()
    const r = await b.post('/api/orders', orderBody([{ id, qty: 1 }]))
    assert.equal(r.status, 201)
    assert.deepEqual([r.data.order.subtotal, r.data.order.deliveryFee, r.data.order.total], [300, 40, 340])
    const free = await b.post('/api/orders', orderBody([{ id, qty: 2 }]))
    assert.equal(free.data.order.deliveryFee, 0)
  })

  test('orders can be paused', async () => {
    await setSettings({ ordersOpen: false })
    const id = await addProduct()
    const r = await (await customer()).post('/api/orders', orderBody([{ id, qty: 1 }]))
    assert.equal(r.status, 409)
    assert.equal(r.data.error, 'orders_closed')
  })
})

// ---- discount codes -------------------------------------------------------------------
describe('discount codes', () => {
  async function code(fields) {
    const r = await adminCall('POST', '/api/admin/discounts', { kind: 'percent', value: 10, ...fields })
    assert.equal(r.status, 201, JSON.stringify(r.data))
    return r.data.discount
  }

  test('a percent code takes money off the flowers, not the delivery', async () => {
    await code({ code: 'spring10', value: 10 })
    const id = await addProduct({ price: 150 })
    const r = await (await customer()).post('/api/orders', orderBody([{ id, qty: 1 }], { discountCode: ' Spring10 ' }))
    assert.equal(r.status, 201)
    assert.deepEqual([r.data.order.subtotal, r.data.order.discount, r.data.order.deliveryFee, r.data.order.total], [150, 15, 25, 160])
    assert.equal(r.data.order.discountCode, 'SPRING10')
  })

  test('an amount code never goes below zero', async () => {
    await code({ code: 'GIFT500', kind: 'amount', value: 500 })
    const id = await addProduct({ price: 120 })
    const r = await (await customer()).post('/api/orders', orderBody([{ id, qty: 1 }], { discountCode: 'gift500' }))
    assert.equal(r.data.order.discount, 120)
    assert.equal(r.data.order.total, 25) // only delivery left
  })

  test('every rule is checked, with a reason the website can show', async () => {
    const id = await addProduct({ price: 100 })
    const past = new Date(Date.now() - 86400_000).toISOString()
    const future = new Date(Date.now() + 86400_000).toISOString()
    await code({ code: 'OLD', endsAt: past })
    await code({ code: 'SOON', startsAt: future })
    await code({ code: 'BIG', minTotal: 1000 })
    await code({ code: 'ONCE', maxUses: 1 })
    await code({ code: 'FIRST', firstOrderOnly: true })
    const off = await code({ code: 'OFF' })
    await adminCall('PUT', `/api/admin/discounts/${off.id}`, { ...off, active: false })

    const b = await customer()
    const reason = async (c) => {
      const r = await b.post('/api/orders/quote', { items: [{ id, qty: 1 }], discountCode: c })
      return r.status === 200 ? 'ok' : r.data.fields.discountCode
    }
    assert.equal(await reason('NOPE'), 'not_found')
    assert.equal(await reason('OFF'), 'not_found')
    assert.equal(await reason('<script>'), 'not_found')
    assert.equal(await reason('OLD'), 'expired')
    assert.equal(await reason('SOON'), 'not_started')
    assert.equal(await reason('BIG'), 'min_total')
    assert.equal(await reason('FIRST'), 'ok')

    // ONCE: first order uses it up
    assert.equal((await b.post('/api/orders', orderBody([{ id, qty: 1 }], { discountCode: 'ONCE' }))).status, 201)
    assert.equal(await reason('ONCE'), 'used_up')
    assert.equal(await reason('FIRST'), 'first_order') // they have an order now
    // a failed code stops the order (nothing is ordered without the expected discount)
    const r = await b.post('/api/orders', orderBody([{ id, qty: 1 }], { discountCode: 'OLD' }))
    assert.equal(r.status, 400)
  })

  test('cancelling an order gives the code use back', async () => {
    const d = await code({ code: 'ONEUSE', maxUses: 1 })
    const id = await addProduct()
    const r = await (await customer()).post('/api/orders', orderBody([{ id, qty: 1 }], { discountCode: 'ONEUSE' }))
    const orderId = (await pool.query('SELECT id FROM orders WHERE code = $1', [r.data.order.code])).rows[0].id
    assert.equal((await adminCall('GET', '/api/admin/discounts')).data.discounts.find((x) => x.id === d.id).usedCount, 1)
    await adminCall('PATCH', `/api/admin/orders/${orderId}`, { status: 'cancelled' })
    assert.equal((await adminCall('GET', '/api/admin/discounts')).data.discounts.find((x) => x.id === d.id).usedCount, 0)
  })

  test('the admin form is checked; codes are unique whatever the case', async () => {
    let r = await adminCall('POST', '/api/admin/discounts', { code: 'a', kind: 'percent', value: 150, startsAt: '2026-05-02', endsAt: '2026-05-01' })
    assert.equal(r.status, 400)
    assert.deepEqual(Object.keys(r.data.fields).sort(), ['code', 'endsAt', 'value'])
    await code({ code: 'UNIQUE1' })
    r = await adminCall('POST', '/api/admin/discounts', { code: 'unique1', kind: 'amount', value: 5 })
    assert.equal(r.data.fields.code, 'taken')
    assert.equal((await browser(server.base).post('/api/orders/quote', { items: [] })).status, 400)
    assert.equal((await fetch(server.base + '/api/admin/discounts', { headers: { 'X-Lale': '1' } })).status, 401)
  })

  test('deleting a code keeps old orders as they were', async () => {
    const d = await code({ code: 'GONE', value: 20 })
    const id = await addProduct({ price: 100 })
    const r = await (await customer()).post('/api/orders', orderBody([{ id, qty: 1 }], { discountCode: 'GONE' }))
    assert.equal((await adminCall('DELETE', `/api/admin/discounts/${d.id}`)).status, 200)
    const o = (await pool.query('SELECT discount, discount_code FROM orders WHERE code = $1', [r.data.order.code])).rows[0]
    assert.deepEqual([o.discount, o.discount_code], [20, 'GONE'])
  })
})

describe('first-order discount', () => {
  test('applies automatically to a signed-in customer\'s first order only', async () => {
    await setSettings({ firstOrderDiscount: 10 })
    const id = await addProduct({ price: 100 })
    const b = await customer()
    const q = await b.post('/api/orders/quote', { items: [{ id, qty: 2 }] })
    assert.deepEqual([q.data.quote.discount, q.data.quote.discountSource], [20, 'first_order'])
    const first = await b.post('/api/orders', orderBody([{ id, qty: 2 }]))
    assert.equal(first.data.order.discount, 20)
    const second = await b.post('/api/orders', orderBody([{ id, qty: 2 }]))
    assert.equal(second.data.order.discount, 0)
  })

  test('a cancelled first order does not count', async () => {
    await setSettings({ firstOrderDiscount: 10 })
    const id = await addProduct({ price: 100 })
    const b = await customer()
    const first = await b.post('/api/orders', orderBody([{ id, qty: 1 }]))
    await pool.query(`UPDATE orders SET status = 'cancelled' WHERE code = $1`, [first.data.order.code])
    assert.equal((await b.post('/api/orders', orderBody([{ id, qty: 1 }]))).data.order.discount, 10)
  })

  test('guests get none; with a code, the bigger discount wins (never both)', async () => {
    await setSettings({ firstOrderDiscount: 10 })
    await adminCall('POST', '/api/admin/discounts', { code: 'FIVE', kind: 'percent', value: 5 })
    await adminCall('POST', '/api/admin/discounts', { code: 'THIRTY', kind: 'percent', value: 30 })
    const id = await addProduct({ price: 100 })
    assert.equal((await browser(server.base).post('/api/orders/quote', { items: [{ id, qty: 1 }] })).data.quote.discount, 0)
    const b = await customer()
    let q = (await b.post('/api/orders/quote', { items: [{ id, qty: 1 }], discountCode: 'FIVE' })).data.quote
    assert.deepEqual([q.discount, q.discountSource], [10, 'first_order'])
    q = (await b.post('/api/orders/quote', { items: [{ id, qty: 1 }], discountCode: 'THIRTY' })).data.quote
    assert.deepEqual([q.discount, q.discountSource, q.discountCode], [30, 'code', 'THIRTY'])
  })
})

// ---- stock ------------------------------------------------------------------------------
describe('flowers left (stock)', () => {
  test('an order takes from the stock; at 0 the flower sells out', async () => {
    const id = await addProduct({ stock: 3 })
    const b = await customer()
    assert.equal((await b.post('/api/orders', orderBody([{ id, qty: 2 }]))).status, 201)
    assert.deepEqual(await stockOf(id), { stock: 1, in_stock: true })
    assert.equal((await b.post('/api/orders', orderBody([{ id, qty: 1 }]))).status, 201)
    assert.deepEqual(await stockOf(id), { stock: 0, in_stock: false })
    const r = await b.post('/api/orders', orderBody([{ id, qty: 1 }]))
    assert.equal(r.status, 409)
    assert.equal(r.data.error, 'unavailable')
  })

  test('cannot order more than is left; nothing is taken then', async () => {
    const id = await addProduct({ stock: 2 })
    const r = await (await customer()).post('/api/orders', orderBody([{ id, qty: 5 }]))
    assert.equal(r.status, 409)
    assert.deepEqual(r.data, { error: 'not_enough_stock', items: [{ id, left: 2 }] })
    assert.equal((await stockOf(id)).stock, 2)
  })

  test('two customers buying the last ones at once: only one gets them', async () => {
    const id = await addProduct({ stock: 1 })
    const [a, b] = await Promise.all([customer(), customer()])
    const results = await Promise.all([a, b].map((c) => c.post('/api/orders', orderBody([{ id, qty: 1 }]))))
    assert.deepEqual(results.map((r) => r.status).sort(), [201, 409])
    assert.deepEqual(await stockOf(id), { stock: 0, in_stock: false })
  })

  test('cancelling puts the flowers back; un-cancelling takes them again', async () => {
    const id = await addProduct({ stock: 2 })
    const r = await (await customer()).post('/api/orders', orderBody([{ id, qty: 2 }]))
    const orderId = (await pool.query('SELECT id FROM orders WHERE code = $1', [r.data.order.code])).rows[0].id
    assert.deepEqual(await stockOf(id), { stock: 0, in_stock: false })
    await adminCall('PATCH', `/api/admin/orders/${orderId}`, { status: 'cancelled' })
    assert.deepEqual(await stockOf(id), { stock: 2, in_stock: true })
    await adminCall('PATCH', `/api/admin/orders/${orderId}`, { adminNote: 'still cancelled' }) // no double return
    assert.equal((await stockOf(id)).stock, 2)
    await adminCall('PATCH', `/api/admin/orders/${orderId}`, { status: 'confirmed' })
    assert.deepEqual(await stockOf(id), { stock: 0, in_stock: false })
  })

  test('un-cancelling is refused when the flowers were sold meanwhile', async () => {
    const id = await addProduct({ stock: 1 })
    const r = await (await customer()).post('/api/orders', orderBody([{ id, qty: 1 }]))
    const orderId = (await pool.query('SELECT id FROM orders WHERE code = $1', [r.data.order.code])).rows[0].id
    await adminCall('PATCH', `/api/admin/orders/${orderId}`, { status: 'cancelled' })
    await (await customer()).post('/api/orders', orderBody([{ id, qty: 1 }]))
    const back = await adminCall('PATCH', `/api/admin/orders/${orderId}`, { status: 'new' })
    assert.equal(back.status, 409)
    assert.equal(back.data.error, 'not_enough_stock')
    assert.equal((await pool.query('SELECT status FROM orders WHERE id = $1', [orderId])).rows[0].status, 'cancelled')
  })

  test('flowers that are not counted work as before', async () => {
    const id = await addProduct({ stock: null })
    assert.equal((await (await customer()).post('/api/orders', orderBody([{ id, qty: 50 }]))).status, 201)
    assert.deepEqual(await stockOf(id), { stock: null, in_stock: true })
  })
})

// ---- admin flower form ----------------------------------------------------------------
const PNG = 'data:image/png;base64,' + Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]).toString('base64')
const form = (extra = {}) => ({
  lang: 'ru', name: 'Пионы', type: 'bouquets', occasions: ['love'], price: 300, images: [PNG],
  details: { tm: {}, ru: {}, tr: {} }, ...extra,
})

describe('flower fields', () => {
  test('new badge, position, colours, rating, reviews and stock are saved', async () => {
    const r = await adminCall('POST', '/api/admin/products', form({
      isNew: true, sortOrder: 7, colors: ['pink', 'white', 'blue'], rating: 4.86, reviews: 31, stock: 12,
    }))
    assert.equal(r.status, 201, JSON.stringify(r.data))
    const p = r.data.product
    assert.deepEqual([p.isNew, p.sortOrder, p.colors, p.rating, p.reviews, p.stock, p.inStock], [true, 7, ['white', 'pink'], 4.9, 31, 12, true])

    const e = await adminCall('PUT', `/api/admin/products/${p.id}`, form({ images: p.images, isNew: false, stock: 0, inStock: true, rating: '', reviews: '' }))
    assert.equal(e.status, 200)
    assert.deepEqual([e.data.product.isNew, e.data.product.stock, e.data.product.inStock, e.data.product.rating, e.data.product.sortOrder], [false, 0, false, 0, 7])
  })

  test('empty stock = not counted, the "in stock" switch decides', async () => {
    const r = await adminCall('POST', '/api/admin/products', form({ stock: '', inStock: false }))
    assert.deepEqual([r.data.product.stock, r.data.product.inStock], [null, false])
  })

  test('bad numbers are refused', async () => {
    const r = await adminCall('POST', '/api/admin/products', form({ stock: -1, rating: 6, reviews: 1.5, sortOrder: 'x' }))
    assert.equal(r.status, 400)
    assert.deepEqual(Object.keys(r.data.fields).sort(), ['rating', 'reviews', 'sortOrder', 'stock'])
  })

  test('the public product list shows stock, so the website can say how many are left', async () => {
    const id = await addProduct({ stock: 4 })
    const { data } = await browser(server.base).get('/api/products')
    assert.equal(data.products.find((p) => p.id === id).stock, 4)
  })
})

describe('duplicate a flower', () => {
  test('makes a copy with its own photo files, placed right after the original', async () => {
    const orig = (await adminCall('POST', '/api/admin/products', form({ stock: 5, rating: 4.5, reviews: 9, colors: ['red'], isNew: true }))).data.product
    const after = (await adminCall('POST', '/api/admin/products', form({ name: 'Next' }))).data.product
    const r = await adminCall('POST', `/api/admin/products/${orig.id}/duplicate`)
    assert.equal(r.status, 201, JSON.stringify(r.data))
    const copy = r.data.product
    assert.notEqual(copy.id, orig.id)
    assert.equal(copy.i18n.ru.name, 'Пионы (копия)')
    assert.equal(copy.i18n.tm.name, 'Пионы (nusga)')
    assert.deepEqual([copy.price, copy.stock, copy.rating, copy.reviews, copy.colors, copy.isNew], [300, 5, 4.5, 9, ['red'], false])
    assert.notEqual(copy.slug, orig.slug)

    // own files: same content, different names
    assert.equal(copy.images.length, 1)
    assert.notEqual(copy.images[0], orig.images[0])
    const file = (u) => path.join(config.uploadDir, u.replace('/uploads/', ''))
    assert.deepEqual(await fs.readFile(file(copy.images[0])), await fs.readFile(file(orig.images[0])))

    // deleting the original keeps the copy's photo
    await adminCall('POST', '/api/admin/products/delete', { ids: [orig.id] })
    await fs.access(file(copy.images[0]))

    // order: original, copy, then the next one
    const { rows } = await pool.query('SELECT id FROM products WHERE id = ANY($1::int[]) ORDER BY sort_order, id', [[orig.id, copy.id, after.id]])
    assert.deepEqual(rows.map((x) => x.id), [orig.id, copy.id, after.id])
  })

  test('needs an admin; unknown flowers are 404', async () => {
    assert.equal((await browser(server.base).post('/api/admin/products/1/duplicate')).status, 401)
    assert.equal((await adminCall('POST', '/api/admin/products/999999/duplicate')).status, 404)
  })
})


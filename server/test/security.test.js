// Fixes from the security review: orders need a login, login and discount-code
// guessing limits that also count tries from many IP addresses, security
// headers, Secure cookies over HTTPS, and the admin password length.
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { after, before, beforeEach, test } from 'node:test'
import { browser, config, dropSchema, pool, resetDatabase, startServer } from './helpers.js'
import { hashPassword, resetLimits } from '../src/security.js'
import { MAX_OPEN_ORDERS } from '../src/routes/shop.js'

let server
before(async () => {
  await resetDatabase()
  server = await startServer()
  await pool.query(`INSERT INTO admins (username, password_hash) VALUES ('boss', $1)`, [await hashPassword('admin-pass-long')])
})
after(async () => {
  await server?.close()
  await fs.rm(config.uploadDir, { recursive: true, force: true })
  await dropSchema()
  await pool.end()
})
beforeEach(() => resetLimits())

let n = 0
async function customer(password = 'secret123') {
  const b = browser(server.base)
  const email = `s${n++}@x.com`
  const r = await b.post('/api/auth/register', { first: 'A', last: 'B', email, phone: '+993 61 234567', password })
  assert.equal(r.status, 201)
  return Object.assign(b, { email })
}
async function addProduct(stock = null) {
  const { rows } = await pool.query(
    `INSERT INTO products (slug, cat, price, in_stock, stock, i18n, sort_order)
     VALUES ('rose', 'roses', 100, true, $1, '{"tm":{"name":"Gül"},"ru":{"name":"Роза"},"tr":{"name":"Gül"}}', 1) RETURNING id`,
    [stock],
  )
  return rows[0].id
}
const orderBody = (items, extra = {}) => ({
  items, deliveryType: 'delivery', payment: 'cash', lang: 'ru',
  customer: { first: 'A', last: 'B', phone: '+993 61 234567', email: 'a@x.com', city: 'Aşgabat', address: 'Street 1' },
  ...extra,
})
const stockOf = async (id) => (await pool.query('SELECT stock FROM products WHERE id = $1', [id])).rows[0].stock

// ---- orders --------------------------------------------------------------------------
test('a guest cannot place an order (and the stock stays)', async () => {
  const id = await addProduct(3)
  const r = await browser(server.base).post('/api/orders', orderBody([{ id, qty: 3 }]))
  assert.equal(r.status, 401)
  assert.equal(r.data.error, 'login_required')
  assert.equal(await stockOf(id), 3)
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM orders')).rows[0].n, 0)
})

test(`at most ${MAX_OPEN_ORDERS} open orders per customer; done or cancelled ones do not count`, async () => {
  const id = await addProduct()
  const c = await customer()
  for (let i = 0; i < MAX_OPEN_ORDERS; i++) assert.equal((await c.post('/api/orders', orderBody([{ id, qty: 1 }]))).status, 201)
  const r = await c.post('/api/orders', orderBody([{ id, qty: 1 }]))
  assert.equal(r.status, 409)
  assert.deepEqual(r.data, { error: 'too_many_open_orders', max: MAX_OPEN_ORDERS })
  // another customer is not affected
  assert.equal((await (await customer()).post('/api/orders', orderBody([{ id, qty: 1 }]))).status, 201)
  // when one is delivered, a new order is possible again
  await pool.query(`UPDATE orders SET status = 'done' WHERE id = (SELECT min(id) FROM orders)`)
  assert.equal((await c.post('/api/orders', orderBody([{ id, qty: 1 }]))).status, 201)
})

test('placing many orders at the same moment cannot pass the open-order limit', async () => {
  const id = await addProduct()
  const c = await customer()
  const results = await Promise.all(Array.from({ length: MAX_OPEN_ORDERS + 3 }, () => c.post('/api/orders', orderBody([{ id, qty: 1 }]))))
  assert.equal(results.filter((r) => r.status === 201).length, MAX_OPEN_ORDERS)
})

// ---- discount codes ---------------------------------------------------------------------
test('guessing discount codes is stopped; a real code is not counted', async () => {
  const id = await addProduct()
  await pool.query(`INSERT INTO discount_codes (code, kind, value) VALUES ('REAL10', 'percent', 10)`)
  const b = browser(server.base)
  const quote = (code) => b.post('/api/orders/quote', { items: [{ id, qty: 1 }], deliveryType: 'delivery', discountCode: code })
  for (let i = 0; i < 25; i++) assert.equal((await quote('REAL10')).status, 200)
  for (let i = 0; i < 20; i++) assert.equal((await quote(`GUESS${i}`)).data.fields.discountCode, 'not_found')
  const blocked = await quote('GUESS99')
  assert.equal(blocked.status, 429)
  assert.equal(blocked.data.error, 'rate_limited')
  assert.ok(Number(blocked.headers.get('retry-after')) > 0)
  // without a code the basket still works
  assert.equal((await quote('')).status, 200)
  // another visitor is not blocked
  assert.equal((await browser(server.base).post('/api/orders/quote', { items: [{ id, qty: 1 }], discountCode: 'REAL10' })).status, 200)
})

// ---- login limits ---------------------------------------------------------------------
test('wrong passwords for one account from many IP addresses get blocked', async () => {
  const c = await customer('right-password')
  // a new browser = a new IP address for every try
  for (let i = 0; i < 30; i++) {
    assert.equal((await browser(server.base).post('/api/auth/login', { email: c.email, password: `guess${i}` })).status, 401)
  }
  const r = await browser(server.base).post('/api/auth/login', { email: c.email, password: 'guess-more' })
  assert.equal(r.status, 429)
  // even the right password waits now (otherwise the guesser learns when they found it)
  assert.equal((await browser(server.base).post('/api/auth/login', { email: c.email, password: 'right-password' })).status, 429)
  // other accounts can still log in
  const other = await customer('other-password')
  assert.equal((await browser(server.base).post('/api/auth/login', { email: other.email, password: 'other-password' })).status, 200)
})

test('correct logins are never counted as failures', async () => {
  const c = await customer('right-password')
  for (let i = 0; i < 35; i++) {
    assert.equal((await browser(server.base).post('/api/auth/login', { email: c.email, password: 'right-password' })).status, 200)
  }
})

test('one IP address trying many accounts gets blocked', async () => {
  const b = browser(server.base)
  for (let i = 0; i < 50; i++) assert.equal((await b.post('/api/auth/login', { email: `nobody${i}@x.com`, password: 'x' })).status, 401)
  assert.equal((await b.post('/api/auth/login', { email: 'nobody-else@x.com', password: 'x' })).status, 429)
})

test('admin: wrong passwords from many IP addresses get blocked, and one IP is limited', async () => {
  for (let i = 0; i < 20; i++) {
    assert.equal((await browser(server.base).post('/api/admin/login', { username: 'Boss', password: `guess${i}` })).status, 401)
  }
  assert.equal((await browser(server.base).post('/api/admin/login', { username: 'boss', password: 'admin-pass-long' })).status, 429)

  resetLimits()
  const b = browser(server.base)
  for (let i = 0; i < 30; i++) assert.equal((await b.post('/api/admin/login', { username: `admin${i}`, password: 'x' })).status, 401)
  assert.equal((await b.post('/api/admin/login', { username: 'boss', password: 'admin-pass-long' })).status, 429)
  assert.equal((await browser(server.base).post('/api/admin/login', { username: 'boss', password: 'admin-pass-long' })).status, 200)
})

// ---- admin password ---------------------------------------------------------------------
test('a new admin password needs at least 12 characters', async () => {
  const a = browser(server.base)
  assert.equal((await a.post('/api/admin/login', { username: 'boss', password: 'admin-pass-long' })).status, 200)
  const short = await a.post('/api/admin/password', { current: 'admin-pass-long', next: '12345678901' })
  assert.equal(short.status, 400)
  assert.deepEqual(short.data.fields, { next: 'too_short' })
  assert.equal((await a.post('/api/admin/password', { current: 'admin-pass-long', next: 'twelve-chars' })).status, 200)
  await pool.query(`UPDATE admins SET password_hash = $1`, [await hashPassword('admin-pass-long')])
})

// ---- headers and cookies --------------------------------------------------------------
async function raw(p, headers = {}) {
  return fetch(server.base + p, { headers })
}

test('security headers: CSP allows only this site and Google sign-in', async () => {
  const res = await raw('/api/settings')
  const csp = res.headers.get('content-security-policy')
  assert.match(csp, /default-src 'self'/)
  assert.match(csp, /script-src 'self' https:\/\/accounts\.google\.com\/gsi\/client(;|$)/)
  assert.doesNotMatch(csp, /script-src[^;]*unsafe-inline/)
  assert.match(csp, /frame-src https:\/\/accounts\.google\.com\/gsi\//)
  assert.match(csp, /object-src 'none'/)
  assert.match(csp, /frame-ancestors 'self'/)
  assert.equal(res.headers.get('permissions-policy'), 'camera=(), microphone=(), geolocation=(), payment=()')
  assert.equal(res.headers.get('cross-origin-opener-policy'), 'same-origin-allow-popups')
  // plain HTTP: no HSTS
  assert.equal(res.headers.get('strict-transport-security'), null)
  // HTTPS through our proxy: HSTS
  const https = await raw('/api/settings', { 'X-Forwarded-Proto': 'https' })
  assert.equal(https.headers.get('strict-transport-security'), 'max-age=31536000')
})

test('login cookies are Secure when the site is opened over HTTPS', async () => {
  const login = (headers) => fetch(server.base + '/api/admin/login', {
    method: 'POST',
    headers: { 'X-Lale': '1', 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({ username: 'boss', password: 'admin-pass-long' }),
  })
  const http = (await login({ 'X-Real-IP': '10.9.0.1' })).headers.getSetCookie()[0]
  assert.doesNotMatch(http, /Secure/)
  const https = (await login({ 'X-Real-IP': '10.9.0.2', 'X-Forwarded-Proto': 'https' })).headers.getSetCookie()[0]
  assert.match(https, /; Secure/)
  assert.match(https, /HttpOnly/)
})

// Customer accounts: register, log in / out, profile, password, own orders.
import { query } from '../db.js'
import { HttpError, badRequest, sendJson } from '../http.js'
import { endOtherSessions, endSession, hashPassword, limit, requireCustomer, startSession, verifyDummy, verifyPassword } from '../security.js'
import { email, phone, text } from '../validate.js'
import { itemsFor, orderForCustomer } from './shop.js'
import { json } from './common.js'

const SHORT_HOURS = 12        // "remember me" off: until the browser closes (max 12 h)
const LONG_HOURS = 24 * 30    // "remember me" on: 30 days

const publicCustomer = (c) => ({ id: c.id, email: c.email, first: c.first_name, last: c.last_name, phone: c.phone, createdAt: c.created_at })
const emailKey = (ctx) => String(ctx.body?.email || '').trim().toLowerCase()

export function register(router) {
  router.post('/api/auth/register', json(), limit('register', 20, 60), async (ctx) => {
    const errors = {}
    const data = {
      first: text(errors, ctx.body, 'first', { required: true, max: 80 }),
      last: text(errors, ctx.body, 'last', { required: true, max: 80 }),
      email: email(errors, ctx.body, 'email'),
      phone: phone(errors, ctx.body, 'phone'),
    }
    const password = typeof ctx.body.password === 'string' ? ctx.body.password : ''
    if (password.length < 6) errors.password = 'too_short'
    else if (password.length > 200) errors.password = 'too_long'
    if (Object.keys(errors).length) throw badRequest(errors)

    const hash = await hashPassword(password)
    let row
    try {
      const r = await query(
        `INSERT INTO customers (email, first_name, last_name, phone, password_hash) VALUES ($1, $2, $3, $4, $5)
         RETURNING id, email, first_name, last_name, phone, created_at`,
        [data.email, data.first, data.last, data.phone, hash],
      )
      row = r.rows[0]
    } catch (err) {
      if (err.code === '23505') throw new HttpError(409, 'email_taken')
      throw err
    }
    await startSession(ctx.res, 'customer', row.id, { hours: SHORT_HOURS, remember: false })
    sendJson(ctx.res, 201, { user: publicCustomer(row) })
  })

  router.post('/api/auth/login', json(), limit('login', 10, 15, emailKey), async (ctx) => {
    const addr = emailKey(ctx)
    const password = typeof ctx.body.password === 'string' ? ctx.body.password.slice(0, 200) : ''
    const { rows } = await query(
      'SELECT id, email, first_name, last_name, phone, created_at, password_hash FROM customers WHERE lower(email) = $1',
      [addr],
    )
    const ok = rows[0] ? await verifyPassword(password, rows[0].password_hash) : await verifyDummy(password)
    if (!ok) throw new HttpError(401, 'invalid_credentials')
    const remember = ctx.body.remember === true
    await startSession(ctx.res, 'customer', rows[0].id, { hours: remember ? LONG_HOURS : SHORT_HOURS, remember })
    sendJson(ctx.res, 200, { user: publicCustomer(rows[0]) })
  })

  router.post('/api/auth/logout', async (ctx) => {
    await endSession(ctx.req, ctx.res, 'customer')
    sendJson(ctx.res, 200, { ok: true })
  })

  router.get('/api/auth/me', async (ctx) => {
    // not logged in is a normal answer here, not an error
    try { await requireCustomer(ctx) } catch { return sendJson(ctx.res, 200, { user: null }) }
    const { rows } = await query('SELECT id, email, first_name, last_name, phone, created_at FROM customers WHERE id = $1', [ctx.customerId])
    sendJson(ctx.res, 200, { user: rows[0] ? publicCustomer(rows[0]) : null })
  })

  router.patch('/api/auth/me', json(), requireCustomer, async (ctx) => {
    const errors = {}
    const first = text(errors, ctx.body, 'first', { required: true, max: 80 })
    const last = text(errors, ctx.body, 'last', { max: 80 })
    const tel = phone(errors, ctx.body, 'phone', { required: false })
    if (Object.keys(errors).length) throw badRequest(errors)
    const { rows } = await query(
      `UPDATE customers SET first_name = $2, last_name = $3, phone = $4 WHERE id = $1
       RETURNING id, email, first_name, last_name, phone, created_at`,
      [ctx.customerId, first, last, tel],
    )
    sendJson(ctx.res, 200, { user: publicCustomer(rows[0]) })
  })

  router.post('/api/auth/password', json(), requireCustomer, limit('password', 10, 15), async (ctx) => {
    const current = typeof ctx.body.current === 'string' ? ctx.body.current : ''
    const next = typeof ctx.body.next === 'string' ? ctx.body.next : ''
    if (next.length < 6 || next.length > 200) throw badRequest({ next: 'too_short' })
    const { rows } = await query('SELECT password_hash FROM customers WHERE id = $1', [ctx.customerId])
    if (!rows[0] || !(await verifyPassword(current, rows[0].password_hash))) throw new HttpError(401, 'invalid_credentials')
    await query('UPDATE customers SET password_hash = $2 WHERE id = $1', [ctx.customerId, await hashPassword(next)])
    await endOtherSessions(ctx.req, 'customer', ctx.customerId) // log out other devices
    sendJson(ctx.res, 200, { ok: true })
  })

  router.get('/api/account/orders', requireCustomer, async (ctx) => {
    const { rows } = await query(
      `SELECT id, code, status, created_at, delivery_type, payment, subtotal, delivery_fee, total
       FROM orders WHERE customer_id = $1 ORDER BY created_at DESC LIMIT 100`,
      [ctx.customerId],
    )
    const items = await itemsFor(rows.map((r) => r.id))
    sendJson(ctx.res, 200, { orders: rows.map((o) => orderForCustomer(o, items.get(o.id))) })
  })
}

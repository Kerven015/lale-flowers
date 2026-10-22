// Customer accounts: register, log in / out (password or Google), profile,
// email, password, own orders.
import { config, LANGS } from '../config.js'
import { query } from '../db.js'
import { customerForGoogle, verifyGoogleCredential } from '../google.js'
import { HttpError, badRequest, sendJson } from '../http.js'
import { endOtherSessions, endSession, hashPassword, limit, requireCustomer, startSession, verifyDummy, verifyPassword } from '../security.js'
import { email, phone, text } from '../validate.js'
import { itemsFor, orderForCustomer } from './shop.js'
import { json } from './common.js'

const SHORT_HOURS = 12        // "remember me" off: until the browser closes (max 12 h)
const LONG_HOURS = 24 * 30    // "remember me" on: 30 days

const GOOGLE_HOURS = LONG_HOURS // Google sign-in always lasts 30 days

// What the website may see about a customer (never the password hash).
const publicCustomer = (c) => ({
  id: c.id, email: c.email, first: c.first_name, last: c.last_name, phone: c.phone, createdAt: c.created_at,
  hasPassword: !!c.has_password, google: !!c.google, emailVerified: !!c.email_verified_at,
})
const emailKey = (ctx) => String(ctx.body?.email || '').trim().toLowerCase()

async function loadCustomer(id) {
  const { rows } = await query(
    `SELECT id, email, first_name, last_name, phone, created_at, email_verified_at, password_hash IS NOT NULL AS has_password,
            EXISTS (SELECT 1 FROM user_identities i WHERE i.user_id = c.id AND i.provider = 'google') AS google
     FROM customers c WHERE id = $1`,
    [id],
  )
  return rows[0] ? publicCustomer(rows[0]) : null
}

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
    const lang = LANGS.includes(ctx.body.lang) ? ctx.body.lang : LANGS[0]
    let row
    try {
      const r = await query(
        `INSERT INTO customers (email, first_name, last_name, phone, password_hash, lang) VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id`,
        [data.email, data.first, data.last, data.phone, hash, lang],
      )
      row = r.rows[0]
    } catch (err) {
      if (err.code === '23505') throw new HttpError(409, 'email_taken')
      throw err
    }
    await startSession(ctx.res, 'customer', row.id, { hours: SHORT_HOURS, remember: false })
    sendJson(ctx.res, 201, { user: await loadCustomer(row.id) })
  })

  router.post('/api/auth/login', json(), limit('login', 10, 15, emailKey), async (ctx) => {
    const addr = emailKey(ctx)
    const password = typeof ctx.body.password === 'string' ? ctx.body.password.slice(0, 200) : ''
    const { rows } = await query('SELECT id, password_hash, blocked_at FROM customers WHERE lower(email) = $1', [addr])
    // An account made with Google (no password yet) answers exactly like a
    // wrong password, and takes just as long.
    const ok = rows[0]?.password_hash ? await verifyPassword(password, rows[0].password_hash) : await verifyDummy(password)
    if (!ok) throw new HttpError(401, 'invalid_credentials')
    if (rows[0].blocked_at) throw new HttpError(403, 'account_blocked')
    const remember = ctx.body.remember === true
    await startSession(ctx.res, 'customer', rows[0].id, { hours: remember ? LONG_HOURS : SHORT_HOURS, remember })
    sendJson(ctx.res, 200, { user: await loadCustomer(rows[0].id) })
  })

  // The public Google Client ID for the website (null = Google sign-in is off).
  router.get('/api/auth/config', async (ctx) => {
    sendJson(ctx.res, 200, { googleClientId: config.googleClientId })
  })

  // "Continue with Google" / One Tap: body { credential, lang }.
  router.post('/api/auth/google', limit('google', 30, 15), json(), async (ctx) => {
    const person = await verifyGoogleCredential(ctx.body.credential)
    const lang = LANGS.includes(ctx.body.lang) ? ctx.body.lang : LANGS[0]
    let customer
    try {
      customer = await customerForGoogle(person, lang)
    } catch (err) {
      // the same person signing in twice at the same moment: the first one
      // created the account, so the second try simply finds it
      if (err.code !== '23505') throw err
      customer = await customerForGoogle(person, lang)
    }
    await startSession(ctx.res, 'customer', customer.id, { hours: GOOGLE_HOURS, remember: true })
    sendJson(ctx.res, 200, { user: await loadCustomer(customer.id) })
  })

  router.post('/api/auth/logout', async (ctx) => {
    await endSession(ctx.req, ctx.res, 'customer')
    sendJson(ctx.res, 200, { ok: true })
  })

  router.get('/api/auth/me', async (ctx) => {
    // not logged in is a normal answer here, not an error
    try { await requireCustomer(ctx) } catch { return sendJson(ctx.res, 200, { user: null }) }
    sendJson(ctx.res, 200, { user: await loadCustomer(ctx.customerId) })
  })

  router.patch('/api/auth/me', json(), requireCustomer, async (ctx) => {
    const errors = {}
    const first = text(errors, ctx.body, 'first', { required: true, max: 80 })
    const last = text(errors, ctx.body, 'last', { max: 80 })
    const tel = phone(errors, ctx.body, 'phone', { required: false })
    if (Object.keys(errors).length) throw badRequest(errors)
    await query('UPDATE customers SET first_name = $2, last_name = $3, phone = $4 WHERE id = $1', [ctx.customerId, first, last, tel])
    sendJson(ctx.res, 200, { user: await loadCustomer(ctx.customerId) })
  })

  // New email: needs the account's password (Google-only accounts set one
  // first). The new address is not proven yet, so it is no longer "verified".
  router.post('/api/auth/email', json(), requireCustomer, limit('email', 10, 15), async (ctx) => {
    const errors = {}
    const addr = email(errors, ctx.body, 'email')
    if (Object.keys(errors).length) throw badRequest(errors)
    const password = typeof ctx.body.password === 'string' ? ctx.body.password.slice(0, 200) : ''
    const { rows } = await query('SELECT email, password_hash FROM customers WHERE id = $1', [ctx.customerId])
    if (!rows[0]) throw new HttpError(401, 'login_required')
    if (!rows[0].password_hash) throw new HttpError(409, 'password_required')
    if (!(await verifyPassword(password, rows[0].password_hash))) throw new HttpError(401, 'invalid_credentials')
    if (addr !== rows[0].email.toLowerCase()) {
      try {
        await query('UPDATE customers SET email = $2, email_verified_at = NULL WHERE id = $1', [ctx.customerId, addr])
      } catch (err) {
        if (err.code === '23505') throw new HttpError(409, 'email_taken')
        throw err
      }
    }
    sendJson(ctx.res, 200, { user: await loadCustomer(ctx.customerId) })
  })

  // Change the password. An account made with Google has none yet: its first
  // password needs no "current password".
  router.post('/api/auth/password', json(), requireCustomer, limit('password', 10, 15), async (ctx) => {
    const current = typeof ctx.body.current === 'string' ? ctx.body.current : ''
    const next = typeof ctx.body.next === 'string' ? ctx.body.next : ''
    if (next.length < 6 || next.length > 200) throw badRequest({ next: 'too_short' })
    const { rows } = await query('SELECT password_hash FROM customers WHERE id = $1', [ctx.customerId])
    if (!rows[0]) throw new HttpError(401, 'invalid_credentials')
    if (rows[0].password_hash && !(await verifyPassword(current, rows[0].password_hash))) throw new HttpError(401, 'invalid_credentials')
    // "IS NOT DISTINCT FROM": two first-password requests at once cannot both
    // skip the current-password check
    const { rowCount } = await query(
      'UPDATE customers SET password_hash = $2 WHERE id = $1 AND password_hash IS NOT DISTINCT FROM $3',
      [ctx.customerId, await hashPassword(next), rows[0].password_hash],
    )
    if (!rowCount) throw new HttpError(409, 'conflict')
    await endOtherSessions(ctx.req, 'customer', ctx.customerId) // log out other devices
    sendJson(ctx.res, 200, { user: await loadCustomer(ctx.customerId) })
  })

  router.get('/api/account/orders', requireCustomer, async (ctx) => {
    const { rows } = await query(
      `SELECT id, code, status, created_at, delivery_type, payment, subtotal, delivery_fee, total, discount, discount_code
       FROM orders WHERE customer_id = $1 ORDER BY created_at DESC LIMIT 100`,
      [ctx.customerId],
    )
    const items = await itemsFor(rows.map((r) => r.id))
    sendJson(ctx.res, 200, { orders: rows.map((o) => orderForCustomer(o, items.get(o.id))) })
  })
}

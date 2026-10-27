// Passwords, login sessions and rate limits.
import crypto from 'node:crypto'
import { promisify } from 'node:util'
import { query } from './db.js'
import { HttpError, clientIp, parseCookies, setCookie } from './http.js'

const scrypt = promisify(crypto.scrypt)
const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 }
export const ADMIN_PASSWORD_MIN = 12

// ---- passwords (scrypt, built into Node) -----------------------------------
export async function hashPassword(password) {
  const salt = crypto.randomBytes(16)
  const key = await scrypt(String(password), salt, SCRYPT.keylen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p })
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString('base64')}$${key.toString('base64')}`
}

export async function verifyPassword(password, stored) {
  const parts = String(stored || '').split('$')
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false
  const [, N, r, p, saltB64, keyB64] = parts
  const expected = Buffer.from(keyB64, 'base64')
  const key = await scrypt(String(password), Buffer.from(saltB64, 'base64'), expected.length, { N: +N, r: +r, p: +p })
  return crypto.timingSafeEqual(key, expected)
}

// Used when the email does not exist, so a wrong email takes as long as a
// wrong password (nobody can find out which emails have accounts).
let dummyHash = null
export async function verifyDummy(password) {
  dummyHash ??= await hashPassword('dummy-password-for-timing')
  await verifyPassword(password, dummyHash)
  return false
}

export function randomPassword(length = 10) {
  const chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let s = ''
  for (let i = 0; i < length; i++) s += chars[crypto.randomInt(chars.length)]
  return s
}

// ---- sessions ----------------------------------------------------------------
export const COOKIES = {
  customer: { name: 'lg_session', path: '/' },
  admin: { name: 'lg_admin', path: '/api/admin' },
}
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex')

// remember = keep the cookie after the browser closes
export async function startSession(res, kind, id, { hours, remember }) {
  const token = crypto.randomBytes(32).toString('base64url')
  const expires = new Date(Date.now() + hours * 3600 * 1000)
  await query(
    `INSERT INTO sessions (token_hash, kind, customer_id, admin_id, expires_at) VALUES ($1, $2, $3, $4, $5)`,
    [sha256(token), kind, kind === 'customer' ? id : null, kind === 'admin' ? id : null, expires],
  )
  const c = COOKIES[kind]
  setCookie(res, c.name, token, { path: c.path, maxAge: remember ? hours * 3600 : null })
}

export async function endSession(req, res, kind) {
  const c = COOKIES[kind]
  const token = parseCookies(req)[c.name]
  if (token) await query('DELETE FROM sessions WHERE token_hash = $1', [sha256(token)])
  setCookie(res, c.name, '', { path: c.path, maxAge: 0 })
}

// After a password change: every other login of this account ends, this one stays.
export async function endOtherSessions(req, kind, id) {
  const token = parseCookies(req)[COOKIES[kind].name] || ''
  const column = kind === 'customer' ? 'customer_id' : 'admin_id'
  await query(`DELETE FROM sessions WHERE kind = $1 AND ${column} = $2 AND token_hash <> $3`, [kind, id, sha256(token)])
}

async function sessionOwner(req, kind) {
  const token = parseCookies(req)[COOKIES[kind].name]
  if (!token || token.length > 100) return null
  const { rows } = await query(
    `SELECT customer_id, admin_id FROM sessions WHERE token_hash = $1 AND kind = $2 AND expires_at > now()`,
    [sha256(token), kind],
  )
  if (!rows[0]) return null
  return kind === 'customer' ? rows[0].customer_id : rows[0].admin_id
}

// Route guards: put the logged-in id on ctx, or answer 401.
export async function optionalCustomer(ctx) {
  ctx.customerId = await sessionOwner(ctx.req, 'customer')
}
export async function requireCustomer(ctx) {
  ctx.customerId = await sessionOwner(ctx.req, 'customer')
  if (!ctx.customerId) throw new HttpError(401, 'login_required')
}
export async function requireAdmin(ctx) {
  ctx.adminId = await sessionOwner(ctx.req, 'admin')
  if (!ctx.adminId) throw new HttpError(401, 'admin_login_required')
}

export async function deleteExpiredSessions() {
  await query('DELETE FROM sessions WHERE expires_at < now()')
}

// ---- rate limits (in memory) -------------------------------------------------
const buckets = new Map()
setInterval(() => {
  const now = Date.now()
  for (const [k, b] of buckets) if (b.reset < now) buckets.delete(k)
}, 60_000).unref()

function bucket(key, minutes) {
  const now = Date.now()
  let b = buckets.get(key)
  if (!b || b.reset < now) { b = { count: 0, reset: now + minutes * 60_000 }; buckets.set(key, b) }
  return b
}

function tooMany(res, b) {
  res.setHeader('Retry-After', Math.max(1, Math.ceil((b.reset - Date.now()) / 1000)))
  throw new HttpError(429, 'rate_limited')
}

// Allows `max` requests per `minutes` for the same key; otherwise 429.
// Limits are generous on purpose: mobile networks put many customers behind
// one shared IP address, and real customers must never be blocked.
export function limit(name, max, minutes, keyFn = () => '') {
  return (ctx) => {
    const b = bucket(`${name}|${clientIp(ctx.req)}|${keyFn(ctx)}`, minutes)
    b.count++
    if (b.count > max) tooMany(ctx.res, b)
  }
}

// Counts only failed tries (a wrong password, a discount code that does not
// exist) for one key, from every IP address together. This stops guessing
// spread over many addresses, while correct tries are never counted.
// check() before the try (429 when there were too many), fail() after a wrong one.
export function failureLimit(name, max, minutes) {
  return {
    check(ctx, key) {
      const b = buckets.get(`${name}||${key}`)
      if (b && b.reset >= Date.now() && b.count >= max) tooMany(ctx.res, b)
    },
    fail(key) {
      bucket(`${name}||${key}`, minutes).count++
    },
  }
}

// for the tests
export function resetLimits() {
  buckets.clear()
}

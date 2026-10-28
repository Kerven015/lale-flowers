// Two-step login for the admin panel: a 6-digit code from an authenticator
// app on the phone (TOTP, RFC 6238: SHA-1, 30 seconds, 6 digits), or a
// one-time backup code. Built on Node's crypto; only the QR picture uses a package.
import crypto from 'node:crypto'
import QRCode from 'qrcode'
import { query } from './db.js'

const ISSUER = 'Läle Gülleri'
const STEP_SECONDS = 30
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
const BACKUP_CHARS = 'abcdefghjkmnpqrstuvwxyz23456789' // no 0/o, 1/l/i
export const BACKUP_COUNT = 8

// ---- the phone app's code --------------------------------------------------------
// A new secret key: 20 random bytes, written in base32 (what the apps expect).
export function newSecret() {
  const bytes = crypto.randomBytes(20)
  let bits = ''
  for (const b of bytes) bits += b.toString(2).padStart(8, '0')
  let out = ''
  for (let i = 0; i < bits.length; i += 5) out += B32[parseInt(bits.slice(i, i + 5).padEnd(5, '0'), 2)]
  return out
}

function base32Bytes(secret) {
  let bits = ''
  for (const ch of secret.replace(/[\s=]/g, '').toUpperCase()) {
    const v = B32.indexOf(ch)
    if (v < 0) throw new Error('bad base32')
    bits += v.toString(2).padStart(5, '0')
  }
  const out = []
  for (let i = 0; i + 8 <= bits.length; i += 8) out.push(parseInt(bits.slice(i, i + 8), 2))
  return Buffer.from(out)
}

export const stepAt = (ms = Date.now()) => Math.floor(ms / 1000 / STEP_SECONDS)

// The 6-digit code for one 30-second step.
export function codeFor(secret, step) {
  const counter = Buffer.alloc(8)
  counter.writeBigUInt64BE(BigInt(step))
  const h = crypto.createHmac('sha1', base32Bytes(secret)).update(counter).digest()
  const o = h[h.length - 1] & 0xf
  const n = ((h[o] & 0x7f) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3]
  return String(n % 1_000_000).padStart(6, '0')
}

// The step a typed code belongs to, or null. The step before and after count
// too, because phone clocks are often a few seconds off.
export function matchStep(secret, code, ms = Date.now()) {
  const typed = Buffer.from(String(code))
  const now = stepAt(ms)
  for (const step of [now, now - 1, now + 1]) {
    const right = Buffer.from(codeFor(secret, step))
    if (typed.length === right.length && crypto.timingSafeEqual(typed, right)) return step
  }
  return null
}

// What the QR code holds: the app reads the key, the shop name and the user from it.
export function otpauthUrl(secret, username) {
  const label = encodeURIComponent(`${ISSUER}:${username}`)
  return `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(ISSUER)}&algorithm=SHA1&digits=6&period=${STEP_SECONDS}`
}

// The QR picture as an SVG data URL (an <img> can show it; nothing is loaded from elsewhere).
export async function qrDataUrl(text) {
  const svg = await QRCode.toString(text, { type: 'svg', margin: 2, errorCorrectionLevel: 'M' })
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`
}

// ---- backup codes ----------------------------------------------------------------
const cleanBackup = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '')
const hashBackup = (s) => crypto.createHash('sha256').update(cleanBackup(s)).digest('hex')

// New backup codes for an admin (the old ones stop working). Returns them
// once, written like "abcd-efgh"; only hashes are kept.
export async function newBackupCodes(db, adminId) {
  const codes = Array.from({ length: BACKUP_COUNT }, () => {
    let s = ''
    for (let i = 0; i < 8; i++) s += BACKUP_CHARS[crypto.randomInt(BACKUP_CHARS.length)]
    return `${s.slice(0, 4)}-${s.slice(4)}`
  })
  await db.query('DELETE FROM admin_backup_codes WHERE admin_id = $1', [adminId])
  for (const c of codes) await db.query('INSERT INTO admin_backup_codes (admin_id, code_hash) VALUES ($1, $2)', [adminId, hashBackup(c)])
  return codes
}

export async function backupCodesLeft(adminId) {
  const { rows } = await query('SELECT count(*)::int AS n FROM admin_backup_codes WHERE admin_id = $1 AND used_at IS NULL', [adminId])
  return rows[0].n
}

// ---- checking the second step ----------------------------------------------------
// A code from the phone app (each works once), or an unused backup code.
// Returns 'app', 'backup', or null when it is wrong.
export async function checkSecondStep(adminId, input) {
  const { rows } = await query('SELECT totp_secret FROM admins WHERE id = $1', [adminId])
  const secret = rows[0]?.totp_secret
  if (!secret) return null
  const typed = String(input || '').replace(/\s/g, '')
  if (/^\d{6}$/.test(typed)) {
    const step = matchStep(secret, typed)
    if (step === null) return null
    // a code seen once is never accepted again (someone watching over the shoulder)
    const r = await query(
      'UPDATE admins SET totp_last_step = $2 WHERE id = $1 AND (totp_last_step IS NULL OR totp_last_step < $2) RETURNING id',
      [adminId, step],
    )
    return r.rowCount ? 'app' : null
  }
  if (cleanBackup(typed).length !== 8) return null
  const r = await query(
    'UPDATE admin_backup_codes SET used_at = now() WHERE admin_id = $1 AND code_hash = $2 AND used_at IS NULL RETURNING id',
    [adminId, hashBackup(typed)],
  )
  return r.rowCount ? 'backup' : null
}

// ---- password was right, the code is still to come --------------------------------
// The browser gets a ticket for 5 minutes and 5 tries; no session exists yet.
// Kept in memory: after a server restart the admin simply logs in again.
const PENDING_MS = 5 * 60_000
const PENDING_TRIES = 5
const pending = new Map() // sha256(ticket) -> { adminId, expires, tries }
const ticketKey = (t) => crypto.createHash('sha256').update(String(t)).digest('hex')

export function startPendingLogin(adminId) {
  const now = Date.now()
  for (const [k, p] of pending) if (p.expires < now) pending.delete(k)
  const ticket = crypto.randomBytes(32).toString('base64url')
  pending.set(ticketKey(ticket), { adminId, expires: now + PENDING_MS, tries: 0 })
  return ticket
}

// The waiting login for a ticket, or null (unknown, too old, or out of tries).
export function pendingLogin(ticket) {
  if (typeof ticket !== 'string' || ticket.length > 100) return null
  const k = ticketKey(ticket)
  const p = pending.get(k)
  if (!p || p.expires < Date.now() || p.tries >= PENDING_TRIES) { pending.delete(k); return null }
  return p
}

export function endPendingLogin(ticket) {
  pending.delete(ticketKey(ticket))
}

// "Continue with Google". The browser gets a signed ID token from Google and
// sends it here. Google only proves who the person is: the account itself
// lives in our own customers table.
import { OAuth2Client } from 'google-auth-library'
import { config } from './config.js'
import { transaction } from './db.js'
import { HttpError } from './http.js'

// Downloads (and caches) Google's public keys. Exported so the tests can give
// it their own keys instead.
export const googleClient = new OAuth2Client()

const failed = () => new HttpError(401, 'google_failed')
const clean = (v, max) => String(v ?? '').replace(/[\u0000-\u001F\u007F]/g, '').trim().slice(0, max)

// Checks the token's signature (Google's keys), issuer, expiry and that it was
// made for our Client ID. Returns who the person is, or throws google_failed.
// The token itself is never logged or stored.
export async function verifyGoogleCredential(credential) {
  if (!config.googleClientId) throw new HttpError(404, 'google_disabled')
  if (typeof credential !== 'string' || !credential || credential.length > 4096) throw failed()
  let payload
  try {
    const ticket = await googleClient.verifyIdToken({ idToken: credential, audience: config.googleClientId })
    payload = ticket.getPayload()
  } catch {
    throw failed()
  }
  if (!payload || payload.aud !== config.googleClientId) throw failed()
  if (payload.email_verified !== true) throw failed()
  const sub = clean(payload.sub, 255)
  const email = clean(payload.email, 254).toLowerCase()
  if (!sub || !email) throw failed()
  return {
    sub,
    email,
    first: clean(payload.given_name || payload.name || email.split('@')[0], 80),
    last: clean(payload.family_name, 80),
  }
}

const COLUMNS = 'c.id, c.email, c.first_name, c.last_name, c.phone, c.created_at, c.password_hash, c.email_verified_at, c.blocked_at'

// Finds or creates the customer for a verified Google person, all in one
// transaction:
//   1. this Google account is already linked -> that customer
//   2. a customer with the same email exists -> link Google to it
//   3. otherwise -> a new customer without a password
export async function customerForGoogle(g, lang) {
  return transaction(async (db) => {
    let { rows } = await db.query(
      `SELECT ${COLUMNS} FROM user_identities i JOIN customers c ON c.id = i.user_id
       WHERE i.provider = 'google' AND i.subject = $1 FOR UPDATE OF c`,
      [g.sub],
    )
    if (rows[0]) {
      const c = rows[0]
      if (c.blocked_at) throw new HttpError(403, 'account_blocked')
      await db.query(`UPDATE user_identities SET email = $2, last_used_at = now() WHERE provider = 'google' AND subject = $1`, [g.sub, g.email])
      // Google vouches only for the address it sent us right now
      if (!c.email_verified_at && c.email.toLowerCase() === g.email) {
        await db.query('UPDATE customers SET email_verified_at = now() WHERE id = $1', [c.id])
      }
      return c
    }

    ;({ rows } = await db.query(`SELECT ${COLUMNS} FROM customers c WHERE lower(c.email) = $1 FOR UPDATE`, [g.email]))
    let c = rows[0]
    if (c) {
      if (c.blocked_at) throw new HttpError(403, 'account_blocked')
      if (!c.email_verified_at) {
        // Nobody ever proved they own this email: someone else may have
        // registered it first. Only the inbox owner (signing in with Google
        // now) keeps the account: the password goes and every login ends.
        await db.query('UPDATE customers SET password_hash = NULL WHERE id = $1', [c.id])
        await db.query(`DELETE FROM sessions WHERE kind = 'customer' AND customer_id = $1`, [c.id])
      }
      await db.query('UPDATE customers SET email_verified_at = COALESCE(email_verified_at, now()) WHERE id = $1', [c.id])
    } else {
      ;({ rows } = await db.query(
        `INSERT INTO customers (email, first_name, last_name, phone, password_hash, email_verified_at, lang)
         VALUES ($1, $2, $3, '', NULL, now(), $4)
         RETURNING id, email, first_name, last_name, phone, created_at, password_hash, email_verified_at, blocked_at`,
        [g.email, g.first || g.email.split('@')[0], g.last, lang],
      ))
      c = rows[0]
    }
    await db.query(
      `INSERT INTO user_identities (provider, subject, user_id, email) VALUES ('google', $1, $2, $3)`,
      [g.sub, c.id, g.email],
    )
    return c
  })
}

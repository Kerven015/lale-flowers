// Test setup: a separate, throw-away database and a server on a free port.
// Never touches the real database: the database name must end in "_test".
//   TEST_DATABASE_URL=postgres://USER:PASS@127.0.0.1:5432/lale_test npm test
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const url = process.env.TEST_DATABASE_URL || 'postgres://lale_test:lale_test@127.0.0.1:5432/lale_test'
const dbName = new URL(url).pathname.slice(1)
if (!dbName.endsWith('_test')) {
  console.error(`Refusing to run tests on "${dbName}": the test database name must end in _test.`)
  process.exit(1)
}
// Each test file gets its own schema (test files run at the same time).
const SCHEMA = `t_${process.pid}`
const withSchema = new URL(url)
withSchema.searchParams.set('options', `-c search_path=${SCHEMA}`)
// set before the server code reads its settings
process.env.DATABASE_URL = withSchema.toString()
process.env.TRUST_PROXY = '1' // so each test can use its own visitor IP (rate limits)
process.env.COOKIE_SECURE = '0'
process.env.UPLOAD_DIR = path.join(os.tmpdir(), `lale-test-uploads-${process.pid}`) // never the real photos folder
process.env.GOOGLE_CLIENT_ID = 'test-client-id.apps.googleusercontent.com'

const { config, SERVER_DIR } = await import('../src/config.js')
const { pool } = await import('../src/db.js')
const { createApp } = await import('../src/app.js')
const { googleClient } = await import('../src/google.js')
export { config, pool }

export const CLIENT_ID = config.googleClientId

// Removes this file's schema (call when the file's tests are done).
export async function dropSchema() {
  await pool.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`)
}

// Empty database with every migration applied.
export async function resetDatabase() {
  await pool.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE; CREATE SCHEMA ${SCHEMA};`)
  const dir = path.join(SERVER_DIR, 'migrations')
  for (const f of fs.readdirSync(dir).filter((n) => n.endsWith('.sql')).sort()) {
    await pool.query(fs.readFileSync(path.join(dir, f), 'utf8'))
  }
}

export async function startServer() {
  const server = createApp()
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const base = `http://127.0.0.1:${server.address().port}`
  return { base, close: () => new Promise((resolve) => server.close(resolve)) }
}

// ---- fake Google ---------------------------------------------------------------
// Our own RSA key plays "Google". The verifier gets this key instead of
// downloading Google's, so tokens signed with any other key are forgeries.
const google = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 })
export const forger = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 })
const KID = 'test-key'
googleClient.getFederatedSignonCertsAsync = async () => ({
  certs: { [KID]: google.publicKey.export({ type: 'spki', format: 'pem' }) },
  format: 'PEM',
})

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
let nextSub = 100000

export function newSub() {
  return String(nextSub++)
}

// A Google ID token. `claims` overrides the defaults; `key` signs it.
export function idToken(claims = {}, { key = google.privateKey } = {}) {
  const now = Math.floor(Date.now() / 1000)
  const payload = {
    iss: 'https://accounts.google.com', aud: CLIENT_ID, azp: CLIENT_ID, iat: now, exp: now + 3600,
    sub: newSub(), email: 'someone@gmail.com', email_verified: true, given_name: 'Aýna', family_name: 'Gurbanowa',
    ...claims,
  }
  const head = b64({ alg: 'RS256', kid: KID, typ: 'JWT' }) + '.' + b64(payload)
  const sig = crypto.sign('RSA-SHA256', Buffer.from(head), key).toString('base64url')
  return `${head}.${sig}`
}

// ---- HTTP -------------------------------------------------------------------------
let ipCounter = 1

// A browser: keeps its cookies, has its own IP address.
export function browser(base) {
  const jar = new Map()
  const ip = `10.0.${Math.floor(ipCounter / 250)}.${(ipCounter++ % 250) + 1}`
  async function call(method, p, body) {
    const headers = { 'X-Lale': '1', 'X-Real-IP': ip }
    if (jar.size) headers.Cookie = [...jar].map(([k, v]) => `${k}=${v}`).join('; ')
    if (body !== undefined) headers['Content-Type'] = 'application/json'
    const res = await fetch(base + p, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) })
    for (const c of res.headers.getSetCookie()) {
      const [pair] = c.split(';')
      const i = pair.indexOf('=')
      const v = pair.slice(i + 1)
      if (v) jar.set(pair.slice(0, i), v)
      else jar.delete(pair.slice(0, i))
    }
    let data = null
    try { data = await res.json() } catch {}
    return { status: res.status, data, headers: res.headers }
  }
  return {
    ip,
    jar,
    get: (p) => call('GET', p),
    post: (p, body = {}) => call('POST', p, body),
    patch: (p, body = {}) => call('PATCH', p, body),
  }
}

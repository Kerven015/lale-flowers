import assert from 'node:assert/strict'
import { after, before, describe, test } from 'node:test'
import { CLIENT_ID, browser, config, forger, idToken, newSub, pool, resetDatabase, startServer } from './helpers.js'
import { hashPassword } from '../src/security.js'

let server
before(async () => {
  await resetDatabase()
  server = await startServer()
})
after(async () => {
  await server?.close()
  await pool.end()
})

const customerByEmail = async (email) => (await pool.query('SELECT * FROM customers WHERE lower(email) = $1', [email])).rows[0]
const sessionCount = async (id) => (await pool.query(`SELECT count(*)::int AS n FROM sessions WHERE customer_id = $1`, [id])).rows[0].n

async function registerWithPassword(email, password = 'secret123') {
  const b = browser(server.base)
  const r = await b.post('/api/auth/register', { first: 'Old', last: 'Owner', email, phone: '+993 61 234567', password })
  assert.equal(r.status, 201)
  return b
}

describe('config', () => {
  test('gives the browser the public Client ID', async () => {
    const r = await browser(server.base).get('/api/auth/config')
    assert.equal(r.status, 200)
    assert.deepEqual(r.data, { googleClientId: CLIENT_ID })
  })

  test('GOOGLE_CLIENT_ID unset: config is null and Google sign-in is refused', async () => {
    const saved = config.googleClientId
    config.googleClientId = null
    try {
      const b = browser(server.base)
      assert.deepEqual((await b.get('/api/auth/config')).data, { googleClientId: null })
      const r = await b.post('/api/auth/google', { credential: idToken() })
      assert.equal(r.status, 404)
      assert.equal(r.data.error, 'google_disabled')
    } finally {
      config.googleClientId = saved
    }
  })

  test('pages may open the Google pop-up (COOP header)', async () => {
    const r = await browser(server.base).get('/api/auth/config')
    assert.equal(r.headers.get('cross-origin-opener-policy'), 'same-origin-allow-popups')
    assert.equal(r.headers.get('referrer-policy'), 'strict-origin-when-cross-origin')
  })
})

describe('Google sign-in', () => {
  test('a new Google user is created, verified, without a password, signed in for 30 days', async () => {
    const b = browser(server.base)
    const sub = newSub()
    const r = await b.post('/api/auth/google', { credential: idToken({ sub, email: 'New.Person@Gmail.com' }), lang: 'ru' })
    assert.equal(r.status, 200)
    assert.equal(r.data.user.email, 'new.person@gmail.com')
    assert.equal(r.data.user.first, 'Aýna')
    assert.equal(r.data.user.google, true)
    assert.equal(r.data.user.hasPassword, false)
    assert.equal(r.data.user.emailVerified, true)
    assert.equal(r.data.user.password_hash, undefined)

    const row = await customerByEmail('new.person@gmail.com')
    assert.equal(row.password_hash, null)
    assert.ok(row.email_verified_at)
    assert.equal(row.lang, 'ru')
    const ident = (await pool.query(`SELECT * FROM user_identities WHERE provider = 'google' AND subject = $1`, [sub])).rows[0]
    assert.equal(ident.user_id, row.id)

    const cookie = r.headers.getSetCookie().find((c) => c.startsWith('lg_session='))
    assert.match(cookie, /HttpOnly/)
    assert.match(cookie, /SameSite=Lax/)
    assert.match(cookie, /Max-Age=2592000/)
    assert.equal((await b.get('/api/auth/me')).data.user.id, row.id)
  })

  test('the same sub signs in to the same user', async () => {
    const sub = newSub()
    const first = await browser(server.base).post('/api/auth/google', { credential: idToken({ sub, email: 'same@gmail.com' }) })
    const second = await browser(server.base).post('/api/auth/google', { credential: idToken({ sub, email: 'same@gmail.com' }) })
    assert.equal(second.status, 200)
    assert.equal(second.data.user.id, first.data.user.id)
    assert.equal((await pool.query(`SELECT count(*)::int AS n FROM customers WHERE lower(email) = 'same@gmail.com'`)).rows[0].n, 1)
  })

  test('a changed Google email still finds the same account', async () => {
    const sub = newSub()
    const first = await browser(server.base).post('/api/auth/google', { credential: idToken({ sub, email: 'before@gmail.com' }) })
    const second = await browser(server.base).post('/api/auth/google', { credential: idToken({ sub, email: 'after@gmail.com' }) })
    assert.equal(second.status, 200)
    assert.equal(second.data.user.id, first.data.user.id)
    assert.equal(await customerByEmail('after@gmail.com'), undefined) // no second account
    const ident = (await pool.query(`SELECT email FROM user_identities WHERE subject = $1`, [sub])).rows[0]
    assert.equal(ident.email, 'after@gmail.com')
  })

  test('an existing verified account is linked and keeps its password and sessions', async () => {
    const owner = await registerWithPassword('linked@gmail.com')
    const row = await customerByEmail('linked@gmail.com')
    await pool.query('UPDATE customers SET email_verified_at = now() WHERE id = $1', [row.id])

    const r = await browser(server.base).post('/api/auth/google', { credential: idToken({ email: 'linked@gmail.com' }) })
    assert.equal(r.status, 200)
    assert.equal(r.data.user.id, row.id)
    assert.equal(r.data.user.google, true)
    assert.equal(r.data.user.hasPassword, true)
    assert.equal((await owner.get('/api/auth/me')).data.user.id, row.id) // still signed in
  })

  test('an unverified existing account is linked, but loses its password and every session', async () => {
    const squatter = await registerWithPassword('victim@gmail.com', 'squatter-pass')
    const row = await customerByEmail('victim@gmail.com')
    assert.equal(row.email_verified_at, null)
    assert.equal(await sessionCount(row.id), 1)

    const owner = browser(server.base)
    const r = await owner.post('/api/auth/google', { credential: idToken({ email: 'victim@gmail.com' }) })
    assert.equal(r.status, 200)
    assert.equal(r.data.user.id, row.id)
    assert.equal(r.data.user.hasPassword, false)
    assert.equal(r.data.user.emailVerified, true)

    const after = await customerByEmail('victim@gmail.com')
    assert.equal(after.password_hash, null)
    assert.ok(after.email_verified_at)
    assert.equal((await squatter.get('/api/auth/me')).data.user, null) // squatter logged out
    assert.equal(await sessionCount(row.id), 1) // only the new Google login
    const login = await browser(server.base).post('/api/auth/login', { email: 'victim@gmail.com', password: 'squatter-pass' })
    assert.equal(login.status, 401)
  })

  test('blocked accounts are refused (Google and password)', async () => {
    const sub = newSub()
    const first = await browser(server.base).post('/api/auth/google', { credential: idToken({ sub, email: 'blocked@gmail.com' }) })
    await pool.query('UPDATE customers SET blocked_at = now() WHERE id = $1', [first.data.user.id])
    const r = await browser(server.base).post('/api/auth/google', { credential: idToken({ sub, email: 'blocked@gmail.com' }) })
    assert.equal(r.status, 403)
    assert.equal(r.data.error, 'account_blocked')

    // blocked account found by email (not linked yet)
    await registerWithPassword('blocked2@gmail.com', 'secret123')
    await pool.query(`UPDATE customers SET blocked_at = now() WHERE email = 'blocked2@gmail.com'`)
    const r2 = await browser(server.base).post('/api/auth/google', { credential: idToken({ email: 'blocked2@gmail.com' }) })
    assert.equal(r2.status, 403)
    assert.equal(r2.data.error, 'account_blocked')
    assert.equal((await pool.query(`SELECT count(*)::int AS n FROM user_identities WHERE email = 'blocked2@gmail.com'`)).rows[0].n, 0)
    const pw = await browser(server.base).post('/api/auth/login', { email: 'blocked2@gmail.com', password: 'secret123' })
    assert.equal(pw.status, 403)
    assert.equal(pw.data.error, 'account_blocked')
  })
})

describe('bad tokens are rejected with google_failed', () => {
  const cases = {
    'garbage': () => 'not-a-token',
    'empty': () => '',
    'not a string': () => ({ sub: '1' }),
    'very long': () => 'a'.repeat(5000),
    'forged signature (other key)': () => idToken({ email: 'forged@gmail.com' }, { key: forger.privateKey }),
    'wrong audience': () => idToken({ aud: 'someone-else.apps.googleusercontent.com', email: 'aud@gmail.com' }),
    'email_verified: false': () => idToken({ email_verified: false, email: 'unverified@gmail.com' }),
    'email_verified missing': () => idToken({ email_verified: undefined, email: 'noverified@gmail.com' }),
    'email_verified as text': () => idToken({ email_verified: 'true', email: 'text@gmail.com' }),
    'expired': () => idToken({ exp: Math.floor(Date.now() / 1000) - 3600, iat: Math.floor(Date.now() / 1000) - 7200 }),
    'wrong issuer': () => idToken({ iss: 'https://evil.example.com' }),
    'no email': () => idToken({ email: undefined }),
    'payload changed after signing': () => {
      const [h, , s] = idToken({ email: 'real@gmail.com' }).split('.')
      const fake = Buffer.from(JSON.stringify({ iss: 'https://accounts.google.com', aud: CLIENT_ID, sub: '1', email: 'admin@gmail.com', email_verified: true, exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url')
      return `${h}.${fake}.${s}`
    },
  }
  for (const [name, make] of Object.entries(cases)) {
    test(name, async () => {
      const r = await browser(server.base).post('/api/auth/google', { credential: make() })
      assert.equal(r.status, 401)
      assert.deepEqual(r.data, { error: 'google_failed' })
    })
  }

  test('no account was created by any bad token', async () => {
    const { rows } = await pool.query(`SELECT email FROM customers WHERE email IN ('forged@gmail.com', 'aud@gmail.com', 'unverified@gmail.com', 'admin@gmail.com', 'text@gmail.com')`)
    assert.deepEqual(rows, [])
  })

  test('the user data the browser sends next to the token is ignored', async () => {
    const r = await browser(server.base).post('/api/auth/google', {
      credential: idToken({ email: 'honest@gmail.com' }), email: 'boss@gmail.com', first: 'Boss', sub: '1',
    })
    assert.equal(r.status, 200)
    assert.equal(r.data.user.email, 'honest@gmail.com')
    assert.equal(r.data.user.first, 'Aýna')
  })
})

describe('security checks on POST /api/auth/google', () => {
  test('needs the site header and same origin (CSRF)', async () => {
    const noHeader = await fetch(server.base + '/api/auth/google', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ credential: idToken() }),
    })
    assert.equal(noHeader.status, 403)
    const foreign = await fetch(server.base + '/api/auth/google', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Lale': '1', Origin: 'https://evil.example.com' },
      body: JSON.stringify({ credential: idToken() }),
    })
    assert.equal(foreign.status, 403)
  })

  test('is rate limited per IP', async () => {
    const b = browser(server.base)
    let last
    for (let i = 0; i < 31; i++) last = await b.post('/api/auth/google', { credential: 'garbage' })
    assert.equal(last.status, 429)
    assert.equal(last.data.error, 'rate_limited')
    // another IP is not affected
    assert.equal((await browser(server.base).post('/api/auth/google', { credential: 'garbage' })).status, 401)
  })
})

describe('passwords on Google accounts', () => {
  test('password sign-in on a Google-only account fails like a wrong password', async () => {
    await browser(server.base).post('/api/auth/google', { credential: idToken({ email: 'gonly@gmail.com' }) })
    for (const password of ['', 'anything', 'null']) {
      const r = await browser(server.base).post('/api/auth/login', { email: 'gonly@gmail.com', password })
      assert.equal(r.status, 401)
      assert.deepEqual(r.data, { error: 'invalid_credentials' })
    }
    // same answer as an email nobody has
    const none = await browser(server.base).post('/api/auth/login', { email: 'nobody@gmail.com', password: 'anything' })
    assert.deepEqual(none.data, { error: 'invalid_credentials' })
  })

  test('takes about as long as a wrong password', async () => {
    await registerWithPassword('timing@gmail.com')
    await browser(server.base).post('/api/auth/google', { credential: idToken({ email: 'gtiming@gmail.com' }) })
    const time = async (email) => {
      const t = performance.now()
      await browser(server.base).post('/api/auth/login', { email, password: 'wrong-password' })
      return performance.now() - t
    }
    await time('timing@gmail.com') // warm up
    let wrong = 0, google = 0
    for (let i = 0; i < 3; i++) { wrong += await time('timing@gmail.com'); google += await time('gtiming@gmail.com') }
    // both run one scrypt hash; a Google-only account must not answer instantly
    assert.ok(google > wrong * 0.4, `google-only ${google.toFixed(0)}ms vs wrong password ${wrong.toFixed(0)}ms`)
  })

  test('the first password needs no current one; changing it later does', async () => {
    const b = browser(server.base)
    await b.post('/api/auth/google', { credential: idToken({ email: 'setpass@gmail.com' }) })

    const first = await b.post('/api/auth/password', { next: 'first-pass' })
    assert.equal(first.status, 200)
    assert.equal(first.data.user.hasPassword, true)
    assert.equal((await browser(server.base).post('/api/auth/login', { email: 'setpass@gmail.com', password: 'first-pass' })).status, 200)

    const noCurrent = await b.post('/api/auth/password', { next: 'second-pass' })
    assert.equal(noCurrent.status, 401)
    assert.equal(noCurrent.data.error, 'invalid_credentials')
    const wrongCurrent = await b.post('/api/auth/password', { current: 'nope', next: 'second-pass' })
    assert.equal(wrongCurrent.status, 401)
    const ok = await b.post('/api/auth/password', { current: 'first-pass', next: 'second-pass' })
    assert.equal(ok.status, 200)
    assert.equal((await browser(server.base).post('/api/auth/login', { email: 'setpass@gmail.com', password: 'second-pass' })).status, 200)
  })
})

describe('changing the email', () => {
  test('needs a password first on a Google-only account', async () => {
    const b = browser(server.base)
    await b.post('/api/auth/google', { credential: idToken({ email: 'nopass@gmail.com' }) })
    const r = await b.post('/api/auth/email', { email: 'other@gmail.com', password: '' })
    assert.equal(r.status, 409)
    assert.equal(r.data.error, 'password_required')
  })

  test('needs the right password and resets email_verified_at', async () => {
    const b = browser(server.base)
    const sub = newSub()
    await b.post('/api/auth/google', { credential: idToken({ sub, email: 'mover@gmail.com' }) })
    await b.post('/api/auth/password', { next: 'mover-pass' })

    assert.equal((await b.post('/api/auth/email', { email: 'moved@example.com', password: 'wrong' })).status, 401)
    const r = await b.post('/api/auth/email', { email: 'Moved@Example.com', password: 'mover-pass' })
    assert.equal(r.status, 200)
    assert.equal(r.data.user.email, 'moved@example.com')
    assert.equal(r.data.user.emailVerified, false)
    assert.equal((await customerByEmail('moved@example.com')).email_verified_at, null)

    // Google (same sub) still finds the account, but does not vouch for the new address
    const again = await browser(server.base).post('/api/auth/google', { credential: idToken({ sub, email: 'mover@gmail.com' }) })
    assert.equal(again.data.user.email, 'moved@example.com')
    assert.equal(again.data.user.emailVerified, false)
  })

  test('cannot take an email another account uses', async () => {
    await registerWithPassword('taken@gmail.com')
    const b = await registerWithPassword('taker@gmail.com', 'taker-pass')
    const r = await b.post('/api/auth/email', { email: 'taken@gmail.com', password: 'taker-pass' })
    assert.equal(r.status, 409)
    assert.equal(r.data.error, 'email_taken')
  })
})

describe('admin', () => {
  let admin
  before(async () => {
    await pool.query(`INSERT INTO admins (username, password_hash) VALUES ('boss', $1)`, [await hashPassword('admin-pass')])
    admin = browser(server.base)
    assert.equal((await admin.post('/api/admin/login', { username: 'boss', password: 'admin-pass' })).status, 200)
  })

  test('the customer list shows how each customer signs in', async () => {
    await browser(server.base).post('/api/auth/google', { credential: idToken({ email: 'listg@gmail.com' }) })
    await registerWithPassword('listp@gmail.com')
    const { data } = await admin.get('/api/admin/customers?q=list')
    const g = data.customers.find((c) => c.email === 'listg@gmail.com')
    const p = data.customers.find((c) => c.email === 'listp@gmail.com')
    assert.deepEqual([g.google, g.password, g.blocked], [true, false, false])
    assert.deepEqual([p.google, p.password, p.blocked], [false, true, false])
  })

  test('blocking logs the customer out; unblocking lets them back in', async () => {
    const sub = newSub()
    const b = browser(server.base)
    const r = await b.post('/api/auth/google', { credential: idToken({ sub, email: 'toblock@gmail.com' }) })
    const id = r.data.user.id

    assert.equal((await admin.post(`/api/admin/customers/${id}/block`, { blocked: true })).status, 200)
    assert.equal((await b.get('/api/auth/me')).data.user, null)
    assert.equal((await browser(server.base).post('/api/auth/google', { credential: idToken({ sub, email: 'toblock@gmail.com' }) })).data.error, 'account_blocked')
    assert.equal((await admin.get('/api/admin/customers?q=toblock')).data.customers[0].blocked, true)

    assert.equal((await admin.post(`/api/admin/customers/${id}/block`, { blocked: false })).status, 200)
    assert.equal((await browser(server.base).post('/api/auth/google', { credential: idToken({ sub, email: 'toblock@gmail.com' }) })).status, 200)
  })

  test('block needs an admin', async () => {
    const r = await browser(server.base).post('/api/admin/customers/1/block', { blocked: true })
    assert.equal(r.status, 401)
  })

  test('deleting a customer removes their Google link too', async () => {
    const sub = newSub()
    const r = await browser(server.base).post('/api/auth/google', { credential: idToken({ sub, email: 'gone@gmail.com' }) })
    const del = await fetch(`${server.base}/api/admin/customers/${r.data.user.id}`, {
      method: 'DELETE', headers: { 'X-Lale': '1', 'X-Real-IP': admin.ip, Cookie: [...admin.jar].map(([k, v]) => `${k}=${v}`).join('; ') },
    })
    assert.equal(del.status, 200)
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM user_identities WHERE subject = $1', [sub])).rows[0].n, 0)
  })
})

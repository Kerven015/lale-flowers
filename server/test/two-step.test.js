// Two-step login for the admin panel: turning it on, logging in with the
// code from the phone, backup codes, limits, turning it off.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { after, before, beforeEach, test } from 'node:test'
import { browser, dropSchema, pool, resetDatabase, startServer } from './helpers.js'
import { hashPassword, resetLimits } from '../src/security.js'
import { codeFor, stepAt } from '../src/twoStep.js'

const PASSWORD = 'admin-pass-long'
let server
before(async () => { await resetDatabase(); server = await startServer() })
after(async () => { await server?.close(); await dropSchema(); await pool.end() })
beforeEach(() => resetLimits())

// Each test has its own admin (a code from the phone works only once, and only
// for about 90 seconds, so the tests must not share them).
let n = 0
async function newAdmin() {
  const username = `boss${n++}`
  await pool.query('INSERT INTO admins (username, password_hash) VALUES ($1, $2)', [username, await hashPassword(PASSWORD)])
  const b = browser(server.base)
  assert.equal((await b.post('/api/admin/login', { username, password: PASSWORD })).status, 200)
  return Object.assign(b, { username })
}

// Turns two-step login on, like the admin does in Settings.
// The phone's code one step back is used, so "now" and "next" stay free for the test.
async function turnOn(b) {
  const start = await b.post('/api/admin/two-step/start', { password: PASSWORD })
  assert.equal(start.status, 200)
  const r = await b.post('/api/admin/two-step/enable', { code: codeFor(start.data.secret, stepAt() - 1) })
  assert.equal(r.status, 200)
  return { secret: start.data.secret, backupCodes: r.data.backupCodes }
}

const loginPassword = (username) => {
  const b = browser(server.base)
  return b.post('/api/admin/login', { username, password: PASSWORD }).then((r) => ({ b, r }))
}

test('turning it on: password again, a QR code, then the first code from the phone', async () => {
  const a = await newAdmin()
  assert.deepEqual((await a.get('/api/admin/two-step')).data, { enabled: false, backupCodesLeft: 0 })
  assert.equal((await a.post('/api/admin/two-step/start', { password: 'wrong' })).status, 401)
  const start = await a.post('/api/admin/two-step/start', { password: PASSWORD })
  assert.match(start.data.secret, /^[A-Z2-7]{32}$/)
  assert.match(start.data.qr, /^data:image\/svg\+xml;base64,/)
  // a wrong code does not turn it on
  const wrong = await a.post('/api/admin/two-step/enable', { code: '000000' === codeFor(start.data.secret, stepAt()) ? '111111' : '000000' })
  assert.equal(wrong.status, 400)
  assert.deepEqual(wrong.data.fields, { code: 'wrong' })
  assert.equal((await a.get('/api/admin/two-step')).data.enabled, false)

  // another computer that was logged in is logged out when it is turned on
  const other = (await loginPassword(a.username)).b
  const on = await a.post('/api/admin/two-step/enable', { code: codeFor(start.data.secret, stepAt()) })
  assert.equal(on.status, 200)
  assert.equal(on.data.backupCodes.length, 8)
  assert.ok(on.data.backupCodes.every((c) => /^[a-z2-9]{4}-[a-z2-9]{4}$/.test(c)))
  assert.deepEqual((await a.get('/api/admin/two-step')).data, { enabled: true, backupCodesLeft: 8 })
  assert.equal((await other.get('/api/admin/me')).data.admin, null)
  // the secret is not shown again
  assert.equal((await a.post('/api/admin/two-step/start', { password: PASSWORD })).status, 409)
})

test('logging in: the password alone gives no session; the code does, and works only once', async () => {
  const a = await newAdmin()
  const { secret } = await turnOn(a)
  const { b, r } = await loginPassword(a.username)
  assert.equal(r.status, 200)
  assert.equal(r.data.twoStep, true)
  assert.equal(r.data.admin, undefined)
  assert.equal(b.jar.size, 0) // no cookie yet
  assert.equal((await b.get('/api/admin/me')).data.admin, null)
  assert.equal((await b.get('/api/admin/summary')).status, 401)

  const code = codeFor(secret, stepAt())
  const ok = await b.post('/api/admin/login/code', { ticket: r.data.ticket, code })
  assert.equal(ok.status, 200)
  assert.equal(ok.data.admin.username, a.username)
  assert.equal((await b.get('/api/admin/summary')).status, 200)
  // the ticket is used up
  assert.equal((await b.post('/api/admin/login/code', { ticket: r.data.ticket, code })).data.error, 'login_expired')

  // someone who saw that code cannot use it again
  const again = await loginPassword(a.username)
  const replay = await again.b.post('/api/admin/login/code', { ticket: again.r.data.ticket, code })
  assert.equal(replay.status, 401)
  assert.equal(replay.data.error, 'invalid_code')
  // the next code from the phone works
  assert.equal((await again.b.post('/api/admin/login/code', { ticket: again.r.data.ticket, code: codeFor(secret, stepAt() + 1) })).status, 200)
})

test('a wrong password still gives no ticket', async () => {
  const a = await newAdmin()
  await turnOn(a)
  const r = await browser(server.base).post('/api/admin/login', { username: a.username, password: 'wrong' })
  assert.equal(r.status, 401)
  assert.equal(r.data.ticket, undefined)
})

test('backup codes: each works once instead of the phone', async () => {
  const a = await newAdmin()
  const { backupCodes } = await turnOn(a)
  const first = await loginPassword(a.username)
  // written with capitals and without the dash: still accepted
  const ok = await first.b.post('/api/admin/login/code', { ticket: first.r.data.ticket, code: backupCodes[0].replace('-', '').toUpperCase() })
  assert.equal(ok.status, 200)
  assert.equal(ok.data.backupCodesLeft, 7)
  const second = await loginPassword(a.username)
  assert.equal((await second.b.post('/api/admin/login/code', { ticket: second.r.data.ticket, code: backupCodes[0] })).data.error, 'invalid_code')
  assert.equal((await second.b.post('/api/admin/login/code', { ticket: second.r.data.ticket, code: backupCodes[1] })).status, 200)
  const log = await pool.query(`SELECT details FROM admin_log WHERE admin_name = $1 AND action = 'admin.login' ORDER BY id DESC LIMIT 1`, [a.username])
  assert.deepEqual(log.rows[0].details, { backupCode: true })
})

test('new backup codes replace the old ones', async () => {
  const a = await newAdmin()
  const { secret, backupCodes } = await turnOn(a)
  assert.equal((await a.post('/api/admin/two-step/backup-codes', { code: '12' })).status, 400)
  const r = await a.post('/api/admin/two-step/backup-codes', { code: codeFor(secret, stepAt()) })
  assert.equal(r.status, 200)
  assert.equal(r.data.backupCodes.length, 8)
  const l = await loginPassword(a.username)
  assert.equal((await l.b.post('/api/admin/login/code', { ticket: l.r.data.ticket, code: backupCodes[2] })).status, 401)
  assert.equal((await l.b.post('/api/admin/login/code', { ticket: l.r.data.ticket, code: r.data.backupCodes[2] })).status, 200)
})

test('guessing codes: 5 wrong tries end the ticket; 10 per admin block for a while', async () => {
  const a = await newAdmin()
  const { secret } = await turnOn(a)
  const right = codeFor(secret, stepAt())
  const wrong = right === '123456' ? '654321' : '123456'
  const l = await loginPassword(a.username)
  for (let i = 0; i < 5; i++) assert.equal((await l.b.post('/api/admin/login/code', { ticket: l.r.data.ticket, code: wrong })).data.error, 'invalid_code')
  assert.equal((await l.b.post('/api/admin/login/code', { ticket: l.r.data.ticket, code: right })).data.error, 'login_expired')
  // a new ticket from another address: 5 more wrong codes, then even the right one waits
  const l2 = await loginPassword(a.username)
  for (let i = 0; i < 5; i++) await l2.b.post('/api/admin/login/code', { ticket: l2.r.data.ticket, code: wrong })
  const l3 = await loginPassword(a.username)
  const blocked = await l3.b.post('/api/admin/login/code', { ticket: l3.r.data.ticket, code: right })
  assert.equal(blocked.status, 429)
  const failed = await pool.query(`SELECT count(*)::int AS n FROM admin_log WHERE admin_name = $1 AND action = 'admin.code_failed'`, [a.username])
  assert.equal(failed.rows[0].n, 10)
})

test('no ticket, no login', async () => {
  const b = browser(server.base)
  for (const ticket of [undefined, '', 'made-up', 'x'.repeat(500)]) {
    const r = await b.post('/api/admin/login/code', { ticket, code: '123456' })
    assert.equal(r.status, 401)
    assert.equal(r.data.error, 'login_expired')
  }
})

test('turning it off needs the password and a code; then the password is enough again', async () => {
  const a = await newAdmin()
  const { secret, backupCodes } = await turnOn(a)
  assert.equal((await a.post('/api/admin/two-step/disable', { password: 'wrong', code: codeFor(secret, stepAt()) })).status, 401)
  assert.equal((await a.post('/api/admin/two-step/disable', { password: PASSWORD, code: 'nope' })).status, 400)
  assert.equal((await a.post('/api/admin/two-step/disable', { password: PASSWORD, code: backupCodes[0] })).status, 200)
  assert.deepEqual((await a.get('/api/admin/two-step')).data, { enabled: false, backupCodesLeft: 0 })
  const { r } = await loginPassword(a.username)
  assert.equal(r.data.admin.username, a.username)
  const actions = (await pool.query(`SELECT action FROM admin_log WHERE admin_name = $1 ORDER BY id`, [a.username])).rows.map((x) => x.action)
  assert.ok(actions.includes('admin.two_step_on') && actions.includes('admin.two_step_off'))
})

test('npm run two-step-off: turns it off from the server (phone and backup codes lost)', async () => {
  const a = await newAdmin()
  await turnOn(a)
  const script = fileURLToPath(new URL('../scripts/two-step-off.js', import.meta.url))
  const run = spawnSync(process.execPath, [script], { input: `${a.username.toUpperCase()}\n`, env: process.env, encoding: 'utf8' })
  assert.equal(run.status, 0, run.stderr)
  assert.match(run.stdout, /Two-step login is off/)
  assert.equal((await a.get('/api/admin/me')).data.admin, null) // logged out everywhere
  const { r } = await loginPassword(a.username)
  assert.equal(r.data.admin.username, a.username)
  const left = await pool.query('SELECT count(*)::int AS n FROM admin_backup_codes b JOIN admins a ON a.id = b.admin_id WHERE a.username = $1', [a.username])
  assert.equal(left.rows[0].n, 0)
  // unknown admin: an error, nothing changed
  const bad = spawnSync(process.execPath, [script], { input: 'nobody\n', env: process.env, encoding: 'utf8' })
  assert.equal(bad.status, 1)
  assert.match(bad.stderr, /no admin "nobody"/)
})

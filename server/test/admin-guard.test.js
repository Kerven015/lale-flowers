// Every /api/admin route (except sign-in, sign-out and "am I signed in?")
// refuses requests without an admin session, and a customer session is not
// enough either. Checked by calling each route directly, the way an attacker
// would, not through the admin panel.
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { browser, dropSchema, pool, resetDatabase, startServer } from './helpers.js'

const { router } = await import('../src/app.js')
const OPEN = new Set(['POST /api/admin/login', 'POST /api/admin/logout', 'GET /api/admin/me'])

let server
before(async () => { await resetDatabase(); server = await startServer() })
after(async () => { await server?.close(); await dropSchema(); await pool.end() })

const adminRoutes = router.routes
  .filter((r) => r.pattern.startsWith('/api/admin'))
  .map((r) => ({ method: r.method, path: r.pattern.replace(/:\w+/g, '1') }))

test('there are admin routes to check', () => {
  assert.ok(adminRoutes.length >= 25, `found ${adminRoutes.length}`)
})

test('no admin route works without an admin session (also not with a customer session)', async () => {
  const guest = browser(server.base)
  const customer = browser(server.base)
  assert.equal((await customer.post('/api/auth/register', { first: 'A', last: 'B', email: 'guard@x.com', phone: '+993 61 234567', password: 'secret123' })).status, 201)
  const checked = []
  for (const { method, path } of adminRoutes) {
    if (OPEN.has(`${method} ${path}`)) continue
    for (const who of [guest, customer]) {
      const headers = { 'X-Lale': '1', 'X-Real-IP': who.ip, 'Content-Type': 'application/json' }
      if (who.jar.size) headers.Cookie = [...who.jar].map(([k, v]) => `${k}=${v}`).join('; ')
      const res = await fetch(server.base + path, { method, headers, body: method === 'GET' ? undefined : JSON.stringify({ blocked: true, ids: [1], status: 'cancelled', change: 5, reason: 'received' }) })
      assert.equal(res.status, 401, `${method} ${path} answered ${res.status}`)
      assert.deepEqual(await res.json(), { error: 'admin_login_required' })
    }
    checked.push(`${method} ${path}`)
  }
  assert.equal(checked.length, adminRoutes.length - OPEN.size) // every protected route was called
  // nothing was changed by any of these calls
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM admin_log')).rows[0].n, 0)
})

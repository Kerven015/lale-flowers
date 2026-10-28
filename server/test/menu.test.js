// Occasions (add, rename, reorder, delete) and the top menu bar.
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { after, before, test } from 'node:test'
import { browser, config, dropSchema, pool, resetDatabase, startServer } from './helpers.js'
import { hashPassword } from '../src/security.js'

let server
let admin
before(async () => {
  await resetDatabase()
  server = await startServer()
  await pool.query(`INSERT INTO admins (username, password_hash) VALUES ('boss', $1)`, [await hashPassword('admin-pass-long')])
  admin = browser(server.base)
  assert.equal((await admin.post('/api/admin/login', { username: 'boss', password: 'admin-pass-long' })).status, 200)
})
after(async () => {
  await server?.close()
  await fs.rm(config.uploadDir, { recursive: true, force: true })
  await dropSchema()
  await pool.end()
})

async function call(method, p, body) {
  const res = await fetch(server.base + p, {
    method,
    headers: { 'X-Lale': '1', 'X-Real-IP': admin.ip, 'Content-Type': 'application/json', Cookie: [...admin.jar].map(([k, v]) => `${k}=${v}`).join('; ') },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  return { status: res.status, data: await res.json().catch(() => null) }
}
const shop = async () => (await browser(server.base).get('/api/products')).data
const occ = (data, key) => data.occasions.find((o) => o.key === key)
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
const flower = (occasions, extra = {}) => ({ name: 'Tulip', type: 'tulips', occasions, price: 100, lang: 'tm', images: [PNG], ...extra })

test('the shop gets the occasions and the top menu with the flowers', async () => {
  const data = await shop()
  assert.deepEqual(data.occasions.map((o) => o.key), ['birthday', 'love', 'wedding', 'congrats', 'thanks', 'home'])
  assert.deepEqual(occ(data, 'birthday').names, { tm: 'Doglan gün', ru: 'День рождения', tr: 'Doğum günü' })
  assert.deepEqual(data.menu, [
    { type: 'occasion', key: 'birthday' }, { type: 'occasion', key: 'love' },
    { type: 'category', key: 'roses' }, { type: 'category', key: 'bouquets' }, { type: 'category', key: 'gifts' },
  ])
})

test('adding an occasion; flowers can be shown under it', async () => {
  const r = await call('POST', '/api/admin/occasions', { names: { tm: '8 Mart', ru: '8 Марта', tr: '8 Mart' } })
  assert.equal(r.status, 201)
  const m = occ(r.data, '8-mart')
  assert.equal(m.products, 0)
  const f = await call('POST', '/api/admin/products', flower(['8-mart', 'made-up']))
  assert.equal(f.status, 201, JSON.stringify(f.data))
  assert.deepEqual(f.data.product.occasions, ['8-mart']) // unknown ones are dropped
  assert.equal(occ((await call('GET', '/api/admin/occasions')).data, '8-mart').products, 1)
  // nothing real ticked: refused
  assert.deepEqual((await call('POST', '/api/admin/products', flower(['made-up']))).data.fields, { occasions: 'occasions' })
  assert.ok(occ(await shop(), '8-mart'))
})

test('an address is never shared by a category and an occasion', async () => {
  const o = await call('POST', '/api/admin/occasions', { names: { tm: 'Roses' } })
  assert.ok(occ(o.data, 'roses-2'), 'the category "roses" exists')
  const c = await call('POST', '/api/admin/categories', { names: { tm: 'Wedding' } })
  assert.ok(c.data.categories.find((x) => x.key === 'wedding-2'), 'the occasion "wedding" exists')
})

test('renaming and reordering occasions', async () => {
  const list = (await call('GET', '/api/admin/occasions')).data.occasions
  const love = list.find((o) => o.key === 'love')
  const r = await call('PUT', `/api/admin/occasions/${love.id}`, { names: { tm: 'Söýgi', ru: 'Любовь', tr: 'Aşk' } })
  assert.equal(occ(r.data, 'love').names.ru, 'Любовь')
  const ids = [love.id, ...list.filter((o) => o.id !== love.id).map((o) => o.id)]
  const moved = await call('POST', '/api/admin/occasions/order', { ids })
  assert.equal(moved.data.occasions[0].key, 'love')
  assert.equal((await shop()).occasions[0].names.ru, 'Любовь')
})

test('the top menu: choose, reorder, refuse unknown or repeated links', async () => {
  const items = [{ type: 'category', key: 'tulips' }, { type: 'occasion', key: '8-mart' }, { type: 'occasion', key: 'birthday' }]
  const r = await call('PUT', '/api/admin/menu', { items })
  assert.equal(r.status, 200)
  assert.deepEqual((await call('GET', '/api/admin/menu')).data.items, items)
  assert.deepEqual((await shop()).menu, items)
  for (const bad of [
    [{ type: 'category', key: 'nope' }],
    [{ type: 'page', key: 'roses' }],
    [{ type: 'occasion', key: 'birthday' }, { type: 'occasion', key: 'birthday' }],
    Array.from({ length: 11 }, () => ({ type: 'occasion', key: 'birthday' })),
  ]) assert.equal((await call('PUT', '/api/admin/menu', { items: bad })).status, 400, JSON.stringify(bad).slice(0, 60))
  // an empty menu is allowed (only Home, Flowers, Catalog ... stay)
  assert.equal((await call('PUT', '/api/admin/menu', { items: [] })).status, 200)
  await call('PUT', '/api/admin/menu', { items })
})

test('deleting an occasion takes it off the menu and off the flowers', async () => {
  const list = (await call('GET', '/api/admin/occasions')).data.occasions
  const m = list.find((o) => o.key === '8-mart')
  const r = await call('DELETE', `/api/admin/occasions/${m.id}`)
  assert.equal(r.status, 200)
  assert.equal(occ(r.data, '8-mart'), undefined)
  assert.deepEqual((await shop()).menu, [{ type: 'category', key: 'tulips' }, { type: 'occasion', key: 'birthday' }])
  const { rows } = await pool.query(`SELECT count(*)::int AS n FROM products WHERE occasions ? '8-mart'`)
  assert.equal(rows[0].n, 0)
})

test('deleting a category takes it off the menu too', async () => {
  const c = (await call('POST', '/api/admin/categories', { names: { tm: 'Kaktuslar' } })).data.categories.find((x) => x.key === 'kaktuslar')
  await call('PUT', '/api/admin/menu', { items: [{ type: 'category', key: 'kaktuslar' }, { type: 'occasion', key: 'birthday' }] })
  assert.equal((await call('DELETE', `/api/admin/categories/${c.id}`)).status, 200)
  assert.deepEqual((await call('GET', '/api/admin/menu')).data.items, [{ type: 'occasion', key: 'birthday' }])
  const actions = (await pool.query(`SELECT DISTINCT action FROM admin_log WHERE action LIKE 'occasion.%' OR action = 'menu.update'`)).rows.map((x) => x.action)
  for (const a of ['occasion.create', 'occasion.update', 'occasion.order', 'occasion.delete', 'menu.update']) assert.ok(actions.includes(a), a)
})

test('flowers never edited get their old occasions written in (migration 010)', async () => {
  const sql = await fs.readFile(new URL('../migrations/010_occasions_menu.sql', import.meta.url), 'utf8')
  const update = sql.slice(sql.indexOf('UPDATE products p'))
  await pool.query(`INSERT INTO products (id, slug, cat, price, in_stock, i18n, occasions)
    VALUES (9, 'old', 'roses', 100, true, '{}', NULL), (99, 'other', 'other', 100, true, '{}', NULL)`)
  await pool.query(update)
  const { rows } = await pool.query('SELECT id, occasions FROM products WHERE id IN (9, 99) ORDER BY id')
  assert.deepEqual(rows[0].occasions, ['birthday', 'congrats', 'roses'])
  assert.deepEqual(rows[1].occasions, [])
})

test('guests cannot change occasions or the menu', async () => {
  const g = browser(server.base)
  assert.equal((await g.post('/api/admin/occasions', { names: { tm: 'X' } })).status, 401)
  const put = await fetch(server.base + '/api/admin/menu', { method: 'PUT', headers: { 'X-Lale': '1', 'Content-Type': 'application/json' }, body: '{"items":[]}' })
  assert.equal(put.status, 401)
})

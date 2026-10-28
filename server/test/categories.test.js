// Categories the admin adds: create, rename, reorder, delete; flowers can be
// put in them; the shop gets them with the flower list.
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { after, before, test } from 'node:test'
import { browser, config, dropSchema, pool, resetDatabase, startServer } from './helpers.js'
import { hashPassword } from '../src/security.js'
import { latinSlug } from '../src/categories.js'

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
const add = (names) => call('POST', '/api/admin/categories', { names })
const byKey = (data, key) => data.categories.find((c) => c.key === key)
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
const productBody = (type, extra = {}) => ({ name: 'Peony', type, occasions: ['birthday'], price: 100, lang: 'tm', images: [PNG], ...extra })

test('addresses are made from the name, in latin letters', () => {
  assert.equal(latinSlug('Pion gülleri'), 'pion-gulleri')
  assert.equal(latinSlug('Пионы и розы'), 'piony-i-rozy')
  assert.equal(latinSlug('Şakayık'), 'sakayik')
  assert.equal(latinSlug('Ýaşyl ösümlikler'), 'yasyl-osumlikler')
})

test('adding a category: names in three languages; it shows up in the shop', async () => {
  const r = await add({ tm: 'Pion gülleri', ru: 'Пионы', tr: 'Şakayıklar' })
  assert.equal(r.status, 201)
  const c = byKey(r.data, 'pion-gulleri')
  assert.deepEqual(c.names, { tm: 'Pion gülleri', ru: 'Пионы', tr: 'Şakayıklar' })
  assert.equal(c.products, 0)
  // the shop's own categories come first, then the new one
  assert.deepEqual(r.data.categories.slice(0, 5).map((b) => b.key), ['roses', 'tulips', 'bouquets', 'gifts', 'plants'])
  assert.equal(r.data.categories.at(-1).key, 'pion-gulleri')
  const shop = await browser(server.base).get('/api/products')
  assert.deepEqual(shop.data.categories.find((x) => x.key === 'pion-gulleri').names.ru, 'Пионы')

  // only one name typed: the others get it too
  const one = await add({ tm: '', ru: 'Орхидеи', tr: '' })
  assert.deepEqual(byKey(one.data, 'orhidei').names, { tm: 'Орхидеи', ru: 'Орхидеи', tr: 'Орхидеи' })
  // no name at all
  const none = await add({ tm: ' ', ru: '', tr: '' })
  assert.equal(none.status, 400)
  assert.deepEqual(none.data.fields, { names: 'required' })
})

test('the same name twice, or a built-in name, gets its own address', async () => {
  const a = await add({ tm: 'Kaktus' })
  const b = await add({ tm: 'Kaktus' })
  assert.ok(byKey(a.data, 'kaktus'))
  assert.ok(byKey(b.data, 'kaktus-2'))
  const roses = await add({ tm: 'Roses' })
  assert.ok(byKey(roses.data, 'roses-2'), 'never the built-in "roses"')
  const birthday = await add({ tm: 'Birthday' })
  assert.ok(byKey(birthday.data, 'birthday-2'), 'never a menu tag')
  const cyr = await add({ tm: '', ru: '!!!', tr: '' })
  assert.ok(byKey(cyr.data, 'category'))
})

test('flowers can be put in a new category; an unknown one is refused', async () => {
  const r = await add({ tm: 'Lilialar', ru: 'Лилии', tr: 'Zambaklar' })
  const key = byKey(r.data, 'lilialar').key
  const ok = await call('POST', '/api/admin/products', productBody(key))
  assert.equal(ok.status, 201, JSON.stringify(ok.data))
  assert.equal(ok.data.product.cat, key)
  const bad = await call('POST', '/api/admin/products', productBody('no-such-category'))
  assert.equal(bad.status, 400)
  assert.equal(bad.data.fields.type, 'type')
  // counted in the admin list
  assert.equal(byKey((await call('GET', '/api/admin/categories')).data, key).products, 1)
  // moved to a built-in type with an edit
  const moved = await call('PUT', `/api/admin/products/${ok.data.product.id}`, productBody('roses', { images: ok.data.product.images }))
  assert.equal(moved.status, 200, JSON.stringify(moved.data))
  assert.equal(byKey((await call('GET', '/api/admin/categories')).data, key).products, 0)
})

test('renaming keeps the address; reordering changes the menu order', async () => {
  const r = await add({ tm: 'Gyzyl', ru: 'Красные', tr: 'Kırmızı' })
  const c = byKey(r.data, 'gyzyl')
  const renamed = await call('PUT', `/api/admin/categories/${c.id}`, { names: { tm: 'Gyzyl güller', ru: 'Красные', tr: 'Kırmızı' } })
  assert.equal(renamed.status, 200)
  assert.equal(byKey(renamed.data, 'gyzyl').names.tm, 'Gyzyl güller')
  assert.equal((await call('PUT', '/api/admin/categories/99999', { names: { tm: 'x' } })).status, 404)

  const ids = renamed.data.categories.map((x) => x.id)
  const reversed = await call('POST', '/api/admin/categories/order', { ids: [...ids].reverse() })
  assert.deepEqual(reversed.data.categories.map((x) => x.id), [...ids].reverse())
  const shop = await browser(server.base).get('/api/products')
  assert.deepEqual(shop.data.categories.map((x) => x.key), reversed.data.categories.map((x) => x.key))
  assert.equal((await call('POST', '/api/admin/categories/order', { ids: ['x'] })).status, 400)
})

test('a category with flowers cannot be deleted; an empty one can', async () => {
  const r = await add({ tm: 'Sowgat sebetleri' })
  const c = byKey(r.data, 'sowgat-sebetleri')
  const p = await call('POST', '/api/admin/products', productBody(c.key))
  const blocked = await call('DELETE', `/api/admin/categories/${c.id}`)
  assert.equal(blocked.status, 409)
  assert.deepEqual(blocked.data, { error: 'category_in_use', products: 1 })
  // a deleted flower does not count
  await call('POST', '/api/admin/products/delete', { ids: [p.data.product.id] })
  const del = await call('DELETE', `/api/admin/categories/${c.id}`)
  assert.equal(del.status, 200)
  assert.equal(byKey(del.data, 'sowgat-sebetleri'), undefined)
  const actions = (await pool.query(`SELECT action FROM admin_log WHERE action LIKE 'category.%'`)).rows.map((x) => x.action)
  for (const a of ['category.create', 'category.update', 'category.order', 'category.delete']) assert.ok(actions.includes(a), a)
})

test('the built-in categories can be renamed, moved and (when empty) deleted too', async () => {
  const list = (await call('GET', '/api/admin/categories')).data.categories
  const roses = byKey({ categories: list }, 'roses')
  assert.deepEqual(roses.names, { tm: 'Güller', ru: 'Розы', tr: 'Güller' })
  const renamed = await call('PUT', `/api/admin/categories/${roses.id}`, { names: { tm: 'Gyzyl güller', ru: 'Розы premium', tr: 'Güller' } })
  assert.equal(byKey(renamed.data, 'roses').names.ru, 'Розы premium') // the address stays "roses"
  const shop = await browser(server.base).get('/api/products')
  assert.equal(shop.data.categories.find((x) => x.key === 'roses').names.ru, 'Розы premium')

  // plants: move to the top, then delete it (nothing is in it)
  const plants = byKey({ categories: list }, 'plants')
  const ids = [plants.id, ...list.filter((x) => x.id !== plants.id).map((x) => x.id)]
  assert.equal((await call('POST', '/api/admin/categories/order', { ids })).data.categories[0].key, 'plants')
  assert.equal((await call('DELETE', `/api/admin/categories/${plants.id}`)).status, 200)
  // a flower can no longer be put in it ...
  assert.equal((await call('POST', '/api/admin/products', productBody('plants'))).data.fields.type, 'type')
  // ... until it is added back: same address as before
  const back = await add({ tm: 'Plants', ru: 'Растения', tr: 'Bitkiler' })
  assert.ok(byKey(back.data, 'plants'))
  assert.equal((await call('POST', '/api/admin/products', productBody('plants'))).status, 201)
})

test('customers and guests cannot change categories', async () => {
  const guest = browser(server.base)
  assert.equal((await guest.post('/api/admin/categories', { names: { tm: 'X' } })).status, 401)
})

// Admin → Categories: add, rename, reorder and delete the categories the
// admin made. The built-in ones (roses, tulips, ...) cannot be changed here.
import { query, transaction } from '../db.js'
import { HttpError, badRequest, sendJson } from '../http.js'
import { requireAdmin } from '../security.js'
import { logAdmin } from '../audit.js'
import { MAX_CATEGORIES, checkNames, freeSlug, loadCategories, toCategory } from '../categories.js'
import { TYPES } from '../products.js'
import { json } from './common.js'

const idParam = (ctx) => {
  const id = Number(ctx.params.id)
  if (!Number.isInteger(id) || id < 1 || id > 2147483647) throw new HttpError(404, 'not_found')
  return id
}

// Every category with how many flowers use it (built-in ones first).
async function adminList() {
  const { rows: counts } = await query('SELECT cat, count(*)::int AS n FROM products WHERE deleted_at IS NULL GROUP BY cat')
  const used = Object.fromEntries(counts.map((r) => [r.cat, r.n]))
  return {
    builtIn: TYPES.filter((t) => t !== 'other').map((key) => ({ key, products: used[key] || 0 })),
    categories: (await loadCategories()).map((r) => ({ id: r.id, ...toCategory(r), products: used[r.slug] || 0 })),
  }
}

export function register(router) {
  router.get('/api/admin/categories', requireAdmin, async (ctx) => {
    sendJson(ctx.res, 200, await adminList())
  })

  // Body: { names: { tm, ru, tr } }. The address is made from the name and never changes.
  router.post('/api/admin/categories', json(), requireAdmin, async (ctx) => {
    const form = checkNames(ctx.body)
    if (form.errors) throw badRequest(form.errors)
    await transaction(async (db) => {
      // one at a time, so two admins adding the same name get different addresses
      await db.query('LOCK TABLE categories IN SHARE ROW EXCLUSIVE MODE')
      const { rows } = await db.query('SELECT count(*)::int AS n, coalesce(max(sort_order), 0) AS last FROM categories')
      if (rows[0].n >= MAX_CATEGORIES) throw new HttpError(409, 'too_many_categories', { max: MAX_CATEGORIES })
      const slug = await freeSlug(db, form.names)
      const r = await db.query('INSERT INTO categories (slug, names, sort_order) VALUES ($1, $2, $3) RETURNING id',
        [slug, JSON.stringify(form.names), rows[0].last + 1])
      await logAdmin(ctx, 'category.create', `category:${r.rows[0].id}`, { slug, name: form.names.tm }, db)
    })
    sendJson(ctx.res, 201, await adminList())
  })

  // Rename (the address stays the same, so old links keep working).
  router.put('/api/admin/categories/:id', json(), requireAdmin, async (ctx) => {
    const id = idParam(ctx)
    const form = checkNames(ctx.body)
    if (form.errors) throw badRequest(form.errors)
    const r = await query('UPDATE categories SET names = $2 WHERE id = $1 RETURNING slug', [id, JSON.stringify(form.names)])
    if (!r.rowCount) throw new HttpError(404, 'not_found')
    await logAdmin(ctx, 'category.update', `category:${id}`, { slug: r.rows[0].slug, name: form.names.tm })
    sendJson(ctx.res, 200, await adminList())
  })

  // New order of the categories in the menus. Body: { ids: [3, 1, 2] }.
  router.post('/api/admin/categories/order', json(), requireAdmin, async (ctx) => {
    const ids = ctx.body.ids
    if (!Array.isArray(ids) || ids.length > MAX_CATEGORIES || !ids.every((x) => Number.isInteger(x) && x > 0)) throw badRequest({ ids: 'invalid' })
    await transaction(async (db) => {
      for (const [i, id] of ids.entries()) await db.query('UPDATE categories SET sort_order = $2 WHERE id = $1', [id, i + 1])
      await logAdmin(ctx, 'category.order', '', { ids }, db)
    })
    sendJson(ctx.res, 200, await adminList())
  })

  // Only an empty category can be deleted: its flowers must first be moved
  // to another category (otherwise they would vanish from the menus).
  router.delete('/api/admin/categories/:id', requireAdmin, async (ctx) => {
    const id = idParam(ctx)
    await transaction(async (db) => {
      const { rows } = await db.query('SELECT slug, names FROM categories WHERE id = $1 FOR UPDATE', [id])
      if (!rows[0]) throw new HttpError(404, 'not_found')
      const used = await db.query('SELECT count(*)::int AS n FROM products WHERE cat = $1 AND deleted_at IS NULL', [rows[0].slug])
      if (used.rows[0].n) throw new HttpError(409, 'category_in_use', { products: used.rows[0].n })
      await db.query('DELETE FROM categories WHERE id = $1', [id])
      await logAdmin(ctx, 'category.delete', `category:${id}`, { slug: rows[0].slug, name: rows[0].names?.tm }, db)
    })
    sendJson(ctx.res, 200, await adminList())
  })
}

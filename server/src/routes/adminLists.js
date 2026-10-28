// Admin → Categories and admin → Menu: add, rename, reorder and delete
// categories and occasions (the shop's original ones too), and choose the
// links of the top menu bar.
import { query, transaction } from '../db.js'
import { HttpError, badRequest, sendJson } from '../http.js'
import { requireAdmin } from '../security.js'
import { logAdmin } from '../audit.js'
import { MAX_CATEGORIES, checkNames, freeSlug } from '../categories.js'
import { MAX_OCCASIONS, checkMenu, forgetTag, loadMenu, saveMenu } from '../occasions.js'
import { json } from './common.js'

const idParam = (ctx) => {
  const id = Number(ctx.params.id)
  if (!Number.isInteger(id) || id < 1 || id > 2147483647) throw new HttpError(404, 'not_found')
  return id
}

// The two lists differ only in a few places.
const LISTS = {
  categories: {
    table: 'categories', kind: 'category', max: MAX_CATEGORIES, tooMany: 'too_many_categories', fallback: 'category',
    // flowers whose type is this category
    countSql: 'SELECT cat AS slug, count(*)::int AS n FROM products WHERE deleted_at IS NULL GROUP BY cat',
    // a category is only deleted when no flower has it as its type
    inUseSql: 'SELECT count(*)::int AS n FROM products WHERE cat = $1 AND deleted_at IS NULL',
    inUse: 'category_in_use',
  },
  occasions: {
    table: 'occasions', kind: 'occasion', max: MAX_OCCASIONS, tooMany: 'too_many_occasions', fallback: 'occasion',
    // flowers shown under this occasion
    countSql: `SELECT o.tag AS slug, count(*)::int AS n FROM products p, jsonb_array_elements_text(
      CASE WHEN jsonb_typeof(p.occasions) = 'array' THEN p.occasions ELSE '[]'::jsonb END) AS o(tag)
      WHERE p.deleted_at IS NULL GROUP BY o.tag`,
    inUseSql: null, // deleting an occasion only takes it off the flowers
  },
}

async function adminList(list) {
  const { rows: counts } = await query(list.countSql)
  const used = Object.fromEntries(counts.map((r) => [r.slug, r.n]))
  const { rows } = await query(`SELECT * FROM ${list.table} ORDER BY sort_order, id`)
  return { [list.table]: rows.map((r) => ({ id: r.id, key: r.slug, names: r.names, sortOrder: r.sort_order, products: used[r.slug] || 0 })) }
}

function registerList(router, path, list) {
  const { table, kind } = list
  router.get(path, requireAdmin, async (ctx) => {
    sendJson(ctx.res, 200, await adminList(list))
  })

  // Body: { names: { tm, ru, tr } }. The address is made from the name and never changes.
  router.post(path, json(), requireAdmin, async (ctx) => {
    const form = checkNames(ctx.body)
    if (form.errors) throw badRequest(form.errors)
    await transaction(async (db) => {
      // one at a time (both lists: an address must be free in both)
      await db.query('LOCK TABLE categories, occasions IN SHARE ROW EXCLUSIVE MODE')
      const { rows } = await db.query(`SELECT count(*)::int AS n, coalesce(max(sort_order), 0) AS last FROM ${table}`)
      if (rows[0].n >= list.max) throw new HttpError(409, list.tooMany, { max: list.max })
      const slug = await freeSlug(db, form.names, list.fallback)
      const r = await db.query(`INSERT INTO ${table} (slug, names, sort_order) VALUES ($1, $2, $3) RETURNING id`,
        [slug, JSON.stringify(form.names), rows[0].last + 1])
      await logAdmin(ctx, `${kind}.create`, `${kind}:${r.rows[0].id}`, { slug, name: form.names.tm }, db)
    })
    sendJson(ctx.res, 201, await adminList(list))
  })

  // Rename (the address stays the same, so old links keep working).
  router.put(`${path}/:id`, json(), requireAdmin, async (ctx) => {
    const id = idParam(ctx)
    const form = checkNames(ctx.body)
    if (form.errors) throw badRequest(form.errors)
    const r = await query(`UPDATE ${table} SET names = $2 WHERE id = $1 RETURNING slug`, [id, JSON.stringify(form.names)])
    if (!r.rowCount) throw new HttpError(404, 'not_found')
    await logAdmin(ctx, `${kind}.update`, `${kind}:${id}`, { slug: r.rows[0].slug, name: form.names.tm })
    sendJson(ctx.res, 200, await adminList(list))
  })

  // New order (menus, filter, flower form). Body: { ids: [3, 1, 2] }.
  router.post(`${path}/order`, json(), requireAdmin, async (ctx) => {
    const ids = ctx.body.ids
    if (!Array.isArray(ids) || ids.length > list.max || !ids.every((x) => Number.isInteger(x) && x > 0)) throw badRequest({ ids: 'invalid' })
    await transaction(async (db) => {
      for (const [i, id] of ids.entries()) await db.query(`UPDATE ${table} SET sort_order = $2 WHERE id = $1`, [id, i + 1])
      await logAdmin(ctx, `${kind}.order`, '', { ids }, db)
    })
    sendJson(ctx.res, 200, await adminList(list))
  })

  router.delete(`${path}/:id`, requireAdmin, async (ctx) => {
    const id = idParam(ctx)
    await transaction(async (db) => {
      const { rows } = await db.query(`SELECT slug, names FROM ${table} WHERE id = $1 FOR UPDATE`, [id])
      if (!rows[0]) throw new HttpError(404, 'not_found')
      if (list.inUseSql) {
        const used = await db.query(list.inUseSql, [rows[0].slug])
        if (used.rows[0].n) throw new HttpError(409, list.inUse, { products: used.rows[0].n })
      }
      await db.query(`DELETE FROM ${table} WHERE id = $1`, [id])
      await forgetTag(db, kind, rows[0].slug) // off the top menu and the flowers' "shown under"
      await logAdmin(ctx, `${kind}.delete`, `${kind}:${id}`, { slug: rows[0].slug, name: rows[0].names?.tm }, db)
    })
    sendJson(ctx.res, 200, await adminList(list))
  })
}

export function register(router) {
  registerList(router, '/api/admin/categories', LISTS.categories)
  registerList(router, '/api/admin/occasions', LISTS.occasions)

  // Top menu bar: the links between "Home" and "Catalog".
  router.get('/api/admin/menu', requireAdmin, async (ctx) => {
    sendJson(ctx.res, 200, { items: await loadMenu() })
  })

  // Body: { items: [{ type: 'occasion' | 'category', key }] } in order.
  router.put('/api/admin/menu', json(), requireAdmin, async (ctx) => {
    const form = await checkMenu(ctx.body)
    if (form.errors) throw badRequest(form.errors)
    await transaction(async (db) => {
      await saveMenu(db, form.items)
      await logAdmin(ctx, 'menu.update', '', { items: form.items.map((i) => `${i.type}:${i.key}`) }, db)
    })
    sendJson(ctx.res, 200, { items: form.items })
  })
}

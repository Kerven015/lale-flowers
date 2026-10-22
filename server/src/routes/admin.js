// Admin panel API. Everything except /login needs the admin session cookie.
import { query, transaction } from '../db.js'
import { HttpError, badRequest, sendJson } from '../http.js'
import { PRODUCT_COLUMNS, checkProductForm, editedProductFields, newProductFields, toProduct } from '../products.js'
import { endOtherSessions, endSession, hashPassword, limit, randomPassword, requireAdmin, startSession, verifyDummy, verifyPassword } from '../security.js'
import { CODE_RE, normalizeCode } from '../pricing.js'
import { checkShopSettings, getShopSettings, saveShopSettings } from '../settings.js'
import { commitPhotos, copyPhotos, preparePhotos, removePhotos } from '../uploads.js'
import { itemsFor, publicSettings } from './shop.js'
import { json } from './common.js'

const ADMIN_HOURS = 12
const STATUSES = ['new', 'confirmed', 'preparing', 'delivering', 'done', 'cancelled']
const STATUS_GROUPS = {
  new: ['new'],
  active: ['confirmed', 'preparing', 'delivering'],
  done: ['done'],
  cancelled: ['cancelled'],
  all: STATUSES,
}
const PHOTO_BODY_LIMIT = 30 * 1024 * 1024 // 8 photos as data URLs

const idParam = (ctx) => {
  const id = Number(ctx.params.id)
  if (!Number.isInteger(id) || id < 1 || id > 2147483647) throw new HttpError(404, 'not_found')
  return id
}

function adminDiscount(d) {
  return {
    id: d.id, code: d.code, kind: d.kind, value: d.value, minTotal: d.min_total,
    startsAt: d.starts_at, endsAt: d.ends_at, maxUses: d.max_uses, usedCount: d.used_count,
    firstOrderOnly: d.first_order_only, active: d.active, createdAt: d.created_at,
  }
}

// Checks the discount code form; throws a validation error listing the fields.
function checkDiscountForm(b) {
  const errors = {}
  const code = normalizeCode(b.code)
  if (!CODE_RE.test(code)) errors.code = 'invalid'
  const kind = b.kind === 'amount' ? 'amount' : b.kind === 'percent' ? 'percent' : null
  if (!kind) errors.kind = 'invalid'
  const num = (field, { min, max, optional }) => {
    const v = b[field]
    if (optional && (v === undefined || v === null || String(v).trim() === '')) return null
    const n = Number(v)
    if (!Number.isInteger(n) || n < min || n > max) { errors[field] = 'invalid'; return null }
    return n
  }
  const value = num('value', { min: 1, max: kind === 'percent' ? 100 : 1_000_000 })
  const minTotal = num('minTotal', { min: 0, max: 10_000_000, optional: true }) ?? 0
  const maxUses = num('maxUses', { min: 1, max: 10_000_000, optional: true })
  const date = (field) => {
    const v = b[field]
    if (v === undefined || v === null || v === '') return null
    const t = new Date(v)
    if (Number.isNaN(t.getTime())) { errors[field] = 'invalid'; return null }
    return t.toISOString()
  }
  const startsAt = date('startsAt')
  const endsAt = date('endsAt')
  if (startsAt && endsAt && endsAt <= startsAt) errors.endsAt = 'invalid'
  if (Object.keys(errors).length) throw badRequest(errors)
  return { code, kind, value, minTotal, maxUses, startsAt, endsAt, firstOrderOnly: b.firstOrderOnly === true, active: b.active !== false }
}

const COPY_WORD = { tm: 'nusga', ru: 'копия', tr: 'kopya' }

// sign +1: an order was cancelled -> its counted flowers go back to stock
// sign -1: a cancelled order is restored -> they are taken again (if enough)
async function moveStock(db, orderId, discountCode, sign) {
  const { rows: items } = await db.query(
    `SELECT oi.product_id, sum(oi.qty)::int AS qty, p.stock FROM order_items oi
     JOIN products p ON p.id = oi.product_id
     WHERE oi.order_id = $1 AND p.stock IS NOT NULL GROUP BY oi.product_id, p.stock ORDER BY oi.product_id`,
    [orderId],
  )
  if (sign < 0) {
    const short = items.filter((i) => i.stock < i.qty)
    if (short.length) throw new HttpError(409, 'not_enough_stock', { items: short.map((i) => ({ id: i.product_id, left: i.stock })) })
  }
  for (const i of items) {
    await db.query(
      'UPDATE products SET stock = stock + $2, in_stock = (stock + $2 > 0), updated_at = now() WHERE id = $1',
      [i.product_id, sign * i.qty],
    )
  }
  if (discountCode) {
    await db.query('UPDATE discount_codes SET used_count = greatest(0, used_count - $2) WHERE upper(code) = $1', [discountCode.toUpperCase(), sign])
  }
}

function adminOrder(o, items) {
  return {
    id: o.id,
    code: o.code,
    status: o.status,
    createdAt: o.created_at,
    updatedAt: o.updated_at,
    customer: { first: o.first_name, last: o.last_name, phone: o.phone, email: o.email, city: o.city, address: o.address },
    registered: !!o.customer_id,
    notes: o.notes,
    adminNote: o.admin_note,
    deliveryType: o.delivery_type,
    payment: o.payment,
    lang: o.lang,
    subtotal: o.subtotal,
    discount: o.discount || 0,
    discountCode: o.discount_code || '',
    deliveryFee: o.delivery_fee,
    total: o.total,
    items: (items || []).map((i) => ({ productId: i.product_id, names: i.names, price: i.price, qty: i.qty })),
  }
}

async function liveProduct(db, id) {
  const { rows } = await db.query(`SELECT ${PRODUCT_COLUMNS} FROM products WHERE id = $1 AND deleted_at IS NULL FOR UPDATE`, [id])
  if (!rows[0]) throw new HttpError(404, 'not_found')
  return rows[0]
}

// Writes the new photos, then runs the database change; if that fails the
// new files are removed again.
async function withPhotos(body, fn) {
  const photos = preparePhotos(body.images ?? [])
  if (photos.error) throw badRequest({ image: photos.error })
  await commitPhotos(photos.pending)
  try {
    return await fn(photos.urls)
  } catch (err) {
    await removePhotos(photos.pending.map((p) => `/uploads/${p.name}`))
    throw err
  }
}

export function register(router) {
  // ---- login -------------------------------------------------------------------
  router.post('/api/admin/login', json(), limit('admin-login', 10, 15, (ctx) => String(ctx.body?.username || '').trim().toLowerCase()), async (ctx) => {
    const username = String(ctx.body.username || '').trim().slice(0, 100)
    const password = typeof ctx.body.password === 'string' ? ctx.body.password.slice(0, 200) : ''
    const { rows } = await query('SELECT id, username, password_hash FROM admins WHERE lower(username) = lower($1)', [username])
    const ok = rows[0] ? await verifyPassword(password, rows[0].password_hash) : await verifyDummy(password)
    if (!ok) throw new HttpError(401, 'invalid_credentials')
    await startSession(ctx.res, 'admin', rows[0].id, { hours: ADMIN_HOURS, remember: false })
    sendJson(ctx.res, 200, { admin: { username: rows[0].username } })
  })

  router.post('/api/admin/logout', async (ctx) => {
    await endSession(ctx.req, ctx.res, 'admin')
    sendJson(ctx.res, 200, { ok: true })
  })

  // not logged in is a normal answer here (the panel shows the login form)
  router.get('/api/admin/me', async (ctx) => {
    try { await requireAdmin(ctx) } catch { return sendJson(ctx.res, 200, { admin: null }) }
    const { rows } = await query('SELECT username FROM admins WHERE id = $1', [ctx.adminId])
    sendJson(ctx.res, 200, { admin: rows[0] || null })
  })

  router.post('/api/admin/password', json(), requireAdmin, limit('admin-password', 10, 15), async (ctx) => {
    const current = typeof ctx.body.current === 'string' ? ctx.body.current : ''
    const next = typeof ctx.body.next === 'string' ? ctx.body.next : ''
    if (next.length < 8 || next.length > 200) throw badRequest({ next: 'too_short' })
    const { rows } = await query('SELECT password_hash FROM admins WHERE id = $1', [ctx.adminId])
    if (!rows[0] || !(await verifyPassword(current, rows[0].password_hash))) throw new HttpError(401, 'invalid_credentials')
    await query('UPDATE admins SET password_hash = $2 WHERE id = $1', [ctx.adminId, await hashPassword(next)])
    await endOtherSessions(ctx.req, 'admin', ctx.adminId) // log out other computers / phones
    sendJson(ctx.res, 200, { ok: true })
  })

  // Numbers for the badges (polled every few seconds by the admin panel).
  router.get('/api/admin/summary', requireAdmin, async (ctx) => {
    const { rows } = await query(`SELECT
      (SELECT count(*)::int FROM orders WHERE status = 'new') AS new_orders,
      (SELECT count(*)::int FROM orders WHERE status IN ('confirmed','preparing','delivering')) AS active_orders,
      (SELECT count(*)::int FROM messages WHERE read_at IS NULL) AS unread_messages,
      (SELECT coalesce(max(id), 0)::int FROM orders) AS last_order_id`)
    const r = rows[0]
    sendJson(ctx.res, 200, { newOrders: r.new_orders, activeOrders: r.active_orders, unreadMessages: r.unread_messages, lastOrderId: r.last_order_id })
  })

  // ---- products ------------------------------------------------------------------
  router.post('/api/admin/products', requireAdmin, json(PHOTO_BODY_LIMIT), async (ctx) => {
    const form = checkProductForm(ctx.body)
    if (form.errors) throw badRequest(form.errors)
    const product = await withPhotos(ctx.body, async (urls) => {
      if (!urls.length) throw badRequest({ image: 'image' })
      const f = newProductFields(form.data)
      const { rows } = await query(
        `INSERT INTO products (slug, cat, custom_type, occasions, price, old_price, is_new, in_stock, tones, images, i18n,
           stock, colors, rating, reviews, sort_order)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,
           coalesce($16, (SELECT coalesce(max(sort_order), 0) + 1 FROM products)))
         RETURNING ${PRODUCT_COLUMNS}`,
        [f.slug, f.cat, f.custom_type, JSON.stringify(f.occasions), f.price, f.old_price, f.is_new, f.in_stock,
          JSON.stringify(f.tones), JSON.stringify(urls), JSON.stringify(f.i18n),
          f.stock, JSON.stringify(f.colors), f.rating, f.reviews, f.sort_order],
      )
      await query("UPDATE products SET slug = slug || '-' || id WHERE id = $1", [rows[0].id])
      return toProduct({ ...rows[0], slug: `${rows[0].slug}-${rows[0].id}` })
    })
    sendJson(ctx.res, 201, { product })
  })

  router.put('/api/admin/products/:id', requireAdmin, json(PHOTO_BODY_LIMIT), async (ctx) => {
    const id = idParam(ctx)
    const form = checkProductForm(ctx.body)
    if (form.errors) throw badRequest(form.errors)
    let removed = []
    const product = await withPhotos(ctx.body, (urls) => transaction(async (db) => {
      const row = await liveProduct(db, id)
      const f = editedProductFields(row, form.data)
      removed = (row.images || []).filter((u) => !urls.includes(u))
      const { rows } = await db.query(
        `UPDATE products SET cat = $2, custom_type = $3, occasions = $4, price = $5, old_price = $6, in_stock = $7,
           i18n = $8, images = $9, stock = $10, is_new = $11, sort_order = $12, colors = $13, rating = $14, reviews = $15,
           updated_at = now()
         WHERE id = $1 RETURNING ${PRODUCT_COLUMNS}`,
        [id, f.cat, f.custom_type, JSON.stringify(f.occasions), f.price, f.old_price, f.in_stock,
          JSON.stringify(f.i18n), JSON.stringify(urls), f.stock, f.is_new, f.sort_order, JSON.stringify(f.colors), f.rating, f.reviews],
      )
      return toProduct(rows[0])
    }))
    await removePhotos(removed)
    sendJson(ctx.res, 200, { product })
  })

  // Delete one or several products: { ids: [1, 2, 3] }
  router.post('/api/admin/products/delete', requireAdmin, json(), async (ctx) => {
    const ids = Array.isArray(ctx.body.ids) ? ctx.body.ids.map(Number).filter((n) => Number.isInteger(n) && n > 0).slice(0, 500) : []
    if (!ids.length) throw badRequest({ ids: 'required' })
    const { rows } = await query(
      `UPDATE products SET deleted_at = now(), updated_at = now() WHERE id = ANY($1::int[]) AND deleted_at IS NULL RETURNING id, images`,
      [ids],
    )
    // photos of deleted products are not needed any more
    await removePhotos(rows.flatMap((r) => r.images || []))
    await query(`UPDATE products SET images = '[]' WHERE id = ANY($1::int[])`, [rows.map((r) => r.id)])
    sendJson(ctx.res, 200, { deleted: rows.map((r) => r.id) })
  })

  // Copy a flower: same details and photos (copied, so each has its own),
  // name + " (copy)", placed right after the original, not marked "New".
  router.post('/api/admin/products/:id/duplicate', requireAdmin, async (ctx) => {
    const id = idParam(ctx)
    const { rows: src } = await query(`SELECT ${PRODUCT_COLUMNS} FROM products WHERE id = $1 AND deleted_at IS NULL`, [id])
    if (!src[0]) throw new HttpError(404, 'not_found')
    const p = src[0]
    const images = await copyPhotos(p.images || [])
    const i18n = Object.fromEntries(Object.entries(p.i18n || {}).map(([l, v]) => [l, { ...v, name: `${v?.name || ''} (${COPY_WORD[l] || 'copy'})`.trim() }]))
    let product
    try {
      product = await transaction(async (db) => {
        // make room right after the original
        await db.query('UPDATE products SET sort_order = sort_order + 1 WHERE sort_order > $1', [p.sort_order])
        const { rows } = await db.query(
          `INSERT INTO products (slug, cat, custom_type, occasions, price, old_price, rating, reviews, colors, is_new, in_stock,
             stock, tones, images, i18n, sort_order)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,false,$10,$11,$12,$13,$14,$15)
           RETURNING ${PRODUCT_COLUMNS}`,
          [p.slug, p.cat, p.custom_type, p.occasions === null ? null : JSON.stringify(p.occasions), p.price, p.old_price,
            p.rating, p.reviews, JSON.stringify(p.colors || []), p.in_stock, p.stock, JSON.stringify(p.tones || []),
            JSON.stringify(images), JSON.stringify(i18n), p.sort_order + 1],
        )
        const slug = `${String(p.slug).replace(/-\d+$/, '')}-${rows[0].id}`
        await db.query('UPDATE products SET slug = $2 WHERE id = $1', [rows[0].id, slug])
        return toProduct({ ...rows[0], slug })
      })
    } catch (err) {
      await removePhotos(images.filter((u) => u.startsWith('/uploads/')))
      throw err
    }
    sendJson(ctx.res, 201, { product })
  })

  // ---- orders ----------------------------------------------------------------------
  router.get('/api/admin/orders', requireAdmin, async (ctx) => {
    const group = STATUS_GROUPS[ctx.url.searchParams.get('status')] || STATUS_GROUPS.all
    const q = String(ctx.url.searchParams.get('q') || '').trim().slice(0, 100)
    const limitN = Math.min(100, Math.max(1, Number(ctx.url.searchParams.get('limit')) || 50))
    const offset = Math.min(1_000_000, Math.max(0, Math.floor(Number(ctx.url.searchParams.get('offset')) || 0)))
    const params = [group, limitN, offset]
    let where = 'status = ANY($1::text[])'
    if (q) {
      params.push(`%${q.replace(/[\\%_]/g, '\\$&')}%`)
      where += ` AND (code ILIKE $4 OR phone ILIKE $4 OR first_name ILIKE $4 OR last_name ILIKE $4 OR email ILIKE $4)`
    }
    const { rows } = await query(
      `SELECT *, count(*) OVER ()::int AS total_count FROM orders WHERE ${where}
       ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
      params,
    )
    const items = await itemsFor(rows.map((r) => r.id))
    sendJson(ctx.res, 200, { orders: rows.map((o) => adminOrder(o, items.get(o.id))), total: rows[0]?.total_count || 0 })
  })

  router.patch('/api/admin/orders/:id', requireAdmin, json(), async (ctx) => {
    const id = idParam(ctx)
    const sets = []
    const params = [id]
    if (ctx.body.status !== undefined) {
      if (!STATUSES.includes(ctx.body.status)) throw badRequest({ status: 'invalid' })
      params.push(ctx.body.status); sets.push(`status = $${params.length}`)
    }
    if (ctx.body.adminNote !== undefined) {
      if (typeof ctx.body.adminNote !== 'string') throw badRequest({ adminNote: 'invalid' })
      params.push(ctx.body.adminNote.slice(0, 2000)); sets.push(`admin_note = $${params.length}`)
    }
    if (!sets.length) throw badRequest({ status: 'required' })
    const rows = await transaction(async (db) => {
      const { rows: before } = await db.query('SELECT status, discount_code FROM orders WHERE id = $1 FOR UPDATE', [id])
      if (!before[0]) throw new HttpError(404, 'not_found')
      const was = before[0].status === 'cancelled'
      const now = ctx.body.status === undefined ? was : ctx.body.status === 'cancelled'
      // cancelling gives the flowers (and a code use) back; un-cancelling takes them again
      if (was !== now) await moveStock(db, id, before[0].discount_code, now ? +1 : -1)
      return (await db.query(`UPDATE orders SET ${sets.join(', ')}, updated_at = now() WHERE id = $1 RETURNING *`, params)).rows
    })
    const items = await itemsFor([id])
    sendJson(ctx.res, 200, { order: adminOrder(rows[0], items.get(id)) })
  })

  // ---- contact messages ---------------------------------------------------------------
  router.get('/api/admin/messages', requireAdmin, async (ctx) => {
    const { rows } = await query('SELECT * FROM messages ORDER BY created_at DESC LIMIT 200')
    sendJson(ctx.res, 200, {
      messages: rows.map((m) => ({ id: m.id, name: m.name, email: m.email, phone: m.phone, message: m.message, read: !!m.read_at, createdAt: m.created_at })),
    })
  })

  router.patch('/api/admin/messages/:id', requireAdmin, json(), async (ctx) => {
    const id = idParam(ctx)
    const { rowCount } = await query(
      `UPDATE messages SET read_at = CASE WHEN $2 THEN coalesce(read_at, now()) ELSE NULL END WHERE id = $1`,
      [id, ctx.body.read !== false],
    )
    if (!rowCount) throw new HttpError(404, 'not_found')
    sendJson(ctx.res, 200, { ok: true })
  })

  router.delete('/api/admin/messages/:id', requireAdmin, async (ctx) => {
    await query('DELETE FROM messages WHERE id = $1', [idParam(ctx)])
    sendJson(ctx.res, 200, { ok: true })
  })

  // ---- customers ------------------------------------------------------------------------
  router.get('/api/admin/customers', requireAdmin, async (ctx) => {
    const q = String(ctx.url.searchParams.get('q') || '').trim().slice(0, 100)
    const params = []
    let where = ''
    if (q) {
      params.push(`%${q.replace(/[\\%_]/g, '\\$&')}%`)
      where = 'WHERE c.email ILIKE $1 OR c.first_name ILIKE $1 OR c.last_name ILIKE $1 OR c.phone ILIKE $1'
    }
    const { rows } = await query(
      `SELECT c.id, c.email, c.first_name, c.last_name, c.phone, c.created_at, c.blocked_at,
              c.password_hash IS NOT NULL AS has_password,
              EXISTS (SELECT 1 FROM user_identities i WHERE i.user_id = c.id AND i.provider = 'google') AS google,
              (SELECT count(*)::int FROM orders o WHERE o.customer_id = c.id) AS orders
       FROM customers c ${where} ORDER BY c.created_at DESC LIMIT 200`,
      params,
    )
    sendJson(ctx.res, 200, {
      customers: rows.map((c) => ({
        id: c.id, email: c.email, first: c.first_name, last: c.last_name, phone: c.phone, orders: c.orders, createdAt: c.created_at,
        google: c.google, password: c.has_password, blocked: !!c.blocked_at,
      })),
    })
  })

  // Block / unblock a customer: body { blocked: true | false }. A blocked
  // customer cannot sign in (password or Google) and is logged out at once.
  router.post('/api/admin/customers/:id/block', json(), requireAdmin, async (ctx) => {
    const id = idParam(ctx)
    if (typeof ctx.body.blocked !== 'boolean') throw badRequest({ blocked: 'invalid' })
    const { rowCount } = await query(
      `UPDATE customers SET blocked_at = CASE WHEN $2 THEN COALESCE(blocked_at, now()) ELSE NULL END WHERE id = $1`,
      [id, ctx.body.blocked],
    )
    if (!rowCount) throw new HttpError(404, 'not_found')
    if (ctx.body.blocked) await query(`DELETE FROM sessions WHERE kind = 'customer' AND customer_id = $1`, [id])
    sendJson(ctx.res, 200, { ok: true, blocked: ctx.body.blocked })
  })

  // A customer forgot their password: make a new temporary one. The admin
  // tells it to the customer (by phone); the customer can change it in Profile.
  router.post('/api/admin/customers/:id/password', requireAdmin, async (ctx) => {
    const id = idParam(ctx)
    const password = randomPassword(10)
    const { rowCount } = await query('UPDATE customers SET password_hash = $2 WHERE id = $1', [id, await hashPassword(password)])
    if (!rowCount) throw new HttpError(404, 'not_found')
    await query(`DELETE FROM sessions WHERE kind = 'customer' AND customer_id = $1`, [id])
    sendJson(ctx.res, 200, { password })
  })

  // Remove a customer account. Their logins end at once (sessions are deleted
  // with the account). Their past orders stay in Orders — with the name, phone
  // and address they typed — so the shop's history is not lost.
  router.delete('/api/admin/customers/:id', requireAdmin, async (ctx) => {
    const { rowCount } = await query('DELETE FROM customers WHERE id = $1', [idParam(ctx)])
    if (!rowCount) throw new HttpError(404, 'not_found')
    sendJson(ctx.res, 200, { ok: true })
  })

  // ---- shop settings ------------------------------------------------------------------------
  router.get('/api/admin/settings', requireAdmin, async (ctx) => {
    sendJson(ctx.res, 200, { settings: publicSettings(await getShopSettings()) })
  })

  router.put('/api/admin/settings', requireAdmin, json(), async (ctx) => {
    const form = checkShopSettings(ctx.body)
    if (form.errors) throw badRequest(form.errors)
    sendJson(ctx.res, 200, { settings: publicSettings(await saveShopSettings(form.data)) })
  })

  // ---- discount codes -----------------------------------------------------------------------
  router.get('/api/admin/discounts', requireAdmin, async (ctx) => {
    const { rows } = await query('SELECT * FROM discount_codes ORDER BY active DESC, created_at DESC LIMIT 500')
    sendJson(ctx.res, 200, { discounts: rows.map(adminDiscount) })
  })

  router.post('/api/admin/discounts', requireAdmin, json(), async (ctx) => {
    const d = checkDiscountForm(ctx.body)
    try {
      const { rows } = await query(
        `INSERT INTO discount_codes (code, kind, value, min_total, starts_at, ends_at, max_uses, first_order_only, active)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
        [d.code, d.kind, d.value, d.minTotal, d.startsAt, d.endsAt, d.maxUses, d.firstOrderOnly, d.active],
      )
      sendJson(ctx.res, 201, { discount: adminDiscount(rows[0]) })
    } catch (err) {
      if (err.code === '23505') throw badRequest({ code: 'taken' })
      throw err
    }
  })

  router.put('/api/admin/discounts/:id', requireAdmin, json(), async (ctx) => {
    const id = idParam(ctx)
    const d = checkDiscountForm(ctx.body)
    try {
      const { rows } = await query(
        `UPDATE discount_codes SET code = $2, kind = $3, value = $4, min_total = $5, starts_at = $6, ends_at = $7,
           max_uses = $8, first_order_only = $9, active = $10
         WHERE id = $1 RETURNING *`,
        [id, d.code, d.kind, d.value, d.minTotal, d.startsAt, d.endsAt, d.maxUses, d.firstOrderOnly, d.active],
      )
      if (!rows[0]) throw new HttpError(404, 'not_found')
      sendJson(ctx.res, 200, { discount: adminDiscount(rows[0]) })
    } catch (err) {
      if (err.code === '23505') throw badRequest({ code: 'taken' })
      throw err
    }
  })

  // Orders keep the code text and amount, so deleting a code never changes them.
  router.delete('/api/admin/discounts/:id', requireAdmin, async (ctx) => {
    const { rowCount } = await query('DELETE FROM discount_codes WHERE id = $1', [idParam(ctx)])
    if (!rowCount) throw new HttpError(404, 'not_found')
    sendJson(ctx.res, 200, { ok: true })
  })

  // ---- newsletter -------------------------------------------------------------------------
  router.get('/api/admin/subscribers', requireAdmin, async (ctx) => {
    const { rows } = await query('SELECT id, email, created_at FROM subscribers ORDER BY created_at DESC')
    sendJson(ctx.res, 200, { subscribers: rows.map((s) => ({ id: s.id, email: s.email, createdAt: s.created_at })) })
  })

  router.delete('/api/admin/subscribers/:id', requireAdmin, async (ctx) => {
    await query('DELETE FROM subscribers WHERE id = $1', [idParam(ctx)])
    sendJson(ctx.res, 200, { ok: true })
  })
}

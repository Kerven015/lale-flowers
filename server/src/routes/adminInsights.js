// Admin: dashboard and sales numbers, the activity log, stock adjustments and
// history, and one customer's orders. Everything needs the admin session.
//
// Money words used everywhere here:
//   revenue     = totals of DELIVERED orders (status "done"). Customers pay on
//                 delivery or in the shop (cash or card), so only these are paid.
//   order value = totals of orders that are not cancelled (paid or still on
//                 their way): what the shop expects to earn.
// Cancelled orders are never counted as sales. Days are shop days (Ashgabat).
import { logAdmin } from '../audit.js'
import { query, transaction } from '../db.js'
import { HttpError, badRequest, sendJson } from '../http.js'
import { ADJUST_REASONS, recordMovement } from '../inventory.js'
import { requireAdmin } from '../security.js'
import { getShopSettings } from '../settings.js'
import { SHOP_TZ, addDays, isRealDay, shopDay } from '../shopTime.js'
import { json } from './common.js'
import { dayText, itemsFor } from './shop.js'

const idParam = (ctx) => {
  const id = Number(ctx.params.id)
  if (!Number.isInteger(id) || id < 1 || id > 2147483647) throw new HttpError(404, 'not_found')
  return id
}

// created_at as a shop day
const ORDER_DAY = `(o.created_at AT TIME ZONE '${SHOP_TZ}')::date`
const GROUPS = { day: 'day', week: 'week', month: 'month' }
const MAX_RANGE_DAYS = 366 * 3

const shortOrder = (o) => ({
  id: o.id, code: o.code, status: o.status, createdAt: o.created_at, total: o.total,
  name: `${o.first_name} ${o.last_name}`.trim(), deliveryDate: dayText(o.delivery_date), deliverySlot: o.delivery_slot || '',
})

export function register(router) {
  // Dashboard + analytics. ?from=YYYY-MM-DD&to=YYYY-MM-DD&group=day|week|month
  // (default: the last 30 days by day).
  router.get('/api/admin/stats', requireAdmin, async (ctx) => {
    const sp = ctx.url.searchParams
    const today = shopDay()
    const to = sp.get('to') || today
    const from = sp.get('from') || addDays(to, -29)
    const group = GROUPS[sp.get('group')] || 'day'
    if (!isRealDay(from) || !isRealDay(to) || from > to || addDays(from, MAX_RANGE_DAYS) < to) throw badRequest({ range: 'invalid' })
    const settings = await getShopSettings()

    const [totals, series, best, now, recent, low] = await Promise.all([
      query(
        `SELECT
           count(*) FILTER (WHERE status <> 'cancelled')::int AS orders,
           count(*) FILTER (WHERE status = 'done')::int AS delivered,
           count(*) FILTER (WHERE status = 'cancelled')::int AS cancelled,
           coalesce(sum(total) FILTER (WHERE status = 'done'), 0)::bigint AS revenue,
           coalesce(sum(total) FILTER (WHERE status <> 'cancelled'), 0)::bigint AS order_value,
           coalesce(sum(discount) FILTER (WHERE status <> 'cancelled'), 0)::bigint AS discounts
         FROM orders o WHERE ${ORDER_DAY} BETWEEN $1 AND $2`,
        [from, to],
      ),
      query(
        `SELECT to_char(date_trunc('${group}', ${ORDER_DAY}), 'YYYY-MM-DD') AS period,
           count(*) FILTER (WHERE status <> 'cancelled')::int AS orders,
           coalesce(sum(total) FILTER (WHERE status = 'done'), 0)::bigint AS revenue,
           coalesce(sum(total) FILTER (WHERE status <> 'cancelled'), 0)::bigint AS order_value
         FROM orders o WHERE ${ORDER_DAY} BETWEEN $1 AND $2
         GROUP BY 1 ORDER BY 1`,
        [from, to],
      ),
      query(
        `SELECT oi.product_id, (array_agg(oi.names ORDER BY oi.id DESC))[1] AS names,
           sum(oi.qty)::int AS qty, sum(oi.qty * oi.price)::bigint AS amount
         FROM order_items oi JOIN orders o ON o.id = oi.order_id
         WHERE o.status <> 'cancelled' AND ${ORDER_DAY} BETWEEN $1 AND $2
         GROUP BY oi.product_id ORDER BY qty DESC, amount DESC LIMIT 10`,
        [from, to],
      ),
      query(
        `SELECT
           count(*) FILTER (WHERE ${ORDER_DAY} = $1 AND status <> 'cancelled')::int AS today_orders,
           coalesce(sum(total) FILTER (WHERE ${ORDER_DAY} = $1 AND status <> 'cancelled'), 0)::bigint AS today_value,
           count(*) FILTER (WHERE delivery_date = $1 AND status NOT IN ('cancelled', 'done'))::int AS today_deliveries,
           count(*) FILTER (WHERE status = 'new')::int AS new,
           count(*) FILTER (WHERE status = 'confirmed')::int AS confirmed,
           count(*) FILTER (WHERE status = 'preparing')::int AS preparing,
           count(*) FILTER (WHERE status = 'delivering')::int AS delivering,
           count(*) FILTER (WHERE status = 'done')::int AS done,
           count(*) FILTER (WHERE status = 'cancelled')::int AS cancelled
         FROM orders o`,
        [today],
      ),
      query('SELECT * FROM orders ORDER BY created_at DESC LIMIT 8'),
      query(
        `SELECT id, i18n, stock FROM products
         WHERE deleted_at IS NULL AND stock IS NOT NULL AND stock <= $1 ORDER BY stock, id LIMIT 50`,
        [settings.lowStockThreshold],
      ),
    ])
    const t = totals.rows[0]
    const n = now.rows[0]
    const num = (v) => Number(v) // bigint sums come back as text
    sendJson(ctx.res, 200, {
      range: { from, to, group, today },
      totals: {
        orders: t.orders, delivered: t.delivered, cancelled: t.cancelled,
        revenue: num(t.revenue), orderValue: num(t.order_value), discounts: num(t.discounts),
        avgDelivered: t.delivered ? Math.round(num(t.revenue) / t.delivered) : 0,
        avgOrder: t.orders ? Math.round(num(t.order_value) / t.orders) : 0,
      },
      series: series.rows.map((r) => ({ period: r.period, orders: r.orders, revenue: num(r.revenue), orderValue: num(r.order_value) })),
      bestSellers: best.rows.map((r) => ({ productId: r.product_id, names: r.names, qty: r.qty, amount: num(r.amount) })),
      now: {
        todayOrders: n.today_orders, todayValue: num(n.today_value), todayDeliveries: n.today_deliveries,
        pending: n.new + n.confirmed + n.preparing + n.delivering,
        byStatus: { new: n.new, confirmed: n.confirmed, preparing: n.preparing, delivering: n.delivering, done: n.done, cancelled: n.cancelled },
      },
      recent: recent.rows.map(shortOrder),
      lowStock: low.rows.map((p) => ({ id: p.id, names: Object.fromEntries(Object.entries(p.i18n || {}).map(([l, v]) => [l, v?.name || ''])), stock: p.stock })),
      lowStockThreshold: settings.lowStockThreshold,
    })
  })

  // Activity log, newest first. ?before=<id> for the next page.
  router.get('/api/admin/log', requireAdmin, async (ctx) => {
    const before = Number(ctx.url.searchParams.get('before'))
    const params = []
    let where = ''
    if (Number.isInteger(before) && before > 0) { params.push(before); where = 'WHERE id < $1' }
    const { rows } = await query(`SELECT * FROM admin_log ${where} ORDER BY id DESC LIMIT 50`, params)
    sendJson(ctx.res, 200, {
      entries: rows.map((r) => ({
        id: Number(r.id), admin: r.admin_name, action: r.action, target: r.target, details: r.details, ip: r.ip, createdAt: r.created_at,
      })),
      more: rows.length === 50,
    })
  })

  // Change a counted flower's stock: { change: +10 | -3, reason: received | damaged | correction, note }
  //   received   = new flowers came in (+)
  //   damaged    = wilted, broken, thrown away (-)
  //   correction = counting mistake (+ or -)
  router.post('/api/admin/products/:id/stock', requireAdmin, json(), async (ctx) => {
    const id = idParam(ctx)
    const b = ctx.body
    const errors = {}
    const change = Number(b.change)
    const reason = ADJUST_REASONS.includes(b.reason) ? b.reason : null
    if (!reason) errors.reason = 'invalid'
    if (!Number.isInteger(change) || change === 0 || Math.abs(change) > 100_000) errors.change = 'invalid'
    else if ((reason === 'received' && change < 0) || (reason === 'damaged' && change > 0)) errors.change = 'invalid'
    const note = typeof b.note === 'string' ? b.note.replace(/[\u0000-\u001F\u007F]/g, ' ').trim().slice(0, 300) : ''
    if (Object.keys(errors).length) throw badRequest(errors)
    const product = await transaction(async (db) => {
      const { rows } = await db.query('SELECT id, stock, i18n FROM products WHERE id = $1 AND deleted_at IS NULL FOR UPDATE', [id])
      if (!rows[0]) throw new HttpError(404, 'not_found')
      // a flower that is not counted starts counting from 0 when flowers are received
      const was = rows[0].stock
      if (was === null && change < 0) throw new HttpError(409, 'not_counted')
      const after = (was ?? 0) + change
      if (after < 0) throw new HttpError(409, 'not_enough_stock', { items: [{ id, left: was }] })
      const { rows: upd } = await db.query(
        'UPDATE products SET stock = $2, in_stock = ($2 > 0), updated_at = now() WHERE id = $1 RETURNING id, stock, in_stock',
        [id, after],
      )
      await recordMovement(db, { productId: id, change, stockAfter: after, reason, adminId: ctx.adminId, note })
      await logAdmin(ctx, 'stock.adjust', `product:${id}`, { change, reason, stock: after, note }, db)
      return upd[0]
    })
    sendJson(ctx.res, 200, { product: { id: product.id, stock: product.stock, inStock: product.in_stock } })
  })

  router.get('/api/admin/products/:id/stock', requireAdmin, async (ctx) => {
    const id = idParam(ctx)
    const { rows } = await query(
      `SELECT m.*, a.username, o.code AS order_code FROM stock_movements m
       LEFT JOIN admins a ON a.id = m.admin_id LEFT JOIN orders o ON o.id = m.order_id
       WHERE m.product_id = $1 ORDER BY m.id DESC LIMIT 100`,
      [id],
    )
    sendJson(ctx.res, 200, {
      movements: rows.map((m) => ({
        id: m.id, change: m.change, stockAfter: m.stock_after, reason: m.reason, note: m.note,
        orderCode: m.order_code || '', admin: m.username || '', createdAt: m.created_at,
      })),
    })
  })

  // One customer's orders (customer list → "Orders").
  router.get('/api/admin/customers/:id/orders', requireAdmin, async (ctx) => {
    const id = idParam(ctx)
    const { rows } = await query('SELECT * FROM orders WHERE customer_id = $1 ORDER BY created_at DESC LIMIT 100', [id])
    const items = await itemsFor(rows.map((r) => r.id))
    sendJson(ctx.res, 200, {
      orders: rows.map((o) => ({ ...shortOrder(o), items: items.get(o.id).map((i) => ({ names: i.names, qty: i.qty, price: i.price })) })),
    })
  })
}

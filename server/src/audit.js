// Admin activity log: who did what, when, from where. Written next to the
// change itself (same transaction when one is given), read in admin → Log.
import { query } from './db.js'
import { clientIp } from './http.js'

// db = transaction client or omitted; ctx gives the admin and the IP.
export async function logAdmin(ctx, action, target = '', details = {}, db = null) {
  const run = db ? (...a) => db.query(...a) : query
  await run(
    `INSERT INTO admin_log (admin_id, admin_name, action, target, details, ip)
     VALUES ($1, coalesce((SELECT username FROM admins WHERE id = $1), $6), $2, $3, $4, $5)`,
    [ctx.adminId || null, action, String(target).slice(0, 200), JSON.stringify(details), clientIp(ctx.req).slice(0, 100), details.username ? String(details.username).slice(0, 100) : ''],
  )
}

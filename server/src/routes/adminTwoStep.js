// Two-step login for the admin panel: the code step of logging in, and
// turning it on / off in admin → Settings.
import { query, transaction } from '../db.js'
import { HttpError, badRequest, sendJson } from '../http.js'
import { endOtherSessions, failureLimit, limit, requireAdmin, startSession, verifyPassword } from '../security.js'
import { logAdmin } from '../audit.js'
import {
  backupCodesLeft, checkSecondStep, endPendingLogin, matchStep, newBackupCodes, newSecret, otpauthUrl, pendingLogin, qrDataUrl,
} from '../twoStep.js'
import { json } from './common.js'

export const ADMIN_HOURS = 12
// wrong codes for one admin, from all IP addresses together
const codeFailures = failureLimit('admin-code', 10, 15)

async function checkPassword(ctx) {
  const password = typeof ctx.body.password === 'string' ? ctx.body.password.slice(0, 200) : ''
  const { rows } = await query('SELECT password_hash FROM admins WHERE id = $1', [ctx.adminId])
  if (!rows[0] || !(await verifyPassword(password, rows[0].password_hash))) throw new HttpError(401, 'invalid_credentials')
}

// The code from the phone (or a backup code) for a signed-in admin; 400 when wrong.
async function checkCode(ctx) {
  codeFailures.check(ctx, ctx.adminId)
  const how = await checkSecondStep(ctx.adminId, ctx.body.code)
  if (!how) {
    codeFailures.fail(ctx.adminId)
    throw badRequest({ code: 'wrong' })
  }
  return how
}

export function register(router) {
  // Second step of logging in. Body: { ticket, code } (ticket from /api/admin/login).
  router.post('/api/admin/login/code', json(), limit('admin-code-ip', 30, 15), async (ctx) => {
    const p = pendingLogin(ctx.body.ticket)
    if (!p) throw new HttpError(401, 'login_expired') // log in with the password again
    ctx.adminId = p.adminId
    codeFailures.check(ctx, p.adminId)
    const how = await checkSecondStep(p.adminId, ctx.body.code)
    if (!how) {
      p.tries++
      codeFailures.fail(p.adminId)
      await logAdmin(ctx, 'admin.code_failed')
      throw new HttpError(401, 'invalid_code')
    }
    endPendingLogin(ctx.body.ticket)
    await logAdmin(ctx, 'admin.login', '', { backupCode: how === 'backup' })
    await startSession(ctx.res, 'admin', p.adminId, { hours: ADMIN_HOURS, remember: false })
    const { rows } = await query('SELECT username FROM admins WHERE id = $1', [p.adminId])
    sendJson(ctx.res, 200, { admin: { username: rows[0].username }, backupCodesLeft: how === 'backup' ? await backupCodesLeft(p.adminId) : undefined })
  })

  // Is it on? How many backup codes are left?
  router.get('/api/admin/two-step', requireAdmin, async (ctx) => {
    const { rows } = await query('SELECT totp_secret IS NOT NULL AS enabled FROM admins WHERE id = $1', [ctx.adminId])
    sendJson(ctx.res, 200, { enabled: rows[0].enabled, backupCodesLeft: rows[0].enabled ? await backupCodesLeft(ctx.adminId) : 0 })
  })

  // Step 1 of turning it on: password again, then a new key + QR code for the phone.
  router.post('/api/admin/two-step/start', json(), requireAdmin, limit('admin-two-step', 20, 15), async (ctx) => {
    await checkPassword(ctx)
    const { rows } = await query('SELECT username, totp_secret FROM admins WHERE id = $1', [ctx.adminId])
    if (rows[0].totp_secret) throw new HttpError(409, 'two_step_on')
    const secret = newSecret()
    await query('UPDATE admins SET totp_pending = $2 WHERE id = $1', [ctx.adminId, secret])
    const url = otpauthUrl(secret, rows[0].username)
    sendJson(ctx.res, 200, { secret, qr: await qrDataUrl(url) })
  })

  // Step 2: the first code from the phone proves the app is set up. Turns it
  // on, gives the backup codes (shown once) and logs out other devices.
  router.post('/api/admin/two-step/enable', json(), requireAdmin, limit('admin-two-step', 20, 15), async (ctx) => {
    const { rows } = await query('SELECT totp_pending, totp_secret FROM admins WHERE id = $1', [ctx.adminId])
    if (rows[0].totp_secret) throw new HttpError(409, 'two_step_on')
    if (!rows[0].totp_pending) throw new HttpError(409, 'no_setup')
    codeFailures.check(ctx, ctx.adminId)
    const step = matchStep(rows[0].totp_pending, String(ctx.body.code || '').replace(/\s/g, ''))
    if (step === null) {
      codeFailures.fail(ctx.adminId)
      throw badRequest({ code: 'wrong' })
    }
    const codes = await transaction(async (db) => {
      await db.query('UPDATE admins SET totp_secret = totp_pending, totp_pending = NULL, totp_last_step = $2 WHERE id = $1', [ctx.adminId, step])
      const c = await newBackupCodes(db, ctx.adminId)
      await logAdmin(ctx, 'admin.two_step_on', '', {}, db)
      return c
    })
    await endOtherSessions(ctx.req, 'admin', ctx.adminId)
    sendJson(ctx.res, 200, { backupCodes: codes })
  })

  // Turn it off: password and a code (from the phone or a backup code).
  router.post('/api/admin/two-step/disable', json(), requireAdmin, limit('admin-two-step', 20, 15), async (ctx) => {
    await checkPassword(ctx)
    await checkCode(ctx)
    await transaction(async (db) => {
      await db.query('UPDATE admins SET totp_secret = NULL, totp_pending = NULL, totp_last_step = NULL WHERE id = $1', [ctx.adminId])
      await db.query('DELETE FROM admin_backup_codes WHERE admin_id = $1', [ctx.adminId])
      await logAdmin(ctx, 'admin.two_step_off', '', {}, db)
    })
    sendJson(ctx.res, 200, { ok: true })
  })

  // New backup codes (the old ones stop working). Needs a code.
  router.post('/api/admin/two-step/backup-codes', json(), requireAdmin, limit('admin-two-step', 20, 15), async (ctx) => {
    const { rows } = await query('SELECT totp_secret IS NOT NULL AS enabled FROM admins WHERE id = $1', [ctx.adminId])
    if (!rows[0].enabled) throw new HttpError(409, 'two_step_off')
    await checkCode(ctx)
    const codes = await transaction(async (db) => {
      const c = await newBackupCodes(db, ctx.adminId)
      await logAdmin(ctx, 'admin.backup_codes', '', {}, db)
      return c
    })
    sendJson(ctx.res, 200, { backupCodes: codes })
  })
}

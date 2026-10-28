// Turns off two-step login for one admin, when the phone and the backup
// codes are both lost. Also logs that admin out everywhere.
// Usage: npm run two-step-off            (asks for the admin username)
import readline from 'node:readline/promises'
import { pool } from '../src/db.js'

const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
try {
  const username = (await rl.question('Admin username: ')).trim()
  const { rows } = await pool.query(
    `UPDATE admins SET totp_secret = NULL, totp_pending = NULL, totp_last_step = NULL
     WHERE lower(username) = lower($1) RETURNING id, username`,
    [username],
  )
  if (!rows[0]) throw new Error(`There is no admin "${username}".`)
  await pool.query('DELETE FROM admin_backup_codes WHERE admin_id = $1', [rows[0].id])
  await pool.query(`DELETE FROM sessions WHERE kind = 'admin' AND admin_id = $1`, [rows[0].id])
  await pool.query(
    `INSERT INTO admin_log (admin_id, admin_name, action, target, details, ip) VALUES ($1, $2, 'admin.two_step_off', '', '{"from":"server"}', 'server')`,
    [rows[0].id, rows[0].username],
  )
  console.log(`Two-step login is off for "${username}". Log in with the password and turn it on again in Settings.`)
} catch (err) {
  console.error(err.message)
  process.exitCode = 1
} finally {
  rl.close()
  await pool.end()
}

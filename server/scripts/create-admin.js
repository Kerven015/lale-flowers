// Creates an admin account, or sets a new password for an existing one.
// Usage: npm run create-admin            (asks for the name and password)
import readline from 'node:readline'
import { pool } from '../src/db.js'
import { hashPassword } from '../src/security.js'

const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: !!process.stdin.isTTY })
const lines = rl[Symbol.asyncIterator]()
let hiding = false
// while typing a password, show * instead of the letters
const write = rl._writeToOutput?.bind(rl)
if (write) rl._writeToOutput = (s) => write(hiding && !/[\r\n]/.test(s) ? '*'.repeat(s.length) : s)

async function ask(question, hidden = false) {
  process.stdout.write(question)
  hiding = hidden && !!process.stdin.isTTY
  const { value, done } = await lines.next()
  hiding = false
  if (!process.stdin.isTTY) process.stdout.write('\n')
  if (done) throw new Error('Cancelled.')
  return value
}

try {
  const username = (await ask('Admin username: ')).trim()
  if (!username || username.length > 100) throw new Error('Please enter a username.')
  const password = await ask('Password (at least 8 characters): ', true)
  if (password.length < 8) throw new Error('The password must be at least 8 characters.')
  const again = await ask('Repeat the password: ', true)
  if (again !== password) throw new Error('The passwords do not match.')

  const hash = await hashPassword(password)
  const { rows } = await pool.query('SELECT id FROM admins WHERE lower(username) = lower($1)', [username])
  if (rows[0]) {
    await pool.query('UPDATE admins SET password_hash = $2 WHERE id = $1', [rows[0].id, hash])
    await pool.query(`DELETE FROM sessions WHERE kind = 'admin' AND admin_id = $1`, [rows[0].id])
    console.log(`Password changed for "${username}".`)
  } else {
    await pool.query('INSERT INTO admins (username, password_hash) VALUES ($1, $2)', [username, hash])
    console.log(`Admin "${username}" created.`)
  }
} catch (err) {
  console.error(err.message)
  process.exitCode = 1
} finally {
  rl.close()
  await pool.end()
}

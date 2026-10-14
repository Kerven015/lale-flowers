// Creates / updates the database tables. Safe to run again: every file in
// migrations/ runs only once.   Usage: npm run migrate
import fs from 'node:fs'
import path from 'node:path'
import { SERVER_DIR } from '../src/config.js'
import { pool } from '../src/db.js'

const dir = path.join(SERVER_DIR, 'migrations')
const client = await pool.connect()
try {
  await client.query('CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())')
  const done = new Set((await client.query('SELECT name FROM schema_migrations')).rows.map((r) => r.name))
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()
  let count = 0
  for (const file of files) {
    if (done.has(file)) continue
    const sql = fs.readFileSync(path.join(dir, file), 'utf8')
    await client.query('BEGIN')
    try {
      await client.query(sql)
      await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file])
      await client.query('COMMIT')
      console.log('applied', file)
      count++
    } catch (err) {
      await client.query('ROLLBACK')
      throw new Error(`${file}: ${err.message}`)
    }
  }
  console.log(count ? `Done: ${count} migration(s) applied.` : 'Database is up to date.')
} catch (err) {
  console.error('Migration failed:', err.message)
  process.exitCode = 1
} finally {
  client.release()
  await pool.end()
}

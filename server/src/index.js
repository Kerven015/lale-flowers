import { config } from './config.js'
import { pool } from './db.js'
import { createApp } from './app.js'
import { deleteExpiredSessions } from './security.js'
import { ensureUploadDir } from './uploads.js'

await ensureUploadDir()
await pool.query('SELECT 1') // stop early if the database is not reachable

const server = createApp()
server.listen(config.port, config.host, () => {
  console.log(`Läle Gülleri server: http://${config.host}:${config.port}${config.staticDir ? ' (website + API)' : ' (API)'}`)
})

const cleanup = setInterval(() => deleteExpiredSessions().catch((e) => console.error('session cleanup', e.message)), 60 * 60 * 1000)
cleanup.unref()

function shutdown() {
  console.log('Stopping...')
  server.close(() => pool.end().finally(() => process.exit(0)))
  setTimeout(() => process.exit(0), 10_000).unref()
}
process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)

import http from 'node:http'
import path from 'node:path'
import { config } from './config.js'
import { HttpError, Router, isHttps, sendJson, serveFile } from './http.js'
import { isUploadFileName } from './uploads.js'
import * as shop from './routes/shop.js'
import * as account from './routes/account.js'
import * as admin from './routes/admin.js'
import * as adminInsights from './routes/adminInsights.js'
import * as adminTwoStep from './routes/adminTwoStep.js'

// exported for the tests (they check every admin route needs the admin login)
export const router = new Router()
shop.register(router)
account.register(router)
admin.register(router)
adminInsights.register(router)
adminTwoStep.register(router)

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

// Blocks other websites from sending requests with the visitor's cookies:
// changes need the X-Lale header (a browser on another site cannot add it
// without our permission), and a foreign Origin is refused.
function checkRequestSource(req) {
  if (SAFE_METHODS.has(req.method)) return
  if (req.headers['x-lale'] !== '1') throw new HttpError(403, 'forbidden')
  const origin = req.headers.origin
  if (!origin) return
  // X-Forwarded-Host is only believed behind our own proxy (Nginx / Caddy)
  const host = (config.trustProxy && req.headers['x-forwarded-host']) || req.headers.host
  let originHost = ''
  try { originHost = new URL(origin).host } catch {}
  if (originHost && originHost === host) return
  if (config.allowedOrigins.includes(origin.replace(/\/$/, ''))) return
  throw new HttpError(403, 'forbidden')
}

// What pages may load. Only this site, plus Google's sign-in button (script,
// its style and its frame). Inline styles stay allowed (React and the Google
// button use them); inline scripts do not, so injected HTML cannot run code.
const GSI = 'https://accounts.google.com/gsi/'
export const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  `script-src 'self' ${GSI}client`,
  `style-src 'self' 'unsafe-inline' ${GSI}style`,
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  `connect-src 'self' ${GSI}`,
  `frame-src ${GSI}`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'self'",
].join('; ')

function securityHeaders(req, res) {
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin')
  res.setHeader('X-Frame-Options', 'SAMEORIGIN')
  // lets the "Sign in with Google" pop-up report back to this page
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups')
  res.setHeader('Content-Security-Policy', CONTENT_SECURITY_POLICY)
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()')
  // browsers ignore it over plain HTTP; sent only over HTTPS so a test over http stays usable
  if (isHttps(req)) res.setHeader('Strict-Transport-Security', 'max-age=31536000')
}

async function handle(req, res) {
  securityHeaders(req, res)
  const url = new URL(req.url, 'http://local')
  const pathname = url.pathname

  if (pathname.startsWith('/api/')) {
    try {
      checkRequestSource(req)
      const m = router.match(req.method === 'HEAD' ? 'GET' : req.method, pathname)
      if (!m.handlers) throw new HttpError(m.allowed?.length ? 405 : 404, m.allowed?.length ? 'method_not_allowed' : 'not_found')
      const ctx = { req, res, url, params: m.params, body: {} }
      for (const h of m.handlers) {
        await h(ctx)
        if (res.writableEnded || res.headersSent) break
      }
      if (!res.headersSent) throw new HttpError(500, 'no_response')
    } catch (err) {
      if (res.headersSent) { res.destroy(); return }
      if (err instanceof HttpError) {
        if (err.status >= 500) console.error(req.method, pathname, err)
        sendJson(res, err.status, { error: err.code, ...err.extra })
      } else {
        console.error(new Date().toISOString(), req.method, pathname, err)
        sendJson(res, 500, { error: 'server_error' })
      }
    }
    return
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); res.end(); return }

  // uploaded product photos
  if (pathname.startsWith('/uploads/')) {
    const name = pathname.slice('/uploads/'.length)
    if (isUploadFileName(name) && serveFile(req, res, config.uploadDir, name, { immutable: true })) return
    res.writeHead(404); res.end(); return
  }

  // the built website (optional; Nginx usually does this)
  if (config.staticDir) {
    const immutable = pathname.startsWith('/assets/')
    if (pathname !== '/' && serveFile(req, res, config.staticDir, pathname, { immutable })) return
    // any page address (/catalog, /product/5 ...) gets the website's index.html
    if (!path.extname(pathname) && serveFile(req, res, config.staticDir, '/index.html')) return
  }
  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
  res.end('Not found')
}

export function createApp() {
  const server = http.createServer((req, res) => {
    handle(req, res).catch((err) => {
      console.error('Unexpected error', err)
      if (!res.headersSent) { res.writeHead(500); res.end() }
    })
  })
  server.requestTimeout = 60_000
  server.headersTimeout = 20_000
  return server
}

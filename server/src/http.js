// Small HTTP toolkit on top of Node's built-in http module: routing, JSON
// bodies, cookies, errors and static files. No extra packages needed.
import fs from 'node:fs'
import path from 'node:path'
import { config } from './config.js'

export class HttpError extends Error {
  // code = short machine-readable reason the website translates
  constructor(status, code, extra = {}) {
    super(code)
    this.status = status
    this.code = code
    this.extra = extra
  }
}

export const badRequest = (fields) => new HttpError(400, 'validation', { fields })

export function sendJson(res, status, body) {
  const data = JSON.stringify(body)
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(data),
    'Cache-Control': 'no-store',
  })
  res.end(data)
}

export async function readJson(req, limit = 100 * 1024) {
  const type = String(req.headers['content-type'] || '')
  if (!type.includes('application/json')) throw new HttpError(415, 'json_required')
  const declared = Number(req.headers['content-length'] || 0)
  if (declared > limit) throw new HttpError(413, 'too_large')
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > limit) throw new HttpError(413, 'too_large')
    chunks.push(chunk)
  }
  if (!size) return {}
  try {
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('not an object')
    return body
  } catch {
    throw new HttpError(400, 'bad_json')
  }
}

export function parseCookies(req) {
  const out = {}
  for (const part of String(req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=')
    if (i < 0) continue
    const k = part.slice(0, i).trim()
    if (!k) continue
    // a damaged cookie value must not break the whole request
    try { out[k] = decodeURIComponent(part.slice(i + 1).trim()) } catch { out[k] = '' }
  }
  return out
}

// maxAge in seconds; null = cookie lasts until the browser closes; 0 = delete
export function setCookie(res, name, value, { maxAge = null, path: p = '/' } = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`, `Path=${p}`, 'HttpOnly', 'SameSite=Lax']
  if (config.cookieSecure) parts.push('Secure')
  if (maxAge !== null) parts.push(`Max-Age=${maxAge}`)
  const prev = res.getHeader('Set-Cookie')
  res.setHeader('Set-Cookie', [...(Array.isArray(prev) ? prev : prev ? [prev] : []), parts.join('; ')])
}

export function clientIp(req) {
  if (config.trustProxy) {
    const real = req.headers['x-real-ip'] || String(req.headers['x-forwarded-for'] || '').split(',')[0]
    if (real) return String(real).trim()
  }
  return req.socket.remoteAddress || 'unknown'
}

// ---- routing ---------------------------------------------------------------
export class Router {
  constructor() { this.routes = [] }
  add(method, pattern, ...handlers) {
    const keys = []
    const re = new RegExp('^' + pattern.replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^/]+)' }) + '/?$')
    this.routes.push({ method, pattern, re, keys, handlers })
    return this
  }
  get(p, ...h) { return this.add('GET', p, ...h) }
  post(p, ...h) { return this.add('POST', p, ...h) }
  put(p, ...h) { return this.add('PUT', p, ...h) }
  patch(p, ...h) { return this.add('PATCH', p, ...h) }
  delete(p, ...h) { return this.add('DELETE', p, ...h) }

  // returns { handlers, params } or { allowed: [...] } when only the method differs
  match(method, pathname) {
    const allowed = []
    for (const r of this.routes) {
      const m = r.re.exec(pathname)
      if (!m) continue
      if (r.method !== method) { allowed.push(r.method); continue }
      const params = {}
      r.keys.forEach((k, i) => {
        try { params[k] = decodeURIComponent(m[i + 1]) } catch { params[k] = m[i + 1] }
      })
      return { handlers: r.handlers, params }
    }
    return { allowed }
  }
}

// ---- static files ----------------------------------------------------------
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon', '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json',
}

// Serves a file that is inside `root`. Returns false when there is no such file.
export function serveFile(req, res, root, relPath, { immutable = false } = {}) {
  let rel
  try { rel = decodeURIComponent(relPath) } catch { return false }
  const file = path.resolve(root, '.' + path.posix.normalize('/' + rel))
  if (!file.startsWith(path.resolve(root) + path.sep)) return false
  let stat
  try { stat = fs.statSync(file) } catch { return false }
  if (!stat.isFile()) return false
  const ext = path.extname(file).toLowerCase()
  res.writeHead(200, {
    'Content-Type': TYPES[ext] || 'application/octet-stream',
    'Content-Length': stat.size,
    'Cache-Control': immutable ? 'public, max-age=31536000, immutable' : ext === '.html' ? 'no-cache' : 'public, max-age=3600',
    'X-Content-Type-Options': 'nosniff',
  })
  if (req.method === 'HEAD') { res.end(); return true }
  // if the file disappears while it is being sent, close this one response
  // (an unhandled stream error would stop the whole server)
  fs.createReadStream(file).on('error', () => res.destroy()).pipe(res)
  return true
}

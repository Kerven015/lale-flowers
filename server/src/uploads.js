// Product photos. The admin panel sends photos as data URLs (already resized
// and compressed in the browser); they are checked and saved as files.
import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { SHOP, config } from './config.js'

const DATA_URL_RE = /^data:image\/(webp|jpeg|png);base64,([A-Za-z0-9+/]+={0,2})$/
const UPLOAD_URL_RE = /^\/uploads\/([a-f0-9]{32})\.(webp|jpg|png)$/
// Photos that ship with the website (public/images/...)
const BUILTIN_URL_RE = /^\/images\/[A-Za-z0-9_\-./%]+\.(jpg|jpeg|png|webp)$/

function looksLike(buf, kind) {
  if (kind === 'jpeg') return buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff
  if (kind === 'png') return buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  if (kind === 'webp') return buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP'
  return false
}

export async function ensureUploadDir() {
  await fs.mkdir(config.uploadDir, { recursive: true })
}

// Turns the list from the admin form into a list of URLs. New photos are only
// checked here; call commit() to write them to disk.
// Returns { urls, pending, error }.
export function preparePhotos(list) {
  if (!Array.isArray(list)) return { error: 'invalid' }
  if (list.length > SHOP.maxPhotos) return { error: 'too_many' }
  const urls = []
  const pending = []
  for (const item of list) {
    if (typeof item !== 'string') return { error: 'invalid' }
    if (UPLOAD_URL_RE.test(item) || (BUILTIN_URL_RE.test(item) && !item.includes('..'))) { urls.push(item); continue }
    const m = DATA_URL_RE.exec(item)
    if (!m) return { error: 'invalid' }
    const kind = m[1]
    const buf = Buffer.from(m[2], 'base64')
    if (!buf.length || buf.length > SHOP.maxPhotoBytes) return { error: 'too_large' }
    if (!looksLike(buf, kind)) return { error: 'not_image' }
    const name = `${crypto.randomBytes(16).toString('hex')}.${kind === 'jpeg' ? 'jpg' : kind}`
    pending.push({ name, buf })
    urls.push(`/uploads/${name}`)
  }
  return { urls, pending }
}

export async function commitPhotos(pending) {
  await ensureUploadDir()
  for (const p of pending) await fs.writeFile(path.join(config.uploadDir, p.name), p.buf, { flag: 'wx' })
}

// Deletes uploaded files that are no longer used (built-in photos are kept).
export async function removePhotos(urls) {
  for (const url of urls || []) {
    const m = UPLOAD_URL_RE.exec(url)
    if (!m) continue
    try { await fs.unlink(path.join(config.uploadDir, `${m[1]}.${m[2]}`)) } catch {}
  }
}

// Copies uploaded photos under new names (for a duplicated product, so
// deleting one product never removes the other's photos). Built-in photos
// are shared as they are. Returns the new URLs, in the same order.
export async function copyPhotos(urls) {
  await ensureUploadDir()
  const out = []
  for (const url of urls || []) {
    const m = UPLOAD_URL_RE.exec(url)
    if (!m) { out.push(url); continue }
    const name = `${crypto.randomBytes(16).toString('hex')}.${m[2]}`
    try {
      await fs.copyFile(path.join(config.uploadDir, `${m[1]}.${m[2]}`), path.join(config.uploadDir, name), fs.constants.COPYFILE_EXCL)
      out.push(`/uploads/${name}`)
    } catch {} // a missing file is simply left out
  }
  return out
}

export const isUploadFileName = (name) => /^[a-f0-9]{32}\.(webp|jpg|png)$/.test(name)

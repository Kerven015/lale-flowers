// Settings come from server/.env (see .env.example).
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
export const SERVER_DIR = path.resolve(here, '..')

const env = process.env
const flag = (v, fallback) => (v === undefined || v === '' ? fallback : ['1', 'true', 'yes'].includes(String(v).toLowerCase()))
const production = env.NODE_ENV === 'production'

if (!env.DATABASE_URL) {
  console.error('DATABASE_URL is missing. Copy server/.env.example to server/.env and fill it in.')
  process.exit(1)
}

export const config = {
  production,
  databaseUrl: env.DATABASE_URL,
  port: Number(env.PORT) || 3000,
  host: env.HOST || '127.0.0.1',
  uploadDir: path.resolve(SERVER_DIR, env.UPLOAD_DIR || 'uploads'),
  // Optional: the built website (dist folder). When set, this server also
  // serves the website itself, so one process runs the whole shop.
  staticDir: env.STATIC_DIR ? path.resolve(SERVER_DIR, env.STATIC_DIR) : null,
  // Cookies only over HTTPS. Must be on for the real site (HTTPS).
  cookieSecure: flag(env.COOKIE_SECURE, production),
  // Behind Nginx: take the visitor's IP from X-Real-IP / X-Forwarded-For.
  trustProxy: flag(env.TRUST_PROXY, false),
  // Extra allowed site addresses (comma separated), e.g. https://lalegulleri.tm
  allowedOrigins: (env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim().replace(/\/$/, '')).filter(Boolean),
  // "Continue with Google": the public OAuth Client ID from Google Cloud
  // Console (see docs/google-sign-in.md). Empty = Google sign-in is switched off.
  googleClientId: (env.GOOGLE_CLIENT_ID || '').trim() || null,
}

// Shop rules. Keep in sync with src/store/cartSlice.js (FREE_FROM, DELIVERY_PRICE).
export const SHOP = {
  freeDeliveryFrom: 200,
  deliveryPrice: 25,
  maxQty: 99,
  maxOrderLines: 50,
  maxPhotos: 8,
  maxPhotoBytes: 3 * 1024 * 1024,
}

export const LANGS = ['tm', 'ru', 'tr']

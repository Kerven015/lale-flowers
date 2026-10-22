// Shop settings the admin can change (Settings tab): delivery prices,
// contacts, pausing orders, the first-order discount. Kept in the settings
// table; read often, so a copy is kept in memory until the admin saves.
import { LANGS } from './config.js'
import { query } from './db.js'

export const SHOP_DEFAULTS = {
  deliveryPrice: 25,
  freeDeliveryFrom: 200,
  ordersOpen: true,
  firstOrderDiscount: 10, // % off the flowers on a customer's first order, 0 = off
  phone: '',
  email: '',
  instagram: '',
  address: { tm: '', ru: '', tr: '' },
  hours: { tm: '', ru: '', tr: '' },
  lowStockThreshold: 5,      // dashboard warns when a counted flower has this many or fewer
  // Scheduled delivery: the customer may pick a day and a time slot.
  scheduledDelivery: true,
  deliverySlots: ['09:00–12:00', '12:00–15:00', '15:00–18:00', '18:00–21:00'],
  deliveryDaysAhead: 14,     // how far ahead a day can be chosen (0 = today only)
  slotCapacity: 0,           // orders per day + slot, 0 = no limit
}

// A slot is "HH:MM–HH:MM" (en dash or hyphen).
export const SLOT_RE = /^([01]\d|2[0-3]):([0-5]\d)\s*[–-]\s*([01]\d|2[0-3]|24):([0-5]\d)$/
export const slotStart = (slot) => { const m = SLOT_RE.exec(slot); return m ? Number(m[1]) * 60 + Number(m[2]) : null }

let cached = null

export async function getShopSettings() {
  if (!cached) {
    const { rows } = await query(`SELECT value FROM settings WHERE key = 'shop'`)
    cached = { ...SHOP_DEFAULTS, ...(rows[0]?.value || {}) }
  }
  return cached
}

export function forgetShopSettings() {
  cached = null
}

const clean = (v, max) => String(v ?? '').replace(/[\u0000-\u001F\u007F]/g, ' ').trim().slice(0, max)

function wholeNumber(errors, body, field, min, max) {
  const n = Number(body[field])
  if (body[field] === '' || body[field] === null || !Number.isInteger(n) || n < min || n > max) { errors[field] = 'invalid'; return 0 }
  return n
}

// Checks the Settings form. Returns { data } or { errors }.
export function checkShopSettings(body) {
  const errors = {}
  const b = body && typeof body === 'object' ? body : {}
  const data = {
    deliveryPrice: wholeNumber(errors, b, 'deliveryPrice', 0, 100_000),
    freeDeliveryFrom: wholeNumber(errors, b, 'freeDeliveryFrom', 0, 1_000_000),
    firstOrderDiscount: wholeNumber(errors, b, 'firstOrderDiscount', 0, 90),
    ordersOpen: b.ordersOpen !== false,
    phone: clean(b.phone, 40),
    email: clean(b.email, 254),
    instagram: clean(b.instagram, 300),
    address: Object.fromEntries(LANGS.map((l) => [l, clean(b.address?.[l], 200)])),
    hours: Object.fromEntries(LANGS.map((l) => [l, clean(b.hours?.[l], 200)])),
    lowStockThreshold: wholeNumber(errors, b, 'lowStockThreshold', 0, 10_000),
    scheduledDelivery: b.scheduledDelivery !== false,
    deliverySlots: [],
    deliveryDaysAhead: wholeNumber(errors, b, 'deliveryDaysAhead', 0, 90),
    slotCapacity: wholeNumber(errors, b, 'slotCapacity', 0, 10_000),
  }
  const slots = Array.isArray(b.deliverySlots) ? b.deliverySlots.map((s) => clean(s, 20).replace(/\s*[–-]\s*/, '–')).filter(Boolean) : null
  if (!slots || slots.length > 12 || slots.some((s) => !SLOT_RE.test(s)) || new Set(slots).size !== slots.length) errors.deliverySlots = 'invalid'
  else data.deliverySlots = slots
  if (data.scheduledDelivery && !data.deliverySlots.length && !errors.deliverySlots) errors.deliverySlots = 'invalid'
  if (data.phone && !/^\+?[0-9][0-9\s\-()]{4,30}$/.test(data.phone)) errors.phone = 'invalid'
  if (data.email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(data.email)) errors.email = 'invalid'
  // only real web links (no javascript: and the like)
  if (data.instagram && !/^https:\/\/[^\s"'<>]+$/.test(data.instagram)) errors.instagram = 'invalid'
  return Object.keys(errors).length ? { errors } : { data }
}

export async function saveShopSettings(data) {
  await query(
    `INSERT INTO settings (key, value) VALUES ('shop', $1)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
    [JSON.stringify(data)],
  )
  forgetShopSettings()
  return getShopSettings()
}

// Delivery fee for a basket. Free from freeDeliveryFrom (counted on the
// flowers' price before any discount) and for pickup.
export function deliveryFee(settings, subtotal, deliveryType) {
  if (deliveryType === 'pickup' || subtotal === 0) return 0
  return subtotal >= settings.freeDeliveryFrom ? 0 : settings.deliveryPrice
}

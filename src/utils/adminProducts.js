// Admin product form: quick checks in the browser before sending to the
// server (the server checks everything again — it is the one that decides).
import { OTHER_TYPE, TAG_KEYS } from './productTypes'

export const MAX_PHOTOS = 8
export const ADMIN_TYPES = ['roses', 'tulips', 'bouquets', 'gifts', 'plants', OTHER_TYPE]

// Returns { ok: true } or { ok: false, errors: { field: messageKey } }
// form.images = photo URLs / data URLs in order (first = main photo).
// opts.editing: an existing product may be saved without photos.
export function validateForm(form, opts = {}) {
  const errors = {}
  if (!String(form.name || '').trim()) errors.name = 'name'
  if (!ADMIN_TYPES.includes(form.type)) errors.type = 'type'
  if (form.type === OTHER_TYPE && !String(form.customType || '').trim()) errors.customType = 'customType'
  if (!TAG_KEYS.some((k) => (form.occasions || []).includes(k))) errors.occasions = 'occasions'
  const price = Number(form.price)
  if (form.price === '' || !Number.isFinite(price) || price <= 0) errors.price = 'price'
  if (String(form.old ?? '').trim() !== '') {
    const old = Number(form.old)
    if (!Number.isFinite(old) || old <= price) errors.old = 'old'
  }
  const optional = (field, min, max, whole = true) => {
    const v = String(form[field] ?? '').trim()
    if (v === '') return
    const n = Number(v)
    if (!Number.isFinite(n) || n < min || n > max || (whole && !Number.isInteger(n))) errors[field] = field
  }
  optional('stock', 0, 100000)
  optional('sortOrder', 0, 1000000)
  optional('rating', 0, 5, false)
  optional('reviews', 0, 10000000)
  if (!(form.images || []).length && !opts.editing) errors.image = 'image'
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true }
}

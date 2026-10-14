// Input checks. Each helper returns the cleaned value or records an error code
// in `errors[field]` (the website shows a translated message for it).

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
export const PHONE_RE = /^\+?[0-9][0-9\s\-()]{5,19}$/

export function text(errors, body, field, { required = false, max = 200, min = 0 } = {}) {
  const raw = body?.[field]
  if (raw !== undefined && raw !== null && typeof raw !== 'string' && typeof raw !== 'number') { errors[field] = 'invalid'; return '' }
  // remove control characters (keep line breaks and tabs), trim
  const v = String(raw ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim()
  if (required && !v) errors[field] = 'required'
  else if (v.length > max) errors[field] = 'too_long'
  else if (v && v.length < min) errors[field] = 'too_short'
  return v.slice(0, max)
}

export function email(errors, body, field, { required = true } = {}) {
  const v = text(errors, body, field, { required, max: 254 }).toLowerCase()
  if (v && !errors[field] && !EMAIL_RE.test(v)) errors[field] = 'invalid'
  return v
}

export function phone(errors, body, field, { required = true } = {}) {
  const v = text(errors, body, field, { required, max: 30 })
  if (v && !errors[field] && !PHONE_RE.test(v)) errors[field] = 'invalid'
  return v
}

export function oneOf(errors, body, field, allowed, fallback) {
  const v = body?.[field] ?? fallback
  if (!allowed.includes(v)) { errors[field] = 'invalid'; return fallback }
  return v
}

export function int(errors, body, field, { min = -Infinity, max = Infinity, required = true } = {}) {
  const raw = body?.[field]
  if ((raw === undefined || raw === null || raw === '') && !required) return null
  const n = typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : raw
  if (typeof n !== 'number' || !Number.isFinite(n)) { errors[field] = required && (raw === undefined || raw === '') ? 'required' : 'invalid'; return null }
  const r = Math.round(n)
  if (r < min || r > max) { errors[field] = 'invalid'; return null }
  return r
}

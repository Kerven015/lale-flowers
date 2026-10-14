// Form checks in the site's language. The forms use noValidate, so the
// browser's own bubbles ("Please fill out this field", always in the
// browser's language) never appear. The server checks everything again.
//
// Errors are kept as translation keys (not text), so they switch language
// together with the rest of the page.

// Same rules as the server (server/src/validate.js)
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
export const PHONE_RE = /^\+?[0-9][0-9\s\-()]{5,19}$/

// rules: { fieldName: { required, email, phone, min, agree } }
// Returns { fieldName: translationKey } for every field with a problem.
export function checkFields(form, rules) {
  const errors = {}
  for (const [name, r] of Object.entries(rules)) {
    const el = form.elements[name]
    if (!el) continue
    if (el.type === 'checkbox') {
      if (r.required && !el.checked) errors[name] = 'form.agree'
      continue
    }
    const v = String(el.value || '').trim()
    if (r.required && !v) errors[name] = 'form.required'
    else if (v && r.email && !EMAIL_RE.test(v)) errors[name] = 'auth.errEmail'
    else if (v && r.phone && !PHONE_RE.test(v)) errors[name] = 'auth.errPhone'
    else if (v && r.min && el.value.length < r.min) errors[name] = 'auth.errPass'
  }
  return errors
}

// Puts the cursor in the first field (in page order) that has an error.
export function focusFirstError(form, errors) {
  const el = [...form.elements].find((e) => e.name && errors[e.name])
  el?.focus()
}

// Removes one field's error as soon as the visitor edits that field.
export const clearError = (setErrors) => (e) => {
  const n = e.target.name
  if (n) setErrors((er) => (er[n] ? { ...er, [n]: undefined } : er))
}

// Translation key for a field error sent by the server ('required',
// 'invalid', 'too_short' ...).
export function serverFieldKey(field, code) {
  if (code === 'required') return 'form.required'
  if (field === 'email') return 'auth.errEmail'
  if (field === 'phone') return 'auth.errPhone'
  if (field === 'password' || field === 'next') return 'auth.errPass'
  return 'err.validation'
}

export const keysFromServer = (fields = {}) =>
  Object.fromEntries(Object.entries(fields).map(([k, c]) => [k, serverFieldKey(k, c)]))

// Talks to the shop's server (server/ folder). The website and the server are
// on the same address: the server answers everything under /api/.

export class ApiError extends Error {
  constructor(status, code, data = null) {
    super(code)
    this.status = status
    this.code = code // e.g. 'validation', 'invalid_credentials', 'network'
    this.data = data
  }
}

export async function api(path, { method = 'GET', body, signal } = {}) {
  // X-Lale tells the server the request comes from this website
  const headers = { 'X-Lale': '1' }
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  let res
  try {
    res = await fetch(path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: 'same-origin',
      signal,
    })
  } catch (err) {
    if (err?.name === 'AbortError') throw err
    throw new ApiError(0, 'network')
  }
  let data = null
  try { data = await res.json() } catch {}
  if (!res.ok) throw new ApiError(res.status, data?.error || (res.status >= 500 ? 'server_error' : 'error'), data)
  return data
}

// A translated message for an error from api().
const MESSAGES = {
  network: 'err.network',
  rate_limited: 'err.rateLimited',
  unavailable: 'err.unavailable',
  validation: 'err.validation',
  too_large: 'err.tooLarge',
  invalid_credentials: 'auth.errUser',
  email_taken: 'auth.errExists',
}
export function errorMessage(t, err) {
  return t(MESSAGES[err?.code] || 'err.server')
}

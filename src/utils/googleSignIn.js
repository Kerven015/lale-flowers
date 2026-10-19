// "Continue with Google" (Google Identity Services). Google's script is
// loaded only when the server has a Client ID (GOOGLE_CLIENT_ID); otherwise
// the button and One Tap stay hidden and nothing is downloaded from Google.
import { api } from '../api'

const GSI_SCRIPT = 'https://accounts.google.com/gsi/client'

let configPromise = null
let scriptPromise = null
let initialized = false
let handler = null // gets the ID token ("credential") after the person picks an account

// The public Client ID from GET /api/auth/config (null = Google sign-in is off).
export function googleClientId() {
  configPromise ??= api('/api/auth/config')
    .then((d) => d?.googleClientId || null)
    .catch(() => { configPromise = null; return null }) // offline: ask again next time
  return configPromise
}

function loadScript() {
  scriptPromise ??= new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = GSI_SCRIPT
    s.async = true
    s.onload = () => resolve()
    s.onerror = () => { scriptPromise = null; s.remove(); reject(new Error('gsi')) }
    document.head.appendChild(s)
  })
  return scriptPromise
}

// google.accounts.id, set up once for the whole site; null when Google
// sign-in is off or Google's script could not be loaded.
export async function googleId() {
  const clientId = await googleClientId()
  if (!clientId) return null
  try { await loadScript() } catch { return null }
  const id = window.google?.accounts?.id
  if (!id) return null
  if (!initialized) {
    id.initialize({
      client_id: clientId,
      callback: (response) => handler?.(response.credential),
      auto_select: true,           // returning visitors are signed in by One Tap
      itp_support: true,           // One Tap in Safari / Firefox
      use_fedcm_for_prompt: true,  // the browser's own sign-in prompt (FedCM)
      cancel_on_tap_outside: true,
    })
    initialized = true
  }
  return id
}

// Who handles the ID token. Returns a function that removes the handler.
export function onGoogleCredential(fn) {
  handler = fn
  return () => { if (handler === fn) handler = null }
}

export function cancelOneTap() {
  try { window.google?.accounts?.id?.cancel() } catch {}
}

// After signing out: One Tap must not sign the person straight back in.
export function googleSignedOut() {
  try { window.google?.accounts?.id?.disableAutoSelect() } catch {}
}

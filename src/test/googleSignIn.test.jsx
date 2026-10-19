// @vitest-environment jsdom
// "Continue with Google" in the browser. Google's real script is never loaded:
// window.google is a stand-in, so these tests run offline.
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

globalThis.IS_REACT_ACT_ENVIRONMENT = true
const GSI = 'https://accounts.google.com/gsi/client'

function answerConfig(googleClientId) {
  globalThis.fetch = vi.fn(async (path) => {
    if (path === '/api/auth/config') return new Response(JSON.stringify({ googleClientId }), { status: 200 })
    return new Response(JSON.stringify({ ok: true }), { status: 200 })
  })
}

// fresh modules each test: the Google helper remembers its config and script
async function renderButton() {
  vi.resetModules()
  const { GoogleButton } = await import('../components/GoogleSignIn')
  const { I18nProvider } = await import('../contexts/I18nContext')
  const { ThemeProvider } = await import('../contexts/ThemeContext')
  const el = document.createElement('div')
  document.body.appendChild(el)
  const root = createRoot(el)
  await act(async () => {
    root.render(<I18nProvider><ThemeProvider><GoogleButton /></ThemeProvider></I18nProvider>)
  })
  return { el, root }
}

const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)) })
const gsiScript = () => document.querySelector(`script[src="${GSI}"]`)

beforeEach(() => {
  document.head.replaceChildren()
  document.body.replaceChildren()
  delete window.google
})
afterEach(() => vi.restoreAllMocks())

describe('GOOGLE_CLIENT_ID not set', () => {
  test('the button does not render and Google\'s script is not loaded', async () => {
    answerConfig(null)
    const { el } = await renderButton()
    await flush()
    expect(fetch).toHaveBeenCalledWith('/api/auth/config', expect.anything())
    expect(el.innerHTML).toBe('')
    expect(gsiScript()).toBeNull()
  })

  test('server unreachable: nothing renders either', async () => {
    globalThis.fetch = vi.fn(async () => { throw new TypeError('offline') })
    const { el } = await renderButton()
    await flush()
    expect(el.innerHTML).toBe('')
    expect(gsiScript()).toBeNull()
  })
})

describe('GOOGLE_CLIENT_ID set', () => {
  test('loads Google\'s script and renders "Continue with Google" under an "or" divider', async () => {
    answerConfig('abc.apps.googleusercontent.com')
    const id = { initialize: vi.fn(), renderButton: vi.fn(), prompt: vi.fn(), cancel: vi.fn(), disableAutoSelect: vi.fn() }
    const { el } = await renderButton()
    await flush()
    const script = gsiScript()
    expect(script).not.toBeNull()
    window.google = { accounts: { id } }
    await act(async () => { script.onload() })
    await flush()

    expect(id.initialize).toHaveBeenCalledTimes(1)
    expect(id.initialize.mock.calls[0][0]).toMatchObject({
      client_id: 'abc.apps.googleusercontent.com', auto_select: true, itp_support: true, use_fedcm_for_prompt: true,
    })
    expect(id.renderButton).toHaveBeenCalledTimes(1)
    expect(id.renderButton.mock.calls[0][1]).toMatchObject({ text: 'continue_with', theme: 'outline' })
    expect(el.querySelector('.auth-or').textContent).toBe('ýa-da')
  })
})

test('signing out turns off One Tap auto sign-in', async () => {
  vi.resetModules()
  answerConfig(null)
  const disableAutoSelect = vi.fn()
  window.google = { accounts: { id: { disableAutoSelect } } }
  const { logout } = await import('../store/authSlice')
  await logout()(() => {})
  expect(fetch).toHaveBeenCalledWith('/api/auth/logout', expect.objectContaining({ method: 'POST' }))
  expect(disableAutoSelect).toHaveBeenCalledTimes(1)
})

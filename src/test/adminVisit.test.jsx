// @vitest-environment jsdom
// The admin panel asks for the login on every visit: an earlier admin login
// is ended when the panel opens, when you leave it, and when the tab closes.
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, expect, test, vi } from 'vitest'
import Admin from '../pages/Admin'
import { I18nProvider } from '../contexts/I18nContext'
import { ToastProvider } from '../contexts/ToastContext'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let calls
beforeEach(() => {
  document.body.replaceChildren()
  localStorage.clear()
  calls = []
  // a server that would still say "logged in" if it were asked
  globalThis.fetch = vi.fn(async (url, opts = {}) => {
    calls.push({ path: String(url), method: opts.method || 'GET', keepalive: !!opts.keepalive })
    const body = String(url).endsWith('/api/admin/me') ? { admin: { username: 'boss' } } : { ok: true }
    return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } })
  })
})

async function open() {
  const el = document.body.appendChild(document.createElement('div'))
  const root = createRoot(el)
  await act(async () => { root.render(<MemoryRouter><I18nProvider><ToastProvider><Admin /></ToastProvider></I18nProvider></MemoryRouter>) })
  await act(async () => { await new Promise((r) => setTimeout(r, 20)) })
  return { el, root }
}

test('opening the panel ends any earlier login and shows the login form', async () => {
  const { el } = await open()
  expect(calls[0]).toMatchObject({ path: '/api/admin/logout', method: 'POST' })
  expect(calls.some((c) => c.path.endsWith('/api/admin/me'))).toBe(false)
  expect(el.querySelector('#adm-pass')).not.toBeNull()
})

test('leaving the panel or closing the tab ends the login on the server', async () => {
  const { root } = await open()
  calls.length = 0
  await act(async () => { window.dispatchEvent(new Event('pagehide')) })
  expect(calls).toEqual([{ path: '/api/admin/logout', method: 'POST', keepalive: true }])
  calls.length = 0
  await act(async () => { root.unmount() })
  expect(calls).toEqual([{ path: '/api/admin/logout', method: 'POST', keepalive: true }])
})

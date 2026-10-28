// @vitest-environment jsdom
// Admin login with two-step login on: after the password, the code from the
// phone (or a backup code); a wrong code, and a ticket that ran out.
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { beforeEach, expect, test, vi } from 'vitest'
import { LoginForm } from '../pages/Admin'
import { TEXT } from '../pages/admin/texts'
import { I18nProvider } from '../contexts/I18nContext'
import { ToastProvider } from '../contexts/ToastContext'

globalThis.IS_REACT_ACT_ENVIRONMENT = true
const L = TEXT.ru

// fake server: answers[path] = list of [status, body], used in order
function fakeServer(answers) {
  const calls = []
  globalThis.fetch = vi.fn(async (url, opts) => {
    const path = new URL(url, 'http://x').pathname
    calls.push({ path, body: opts?.body ? JSON.parse(opts.body) : null })
    const [status, body] = answers[path].shift()
    return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
  })
  return calls
}

async function render(onDone) {
  localStorage.setItem('lale_lang', 'ru')
  const el = document.body.appendChild(document.createElement('div'))
  await act(async () => { createRoot(el).render(<I18nProvider><ToastProvider><LoginForm L={L} onDone={onDone} /></ToastProvider></I18nProvider>) })
  return el
}

async function submit(form, values) {
  for (const [name, v] of Object.entries(values)) form.elements[name].value = v
  await act(async () => { form.querySelector('button[type="submit"]').click() })
  await act(async () => { await new Promise((r) => setTimeout(r, 30)) })
}

beforeEach(() => { document.body.replaceChildren(); localStorage.clear() })

test('password, then the code; a wrong code can be typed again', async () => {
  const calls = fakeServer({
    '/api/admin/login': [[200, { twoStep: true, ticket: 'T1' }]],
    '/api/admin/login/code': [[401, { error: 'invalid_code' }], [200, { admin: { username: 'boss' } }]],
  })
  const onDone = vi.fn()
  const el = await render(onDone)
  await submit(el.querySelector('form'), { username: 'boss', password: 'admin-pass-long' })
  expect(onDone).not.toHaveBeenCalled()
  expect(el.querySelector('h1').textContent).toBe(L.codeTitle)
  expect(el.querySelector('#adm-code').getAttribute('autocomplete')).toBe('one-time-code')

  await submit(el.querySelector('form'), { code: '000000' })
  expect(el.querySelector('[role="alert"]').textContent).toBe(L.codeWrong)
  expect(onDone).not.toHaveBeenCalled()

  await submit(el.querySelector('form'), { code: '123456' })
  expect(calls.at(-1)).toEqual({ path: '/api/admin/login/code', body: { ticket: 'T1', code: '123456' } })
  expect(onDone).toHaveBeenCalledWith({ username: 'boss' })
})

test('without two-step login the password is enough', async () => {
  fakeServer({ '/api/admin/login': [[200, { admin: { username: 'boss' } }]] })
  const onDone = vi.fn()
  const el = await render(onDone)
  await submit(el.querySelector('form'), { username: 'boss', password: 'admin-pass-long' })
  expect(onDone).toHaveBeenCalledWith({ username: 'boss' })
})

test('too late: back to the password form with a message', async () => {
  fakeServer({
    '/api/admin/login': [[200, { twoStep: true, ticket: 'T1' }]],
    '/api/admin/login/code': [[401, { error: 'login_expired' }]],
  })
  const el = await render(vi.fn())
  await submit(el.querySelector('form'), { username: 'boss', password: 'admin-pass-long' })
  await submit(el.querySelector('form'), { code: '123456' })
  expect(el.querySelector('#adm-pass')).not.toBeNull()
  expect(el.querySelector('[role="alert"]').textContent).toBe(L.codeExpired)
})

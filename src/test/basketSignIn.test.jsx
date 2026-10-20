// @vitest-environment jsdom
// Only signed-in customers can fill the basket: a guest is sent to
// registration, and the flower goes into the basket after they sign in.
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { Provider } from 'react-redux'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { configureStore } from '@reduxjs/toolkit'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import productsReducer from '../store/productsSlice'
import cartReducer, { PENDING_KEY, applyPendingAdd, hasPendingAdd, requestAdd } from '../store/cartSlice'
import authReducer, { refreshUser } from '../store/authSlice'
import { useCart } from '../store/hooks'
import PendingCart from '../components/PendingCart'
import Login from '../pages/Login'
import Register from '../pages/Register'
import { I18nProvider } from '../contexts/I18nContext'
import { ThemeProvider } from '../contexts/ThemeContext'
import { ToastProvider } from '../contexts/ToastContext'

globalThis.IS_REACT_ACT_ENVIRONMENT = true
const ROSE = { id: 5, inStock: true }
const SOLD_OUT = { id: 6, inStock: false }
const USER = { id: 1, email: 'a@b.com', first: 'A' }

function makeStore(user = null) {
  return configureStore({
    reducer: { products: productsReducer, cart: cartReducer, auth: authReducer },
    preloadedState: {
      products: { list: [ROSE, SOLD_OUT], status: 'ready' },
      cart: { items: [], favorites: [] },
      auth: { user, ready: true },
    },
  })
}

beforeEach(() => {
  sessionStorage.clear()
  localStorage.clear()
  document.body.replaceChildren()
})

describe('requestAdd', () => {
  test('signed in: goes straight into the basket', () => {
    const store = makeStore(USER)
    expect(store.dispatch(requestAdd([{ id: 5, qty: 2 }], '/product/5'))).toBe(true)
    expect(store.getState().cart.items).toEqual([{ id: 5, qty: 2 }])
    expect(hasPendingAdd()).toBe(false)
  })

  test('guest: nothing is added, the flower is remembered', () => {
    const store = makeStore(null)
    expect(store.dispatch(requestAdd([{ id: 5, qty: 2 }], '/product/5'))).toBe('signin')
    expect(store.getState().cart.items).toEqual([])
    expect(hasPendingAdd()).toBe(true)
  })

  test('sold out: refused for everyone, nothing remembered', () => {
    expect(makeStore(null).dispatch(requestAdd([{ id: 6, qty: 1 }], '/'))).toBe(false)
    expect(makeStore(USER).dispatch(requestAdd([{ id: 6, qty: 1 }], '/'))).toBe(false)
    expect(hasPendingAdd()).toBe(false)
  })
})

describe('applyPendingAdd', () => {
  test('after signing in the remembered flower is added once', () => {
    makeStore(null).dispatch(requestAdd([{ id: 5, qty: 3 }], '/product/5'))
    const store = makeStore(USER)
    expect(store.dispatch(applyPendingAdd())).toEqual({ back: '/product/5', added: true })
    expect(store.getState().cart.items).toEqual([{ id: 5, qty: 3 }])
    expect(store.dispatch(applyPendingAdd())).toBeNull() // only once
    expect(store.getState().cart.items).toEqual([{ id: 5, qty: 3 }])
  })

  test('still a guest: nothing happens', () => {
    const store = makeStore(null)
    store.dispatch(requestAdd([{ id: 5, qty: 1 }], '/'))
    expect(store.dispatch(applyPendingAdd())).toBeNull()
    expect(hasPendingAdd()).toBe(true)
  })

  test('older than 30 minutes: forgotten', () => {
    sessionStorage.setItem(PENDING_KEY, JSON.stringify({ items: [{ id: 5, qty: 1 }], back: '/', at: Date.now() - 31 * 60_000 }))
    expect(hasPendingAdd()).toBe(false)
    const store = makeStore(USER)
    expect(store.dispatch(applyPendingAdd())).toBeNull()
    expect(store.getState().cart.items).toEqual([])
  })

  test('a return address to another site is not followed', () => {
    sessionStorage.setItem(PENDING_KEY, JSON.stringify({ items: [{ id: 5, qty: 1 }], back: '//evil.example.com', at: Date.now() }))
    expect(makeStore(USER).dispatch(applyPendingAdd()).back).toBe('/cart')
  })
})

describe('in the shop', () => {
  function AddButton() {
    const { add } = useCart()
    return <button onClick={() => add(5, 2)}>add</button>
  }
  function Where() {
    return <span id="where">{useLocation().pathname}</span>
  }

  async function renderShop(store) {
    const el = document.createElement('div')
    document.body.appendChild(el)
    await act(async () => {
      createRoot(el).render(
        <Provider store={store}>
          <I18nProvider><ThemeProvider><ToastProvider>
            <MemoryRouter initialEntries={['/product/5']}>
              <PendingCart />
              <Where />
              <Routes>
                <Route path="/product/:id" element={<AddButton />} />
                <Route path="/register" element={<Register />} />
                <Route path="/login" element={<Login />} />
                <Route path="/profile" element={<p>profile</p>} />
                <Route path="/about" element={<p>about</p>} />
              </Routes>
            </MemoryRouter>
          </ToastProvider></ThemeProvider></I18nProvider>
        </Provider>,
      )
    })
    return el
  }
  const where = () => document.getElementById('where').textContent
  // the server now knows the customer (signed up / in with a password or Google)
  async function signIn(store) {
    globalThis.fetch = vi.fn(async (path) => new Response(JSON.stringify(path === '/api/auth/me' ? { user: USER } : { googleClientId: null }), { status: 200 }))
    await act(async () => { await store.dispatch(refreshUser()) })
  }
  beforeEach(() => {
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ googleClientId: null }), { status: 200 }))
  })

  test('guest clicks "add" -> registration; after signing up -> back, flower in basket', async () => {
    const store = makeStore(null)
    await renderShop(store)
    await act(async () => { document.querySelector('button').click() })
    expect(where()).toBe('/register')
    expect(document.querySelector('.auth-notice')).not.toBeNull()
    expect(store.getState().cart.items).toEqual([])

    await signIn(store)
    expect(where()).toBe('/product/5')
    expect(store.getState().cart.items).toEqual([{ id: 5, qty: 2 }])
    expect(hasPendingAdd()).toBe(false)
  })

  test('guest goes on to the sign-in page and signs in there: same result', async () => {
    const store = makeStore(null)
    await renderShop(store)
    await act(async () => { document.querySelector('button').click() })
    await act(async () => { document.querySelector('.auth-foot a').click() })
    expect(where()).toBe('/login')
    expect(document.querySelector('.auth-notice')).not.toBeNull()
    await signIn(store)
    expect(where()).toBe('/product/5')
    expect(store.getState().cart.items).toEqual([{ id: 5, qty: 2 }])
  })

  test('signs in on another page (e.g. One Tap): the waiting flower is still added', async () => {
    const store = makeStore(null)
    store.dispatch(requestAdd([{ id: 5, qty: 2 }], '/product/5')) // pressed "add" earlier, then left the register page
    await renderShop(store) // now on a normal page
    await signIn(store)
    expect(store.getState().cart.items).toEqual([{ id: 5, qty: 2 }])
    expect(where()).toBe('/product/5')
  })

  test('signing in with nothing waiting adds nothing and stays on the page', async () => {
    const store = makeStore(null)
    await renderShop(store)
    await signIn(store)
    expect(where()).toBe('/product/5')
    expect(store.getState().cart.items).toEqual([])
  })

  test('signed-in customer: added right away, stays on the page', async () => {
    const store = makeStore(USER)
    await renderShop(store)
    await act(async () => { document.querySelector('button').click() })
    expect(where()).toBe('/product/5')
    expect(store.getState().cart.items).toEqual([{ id: 5, qty: 2 }])
  })
})

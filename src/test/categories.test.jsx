// @vitest-environment jsdom
// Categories the admin added: in the menus and footer links, with their own
// page (/category/<address>), in the catalog filter; unknown addresses are 404.
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { Provider } from 'react-redux'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { configureStore } from '@reduxjs/toolkit'
import { beforeEach, describe, expect, test } from 'vitest'
import productsReducer from '../store/productsSlice'
import cartReducer from '../store/cartSlice'
import authReducer from '../store/authSlice'
import settingsReducer from '../store/settingsSlice'
import { useFlowerTypeLinks } from '../store/hooks'
import { filterProducts, filtersFromParams } from '../utils/catalogFilter'
import Category from '../pages/Category'
import { I18nProvider } from '../contexts/I18nContext'
import { ThemeProvider } from '../contexts/ThemeContext'
import { ToastProvider } from '../contexts/ToastContext'
import { DeliveryProvider } from '../contexts/DeliveryContext'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const PEONIES = { key: 'pion-gulleri', names: { tm: 'Pion gülleri', ru: 'Пионы', tr: 'Şakayıklar' }, sortOrder: 1 }
// from the server, in the admin's order: roses renamed, peonies moved up, tulips/gifts/plants deleted
const ROSES = { key: 'roses', names: { tm: 'Güller', ru: 'Розы premium', tr: 'Güller' }, sortOrder: 2 }
const BOUQUETS = { key: 'bouquets', names: { tm: 'Buketler', ru: 'Букеты', tr: 'Buketler' }, sortOrder: 3 }
const CATS = [PEONIES, ROSES, BOUQUETS]
const P = (id, cat, name) => ({ id, cat, price: 100, inStock: true, colors: [], occasions: [], images: [], i18n: { tm: { name }, ru: { name }, tr: { name } } })
const PRODUCTS = [P(1, 'roses', 'Rose'), P(2, 'pion-gulleri', 'Peony A'), P(3, 'pion-gulleri', 'Peony B')]

function makeStore(status = 'ready', categories = CATS) {
  return configureStore({
    reducer: { products: productsReducer, cart: cartReducer, auth: authReducer, settings: settingsReducer },
    preloadedState: {
      products: { list: PRODUCTS, categories, status },
      cart: { items: [], favorites: [] },
      auth: { user: null, ready: true },
    },
  })
}

async function render(ui, path = '/', store = makeStore()) {
  localStorage.setItem('lale_lang', 'ru')
  const el = document.body.appendChild(document.createElement('div'))
  await act(async () => {
    createRoot(el).render(
      <Provider store={store}>
        <I18nProvider><ThemeProvider><ToastProvider><DeliveryProvider>
          <MemoryRouter initialEntries={[path]}>
            <Routes><Route path="/category/:cat" element={ui} /><Route path="*" element={ui} /></Routes>
          </MemoryRouter>
        </DeliveryProvider></ToastProvider></ThemeProvider></I18nProvider>
      </Provider>,
    )
  })
  return el
}

beforeEach(() => { document.body.replaceChildren(); localStorage.clear() })

function Links() {
  return <ul>{useFlowerTypeLinks().map((l) => <li key={l.key} data-to={l.to}>{l.label}</li>)}</ul>
}

test('menu links follow the admin: order, names, deleted ones gone', async () => {
  const el = await render(<Links />)
  const items = [...el.querySelectorAll('li')].map((li) => [li.textContent, li.dataset.to])
  expect(items).toEqual([['Пионы', '/category/pion-gulleri'], ['Розы premium', '/roses'], ['Букеты', '/bouquets']])
})

test('before the list has loaded: the shop\'s original categories', async () => {
  const el = await render(<Links />, '/', makeStore('loading', []))
  expect([...el.querySelectorAll('li')].map((li) => li.dataset.to)).toEqual(['/roses', '/tulips', '/bouquets', '/gifts', '/catalog?cat=plants'])
})

describe('the category page', () => {
  test('an added category opens with its name and its flowers', async () => {
    const el = await render(<Category />, '/category/pion-gulleri')
    expect(el.querySelector('h1').textContent).toBe('Пионы')
    const text = el.textContent
    expect(text).toContain('Peony A')
    expect(text).toContain('Peony B')
    expect(text).not.toContain('Rose')
  })

  test('a renamed built-in category keeps its address and shows the new name', async () => {
    const el = await render(<Category />, '/category/roses')
    expect(el.querySelector('h1').textContent).toBe('Розы premium')
  })

  test('a deleted built-in category shows "page not found"', async () => {
    const el = await render(<Category />, '/category/tulips')
    expect(el.textContent).toContain('404')
  })

  test('an unknown address shows "page not found"', async () => {
    const el = await render(<Category />, '/category/no-such-thing')
    expect(el.textContent).toContain('404')
  })
})

test('catalog filter: ?cat=<address> selects the added category', () => {
  const f = filtersFromParams(new URLSearchParams('cat=pion-gulleri'))
  expect(f.cats).toEqual(['pion-gulleri'])
  expect(filterProducts(PRODUCTS, f).map((p) => p.id)).toEqual([2, 3])
  // anything that is not an address is ignored
  expect(filtersFromParams(new URLSearchParams('cat=<script>')).cats).toEqual([])
})

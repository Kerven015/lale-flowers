// @vitest-environment jsdom
// The top menu bar and the occasions follow admin → Menu: order, names,
// links to deleted occasions / categories left out; the original links
// before the lists have loaded.
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { Provider } from 'react-redux'
import { MemoryRouter } from 'react-router-dom'
import { configureStore } from '@reduxjs/toolkit'
import { beforeEach, expect, test } from 'vitest'
import productsReducer from '../store/productsSlice'
import { useOccasions, useTopMenuLinks } from '../store/hooks'
import { I18nProvider } from '../contexts/I18nContext'
import { ToastProvider } from '../contexts/ToastContext'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const names = (ru) => ({ tm: ru, ru, tr: ru })
const LOADED = {
  list: [],
  status: 'ready',
  categories: [{ key: 'roses', names: names('Розы') }, { key: 'piony', names: names('Пионы') }],
  occasions: [{ key: '8-mart', names: names('8 Марта') }, { key: 'birthday', names: names('ДР') }],
  menu: [
    { type: 'occasion', key: '8-mart' },
    { type: 'category', key: 'piony' },
    { type: 'category', key: 'gifts' }, // deleted category
    { type: 'occasion', key: 'love' }, // deleted occasion
    { type: 'occasion', key: 'birthday' },
  ],
}

function Show() {
  const links = useTopMenuLinks()
  const { occasions } = useOccasions()
  return (
    <>
      <ul id="top">{links.map((l) => <li key={l.to} data-to={l.to}>{l.label}</li>)}</ul>
      <ul id="occ">{occasions.map((o) => <li key={o.key}>{o.label}</li>)}</ul>
    </>
  )
}

async function render(products) {
  localStorage.setItem('lale_lang', 'ru')
  const store = configureStore({ reducer: { products: productsReducer }, preloadedState: { products } })
  const el = document.body.appendChild(document.createElement('div'))
  await act(async () => {
    createRoot(el).render(<Provider store={store}><I18nProvider><ToastProvider><MemoryRouter><Show /></MemoryRouter></ToastProvider></I18nProvider></Provider>)
  })
  const items = (sel) => [...el.querySelectorAll(`${sel} li`)].map((li) => [li.textContent, li.dataset.to])
  return { top: items('#top'), occ: items('#occ').map(([t]) => t) }
}

beforeEach(() => { document.body.replaceChildren(); localStorage.clear() })

test('the admin\'s links in order; deleted ones are left out', async () => {
  const { top, occ } = await render(LOADED)
  expect(top).toEqual([
    ['8 Марта', '/catalog?occasion=8-mart'],
    ['Пионы', '/category/piony'],
    ['ДР', '/catalog?occasion=birthday'],
  ])
  expect(occ).toEqual(['8 Марта', 'ДР'])
})

test('before loading: the original top bar and occasions', async () => {
  const { top, occ } = await render({ list: [], status: 'loading', categories: [], occasions: [], menu: null })
  expect(top.map(([, to]) => to)).toEqual(['/catalog?occasion=birthday', '/catalog?occasion=love', '/roses', '/bouquets', '/gifts'])
  expect(occ[0]).toBe('День рождения')
  expect(occ.length).toBe(6)
})

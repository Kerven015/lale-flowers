// @vitest-environment jsdom
// The privacy policy page: the same sections in every language, linked from
// the footer, and the registration checkbox points to it.
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { Provider } from 'react-redux'
import { MemoryRouter } from 'react-router-dom'
import { configureStore } from '@reduxjs/toolkit'
import { beforeEach, describe, expect, test } from 'vitest'
import settingsReducer, { DEFAULT_SETTINGS } from '../store/settingsSlice'
import { PRIVACY } from '../data/privacy'
import { I18N, SUPPORTED } from '../data/translations'
import Privacy from '../pages/Privacy'
import { I18nProvider } from '../contexts/I18nContext'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

beforeEach(() => {
  localStorage.clear()
  document.body.replaceChildren()
})

describe('privacy texts', () => {
  test('every language has the same sections, nothing empty', () => {
    const shape = (l) => PRIVACY[l].sections.map((s) => [!!s.title, s.list?.length || 0, s.text?.length || 0, !!s.google])
    for (const l of SUPPORTED) {
      expect(shape(l)).toEqual(shape('tm'))
      expect(PRIVACY[l].intro.trim()).not.toBe('')
      expect(PRIVACY[l].contactTitle.trim()).not.toBe('')
      for (const s of PRIVACY[l].sections) for (const x of [s.title, ...(s.list || []), ...(s.text || [])]) expect(x.trim()).not.toBe('')
    }
  })

  test('the registration checkbox text has a place for the link', () => {
    for (const l of SUPPORTED) expect(I18N[l]['auth.agree']).toContain('{link}')
  })
})

test('the page shows the sections and the shop contacts', async () => {
  localStorage.setItem('lale_lang', 'ru')
  const store = configureStore({
    reducer: { settings: settingsReducer },
    preloadedState: { settings: { data: { ...DEFAULT_SETTINGS, email: 'info@shop.tm', phone: '+993 12 000 000' } } },
  })
  const root = createRoot(document.body.appendChild(document.createElement('div')))
  await act(async () => {
    root.render(
      <Provider store={store}>
        <I18nProvider>
          <MemoryRouter><Privacy /></MemoryRouter>
        </I18nProvider>
      </Provider>,
    )
  })
  const text = document.body.textContent
  expect(document.querySelector('h1').textContent).toBe('Политика конфиденциальности')
  for (const s of PRIVACY.ru.sections) expect(text).toContain(s.title)
  expect(document.querySelector('a[href="https://policies.google.com/privacy"]')).not.toBeNull()
  expect(document.querySelector('a[href^="mailto:"]')).not.toBeNull()
  act(() => root.unmount())
})

// @vitest-environment jsdom
// Shop settings in the basket totals, and baskets never holding more
// flowers than are left.
import { configureStore } from '@reduxjs/toolkit'
import { beforeEach, describe, expect, test } from 'vitest'
import productsReducer from '../store/productsSlice'
import cartReducer, { fitCartToStock, maxQtyFor, requestAdd, selectTotals, setQty } from '../store/cartSlice'
import authReducer from '../store/authSlice'
import settingsReducer, { DEFAULT_SETTINGS, settingsSet } from '../store/settingsSlice'
import { fewLeft, fill } from '../utils/productHelpers'

const USER = { id: 1 }
function makeStore(products, items = []) {
  return configureStore({
    reducer: { products: productsReducer, cart: cartReducer, auth: authReducer, settings: settingsReducer },
    preloadedState: {
      products: { list: products, status: 'ready' },
      cart: { items, favorites: [] },
      auth: { user: USER, ready: true },
      settings: { data: DEFAULT_SETTINGS },
    },
  })
}
beforeEach(() => { localStorage.clear(); sessionStorage.clear() })

describe('totals follow the shop settings', () => {
  test('delivery price and free-delivery amount come from the admin settings', () => {
    const store = makeStore([{ id: 1, price: 150, inStock: true }], [{ id: 1, qty: 1 }])
    expect(selectTotals(store.getState())).toMatchObject({ subtotal: 150, delivery: 25, total: 175 })
    store.dispatch(settingsSet({ deliveryPrice: 40, freeDeliveryFrom: 100 }))
    expect(selectTotals(store.getState())).toMatchObject({ delivery: 0, total: 150 })
    store.dispatch(settingsSet({ deliveryPrice: 40, freeDeliveryFrom: 500 }))
    expect(selectTotals(store.getState())).toMatchObject({ delivery: 40, total: 190 })
  })
})

describe('flowers left', () => {
  const rose = { id: 1, price: 10, inStock: true, stock: 3 }
  const tulip = { id: 2, price: 10, inStock: true, stock: null }

  test('maxQtyFor: the stock, or 99 when not counted', () => {
    expect(maxQtyFor(rose)).toBe(3)
    expect(maxQtyFor(tulip)).toBe(99)
    expect(maxQtyFor({ stock: 500 })).toBe(99)
  })

  test('adding never goes above what is left; a full line says so', () => {
    const store = makeStore([rose])
    expect(store.dispatch(requestAdd([{ id: 1, qty: 2 }], '/'))).toBe(true)
    expect(store.dispatch(requestAdd([{ id: 1, qty: 5 }], '/'))).toBe(true) // only 1 more fits
    expect(store.getState().cart.items).toEqual([{ id: 1, qty: 3 }])
    expect(store.dispatch(requestAdd([{ id: 1, qty: 1 }], '/'))).toBe('max')
  })

  test('changing the quantity in the basket stops at what is left', () => {
    const store = makeStore([rose, tulip], [{ id: 1, qty: 1 }, { id: 2, qty: 1 }])
    store.dispatch(setQty(1, 10))
    store.dispatch(setQty(2, 10))
    expect(store.getState().cart.items).toEqual([{ id: 1, qty: 3 }, { id: 2, qty: 10 }])
    store.dispatch(setQty(1, 0)) // still removes
    expect(store.getState().cart.items).toEqual([{ id: 2, qty: 10 }])
  })

  test('when fewer are left than in the basket, the basket shrinks', () => {
    const store = makeStore([{ ...rose, stock: 2 }, { id: 3, price: 5, inStock: false, stock: 0 }], [{ id: 1, qty: 5 }, { id: 3, qty: 2 }])
    store.dispatch(fitCartToStock())
    expect(store.getState().cart.items).toEqual([{ id: 1, qty: 2 }, { id: 3, qty: 2 }]) // sold-out line stays, marked
  })
})

describe('text helpers', () => {
  test('fill puts values into {placeholders}', () => {
    expect(fill('Free from {free} TMT', { free: 300 })).toBe('Free from 300 TMT')
    expect(fill('{n}% off, {missing}', { n: 10 })).toBe('10% off, {missing}')
  })
  test('fewLeft only for counted flowers with 1–10 left', () => {
    expect([fewLeft({ stock: 3 }), fewLeft({ stock: 0 }), fewLeft({ stock: 11 }), fewLeft({ stock: null }), fewLeft({})]).toEqual([3, null, null, null, null])
  })
})

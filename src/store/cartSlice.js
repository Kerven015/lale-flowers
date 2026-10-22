// Basket and favourites. They live only in this browser (saved to
// localStorage in store/index.js).
import { createSelector, createSlice } from '@reduxjs/toolkit'
import { readJSON } from '../utils/storage'
import { selectProductById, selectProducts } from './productsSlice'
import { selectUser } from './authSlice'
import { selectSettings } from './settingsSlice'

export const CART_KEY = 'lale_cart'
export const FAV_KEY = 'lale_favorites'
// Delivery prices come from the shop settings (admin's Settings tab).
export const MAX_QTY = 99

// How many of a flower one basket can hold: the flowers left when they are
// counted (product.stock), never more than MAX_QTY.
export const maxQtyFor = (product) =>
  product && product.stock !== null && product.stock !== undefined ? Math.max(0, Math.min(MAX_QTY, product.stock)) : MAX_QTY

function loadCart() {
  const list = readJSON(CART_KEY, [])
  return Array.isArray(list) ? list.filter((item) => item && item.id != null && item.qty > 0) : []
}

function loadFavs() {
  const list = readJSON(FAV_KEY, [])
  return Array.isArray(list) ? list.map((v) => parseInt(v, 10)).filter((v) => !Number.isNaN(v)) : []
}

function addOne(items, id, qty) {
  const found = items.find((item) => item.id === id)
  if (found) found.qty = Math.min(MAX_QTY, found.qty + qty)
  else items.push({ id, qty: Math.min(MAX_QTY, qty) })
}

const cartSlice = createSlice({
  name: 'cart',
  initialState: { items: loadCart(), favorites: loadFavs() },
  reducers: {
    // Redux Toolkit lets reducers "change" the state directly (Immer makes a
    // new copy behind the scenes).
    added(state, { payload: { id, qty } }) {
      addOne(state.items, id, qty)
    },
    qtySet(state, { payload: { id, qty } }) {
      if (qty <= 0) state.items = state.items.filter((item) => item.id !== id)
      else {
        const found = state.items.find((item) => item.id === id)
        if (found) found.qty = Math.min(MAX_QTY, qty)
      }
    },
    removed(state, { payload: id }) {
      state.items = state.items.filter((item) => item.id !== id)
    },
    cleared(state) {
      state.items = []
    },
    favoriteToggled(state, { payload: id }) {
      state.favorites = state.favorites.includes(id)
        ? state.favorites.filter((v) => v !== id)
        : [...state.favorites, id]
    },
  },
})

const { added, qtySet, removed, cleared, favoriteToggled } = cartSlice.actions
export default cartSlice.reducer

// ---- only signed-in customers can fill the basket ---------------------------
// A guest's "Add to basket" is remembered here (this tab only, 30 minutes)
// while they register or sign in; then it goes into the basket.
export const PENDING_KEY = 'lale_pending_add'
const PENDING_MINUTES = 30

function savePending(items, back) {
  try { sessionStorage.setItem(PENDING_KEY, JSON.stringify({ items, back, at: Date.now() })) } catch {}
}

// The remembered flowers, or null (nothing waiting, or older than 30 minutes).
function readPending() {
  try {
    const p = JSON.parse(sessionStorage.getItem(PENDING_KEY) || 'null')
    if (p && Array.isArray(p.items) && Date.now() - p.at <= PENDING_MINUTES * 60_000) return p
    sessionStorage.removeItem(PENDING_KEY)
  } catch {}
  return null
}

function takePending() {
  const p = readPending()
  try { sessionStorage.removeItem(PENDING_KEY) } catch {}
  return p
}

export const hasPendingAdd = () => !!readPending()

// What a basket button should do. Returns
//   true     -> added
//   false    -> nothing could be added (sold out)
//   'max'    -> the basket already holds every flower that is left
//   'signin' -> a guest: remembered, the page must open registration
// back = page to return to after signing in.
export const requestAdd = (items, back) => (dispatch, getState) => {
  const valid = items
    .map(({ id, qty }) => ({ id: parseInt(id, 10), qty: Math.max(1, parseInt(qty, 10) || 1) }))
    .filter(({ id }) => selectProductById(getState(), id)?.inStock)
  if (!valid.length) return false
  if (!selectUser(getState())) {
    savePending(valid, back)
    return 'signin'
  }
  let any = false
  for (const { id, qty } of valid) {
    const inBasket = getState().cart.items.find((i) => i.id === id)?.qty || 0
    const room = maxQtyFor(selectProductById(getState(), id)) - inBasket
    if (room <= 0) continue
    dispatch(added({ id, qty: Math.min(qty, room) }))
    any = true
  }
  return any ? true : 'max'
}

// After signing in / registering: put the remembered flowers into the basket.
// Returns the page to go back to, or null when nothing was waiting.
export const applyPendingAdd = () => (dispatch, getState) => {
  if (!selectUser(getState())) return null
  const p = takePending()
  if (!p) return null
  const result = dispatch(requestAdd(p.items, p.back))
  return { back: typeof p.back === 'string' && p.back.startsWith('/') && !p.back.startsWith('//') ? p.back : '/cart', added: result === true }
}

export const setQty = (id, qty) => (dispatch, getState) => {
  qty = parseInt(qty, 10)
  if (Number.isNaN(qty)) return
  id = parseInt(id, 10)
  const max = maxQtyFor(selectProductById(getState(), id))
  dispatch(qtySet({ id, qty: qty > 0 ? Math.min(qty, Math.max(1, max)) : qty }))
}

// After the flower list changes: no basket line holds more than is left.
// (Lines of sold-out flowers stay, marked "sold out".)
export const fitCartToStock = () => (dispatch, getState) => {
  for (const item of getState().cart.items) {
    const p = selectProductById(getState(), item.id)
    if (!p || !p.inStock) continue
    const max = maxQtyFor(p)
    if (max > 0 && item.qty > max) dispatch(qtySet({ id: item.id, qty: max }))
  }
}

export const removeFromCart = (id) => removed(parseInt(id, 10))
export const clearCart = () => cleared()

// returns true when the flower is now a favourite
export const toggleFavorite = (id) => (dispatch, getState) => {
  id = parseInt(id, 10)
  const had = getState().cart.favorites.includes(id)
  dispatch(favoriteToggled(id))
  return !had
}

// ---- selectors -------------------------------------------------------------
// Items whose flower was deleted in the admin panel are ignored, so the shop
// never shows a broken basket row, favourite card or wrong badge count.

const selectItems = (state) => state.cart.items
const selectFavIds = (state) => state.cart.favorites

const selectById = createSelector([selectProducts], (list) => new Map(list.map((p) => [p.id, p])))

export const selectCart = createSelector([selectItems, selectById], (items, byId) => items.filter((i) => byId.has(i.id)))
export const selectFavorites = createSelector([selectFavIds, selectById], (ids, byId) => ids.filter((id) => byId.has(id)))

// Flowers that went sold out after they were put in the basket stay in the
// basket (marked "sold out"), but they are not counted and not ordered.
export const selectOrderable = createSelector([selectCart, selectById], (cart, byId) => cart.filter((i) => byId.get(i.id).inStock))
export const selectSoldOutIds = createSelector([selectCart, selectById], (cart, byId) => cart.filter((i) => !byId.get(i.id).inStock).map((i) => i.id))

// The shop's estimate; at checkout the server's quote (discounts) counts.
export const selectTotals = createSelector([selectCart, selectOrderable, selectById, selectSettings], (cart, orderable, byId, settings) => {
  const count = cart.reduce((s, i) => s + i.qty, 0)
  const subtotal = orderable.reduce((s, i) => s + byId.get(i.id).price * i.qty, 0)
  const delivery = subtotal === 0 || subtotal >= settings.freeDeliveryFrom ? 0 : settings.deliveryPrice
  return { count, subtotal, delivery, total: subtotal + delivery }
})

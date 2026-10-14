// Basket and favourites. They live only in this browser (saved to
// localStorage in store/index.js).
import { createSelector, createSlice } from '@reduxjs/toolkit'
import { readJSON } from '../utils/storage'
import { selectProductById, selectProducts } from './productsSlice'

export const CART_KEY = 'lale_cart'
export const FAV_KEY = 'lale_favorites'
// Must match server/src/config.js (SHOP). The server's numbers count for orders.
export const FREE_FROM = 200
export const DELIVERY_PRICE = 25
export const MAX_QTY = 99

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
    addedMany(state, { payload: ids }) {
      for (const id of ids) addOne(state.items, id, 1)
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

const { added, addedMany, qtySet, removed, cleared, favoriteToggled } = cartSlice.actions
export default cartSlice.reducer

// ---- actions used by the pages ---------------------------------------------
// These return true/false, like before, so a page can show "added" or not.

export const addToCart = (id, qty = 1) => (dispatch, getState) => {
  id = parseInt(id, 10)
  qty = Math.max(1, parseInt(qty, 10) || 1)
  // sold-out flowers can't be ordered, so they don't go into the basket
  if (!selectProductById(getState(), id)?.inStock) return false
  dispatch(added({ id, qty }))
  return true
}

// Favourites -> "Add all to basket"
export const addManyToCart = (ids) => (dispatch, getState) => {
  const valid = ids.map((v) => parseInt(v, 10)).filter((id) => selectProductById(getState(), id)?.inStock)
  if (!valid.length) return false
  dispatch(addedMany(valid))
  return true
}

export const setQty = (id, qty) => (dispatch) => {
  qty = parseInt(qty, 10)
  if (Number.isNaN(qty)) return
  dispatch(qtySet({ id: parseInt(id, 10), qty }))
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

export const selectTotals = createSelector([selectCart, selectOrderable, selectById], (cart, orderable, byId) => {
  const count = cart.reduce((s, i) => s + i.qty, 0)
  const subtotal = orderable.reduce((s, i) => s + byId.get(i.id).price * i.qty, 0)
  const delivery = subtotal === 0 || subtotal >= FREE_FROM ? 0 : DELIVERY_PRICE
  return { count, subtotal, delivery, total: subtotal + delivery }
})

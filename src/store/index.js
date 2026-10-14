// The Redux store: one place for the shop's data.
//   products -> flowers from the server
//   cart     -> basket + favourites (this browser only)
//   auth     -> the logged-in customer
// Language, theme, toasts and the chosen city stay in their React Contexts.
import { configureStore } from '@reduxjs/toolkit'
import productsReducer, { PRODUCTS_CACHE_KEY, fetchProducts } from './productsSlice'
import cartReducer, { CART_KEY, FAV_KEY } from './cartSlice'
import authReducer, { refreshUser } from './authSlice'
import { writeJSON } from '../utils/storage'

export const store = configureStore({
  reducer: {
    products: productsReducer,
    cart: cartReducer,
    auth: authReducer,
  },
  // Redux DevTools (browser extension) works automatically during `npm run dev`
  devTools: import.meta.env.DEV,
})

// Save the basket, favourites and the last flower list whenever they change.
let saved = store.getState()
store.subscribe(() => {
  const now = store.getState()
  if (now.cart.items !== saved.cart.items) writeJSON(CART_KEY, now.cart.items)
  if (now.cart.favorites !== saved.cart.favorites) writeJSON(FAV_KEY, now.cart.favorites)
  if (now.products.list !== saved.products.list) writeJSON(PRODUCTS_CACHE_KEY, now.products.list)
  saved = now
})

// Load everything once when the site opens.
export function startStore() {
  store.dispatch(fetchProducts())
  store.dispatch(refreshUser())

  // refresh the flowers when the visitor comes back to the tab
  // (prices / stock may have changed)
  let last = Date.now()
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && Date.now() - last > 60_000) {
      last = Date.now()
      store.dispatch(fetchProducts())
    }
  })
}

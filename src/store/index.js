// The Redux store: one place for the shop's data.
//   products -> flowers (and the categories the admin added) from the server
//   cart     -> basket + favourites (this browser only)
//   auth     -> the logged-in customer
//   settings -> shop settings (delivery prices, contacts ...)
// Language, theme, toasts and the chosen city stay in their React Contexts.
import { configureStore } from '@reduxjs/toolkit'
import productsReducer, { CATEGORIES_CACHE_KEY, PRODUCTS_CACHE_KEY, fetchProducts } from './productsSlice'
import cartReducer, { CART_KEY, FAV_KEY, fitCartToStock } from './cartSlice'
import authReducer, { refreshUser } from './authSlice'
import settingsReducer, { SETTINGS_CACHE_KEY, fetchSettings } from './settingsSlice'
import { writeJSON } from '../utils/storage'

export const store = configureStore({
  reducer: {
    products: productsReducer,
    cart: cartReducer,
    auth: authReducer,
    settings: settingsReducer,
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
  if (now.settings.data !== saved.settings.data) writeJSON(SETTINGS_CACHE_KEY, now.settings.data)
  const productsChanged = now.products.list !== saved.products.list
  if (productsChanged) writeJSON(PRODUCTS_CACHE_KEY, now.products.list)
  if (now.products.categories !== saved.products.categories) writeJSON(CATEGORIES_CACHE_KEY, now.products.categories)
  saved = now
  // fewer flowers left than in the basket -> the basket shrinks to what is left
  if (productsChanged) store.dispatch(fitCartToStock())
})

// Load everything once when the site opens.
export function startStore() {
  store.dispatch(fetchProducts())
  store.dispatch(refreshUser())
  store.dispatch(fetchSettings())

  // refresh the flowers when the visitor comes back to the tab
  // (prices / stock may have changed)
  let last = Date.now()
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && Date.now() - last > 60_000) {
      last = Date.now()
      store.dispatch(fetchProducts())
      store.dispatch(fetchSettings())
    }
  })
}

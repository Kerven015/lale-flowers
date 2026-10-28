// Flowers from the server. The last list is also kept in the browser
// (see store/index.js), so returning visitors see the flowers at once while
// the fresh list loads.
import { createAsyncThunk, createSlice } from '@reduxjs/toolkit'
import { api } from '../api'
import { readJSON } from '../utils/storage'

export const PRODUCTS_CACHE_KEY = 'lale_products_cache'
// v2: since the built-in categories are in the list too
export const CATEGORIES_CACHE_KEY = 'lale_categories_cache_v2'
export const OCCASIONS_CACHE_KEY = 'lale_occasions_cache'
export const MENU_CACHE_KEY = 'lale_menu_cache'

function cachedProducts() {
  const list = readJSON(PRODUCTS_CACHE_KEY, null)
  return Array.isArray(list) ? list.filter((p) => p && Number.isInteger(p.id)) : null
}

const cached = cachedProducts()

// Every category in menu order (admin → Categories): [{ key, names: { tm, ru, tr }, sortOrder }]
const cachedNamed = (key) => {
  const list = readJSON(key, null)
  return Array.isArray(list) ? list.filter((c) => c && typeof c.key === 'string' && c.names) : []
}
// Occasions (admin → Menu), same shape as categories
// Top menu bar links: [{ type: 'occasion' | 'category', key }]; null = not loaded yet
function cachedMenu() {
  const list = readJSON(MENU_CACHE_KEY, null)
  return Array.isArray(list) ? list.filter((i) => i && typeof i.key === 'string') : null
}

const productsSlice = createSlice({
  name: 'products',
  initialState: {
    list: cached || [],
    categories: cachedNamed(CATEGORIES_CACHE_KEY),
    occasions: cachedNamed(OCCASIONS_CACHE_KEY),
    menu: cachedMenu(),
    // 'loading' (nothing to show yet), 'ready', 'error' (could not load, nothing cached)
    status: cached ? 'ready' : 'loading',
  },
  reducers: {
    retrying(state) {
      state.status = 'loading'
    },
    productSaved(state, { payload: product }) {
      const i = state.list.findIndex((p) => p.id === product.id)
      if (i === -1) state.list.push(product)
      else state.list[i] = product
    },
    productsDeleted(state, { payload: ids }) {
      const gone = new Set(ids)
      state.list = state.list.filter((p) => !gone.has(p.id))
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchProducts.fulfilled, (state, { payload }) => {
        state.list = payload.products
        state.categories = payload.categories
        state.occasions = payload.occasions
        state.menu = payload.menu
        state.status = 'ready'
      })
      .addCase(fetchProducts.rejected, (state) => {
        // keep showing the cached list if there is one
        if (state.status !== 'ready') state.status = 'error'
      })
  },
})

export const { retrying, productSaved, productsDeleted } = productsSlice.actions
export default productsSlice.reducer

// ---- thunks ----------------------------------------------------------------

export const fetchProducts = createAsyncThunk('products/fetch', async () => {
  const data = await api('/api/products')
  return { products: data.products || [], categories: data.categories || [], occasions: data.occasions || [], menu: data.menu || [] }
})

// Admin changes (the server checks the admin login). Errors are thrown to the
// caller, which shows them in the form.
export const saveProduct = (payload, id = null) => async (dispatch) => {
  const data = id
    ? await api(`/api/admin/products/${id}`, { method: 'PUT', body: payload })
    : await api('/api/admin/products', { method: 'POST', body: payload })
  dispatch(productSaved(data.product))
  return data.product
}

// Copy of a flower (server copies the photos too); then the fresh list, since
// the copy is placed right after the original.
export const duplicateProduct = (id) => async (dispatch) => {
  const data = await api(`/api/admin/products/${id}/duplicate`, { method: 'POST' })
  await dispatch(fetchProducts())
  return data.product
}

export const deleteProducts = (ids) => async (dispatch) => {
  const data = await api('/api/admin/products/delete', { method: 'POST', body: { ids } })
  dispatch(productsDeleted(data.deleted))
  return data.deleted
}

// ---- selectors -------------------------------------------------------------

export const selectProducts = (state) => state.products.list
export const selectProductsStatus = (state) => state.products.status
const NO_CATEGORIES = []
export const selectCategories = (state) => state.products.categories || NO_CATEGORIES
export const selectOccasions = (state) => state.products.occasions || NO_CATEGORIES
export const selectMenu = (state) => state.products.menu ?? null
export const selectProductById = (state, id) => {
  const n = parseInt(id, 10)
  return state.products.list.find((p) => p.id === n) || null
}

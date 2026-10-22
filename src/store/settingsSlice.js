// Shop settings from the admin's Settings tab (delivery prices, contacts,
// pausing orders, first-order discount). The last copy is kept in the
// browser so the numbers are right at once on the next visit.
import { createAsyncThunk, createSlice } from '@reduxjs/toolkit'
import { api } from '../api'
import { readJSON } from '../utils/storage'

export const SETTINGS_CACHE_KEY = 'lale_settings_cache'

// Used until the server answers (the shop's original values).
export const DEFAULT_SETTINGS = {
  deliveryPrice: 25,
  freeDeliveryFrom: 200,
  ordersOpen: true,
  firstOrderDiscount: 10,
  phone: '',
  email: '',
  instagram: '',
  address: {},
  hours: {},
}

function cachedSettings() {
  const s = readJSON(SETTINGS_CACHE_KEY, null)
  return s && typeof s === 'object' && !Array.isArray(s) ? { ...DEFAULT_SETTINGS, ...s } : null
}

export const fetchSettings = createAsyncThunk('settings/fetch', async () => {
  const data = await api('/api/settings')
  return data.settings
})

const settingsSlice = createSlice({
  name: 'settings',
  initialState: { data: cachedSettings() || DEFAULT_SETTINGS },
  reducers: {
    settingsSet(state, { payload }) {
      state.data = { ...DEFAULT_SETTINGS, ...payload }
    },
  },
  extraReducers: (builder) => {
    builder.addCase(fetchSettings.fulfilled, (state, { payload }) => {
      state.data = { ...DEFAULT_SETTINGS, ...payload }
    })
  },
})

export const { settingsSet } = settingsSlice.actions
export default settingsSlice.reducer

export const selectSettings = (state) => state.settings?.data || DEFAULT_SETTINGS

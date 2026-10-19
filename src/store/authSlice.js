// Customer accounts (email + password), kept on the server. The login is a
// secure cookie the browser sends automatically; Redux only remembers who is
// logged in so the pages can show it.
import { createAsyncThunk, createSlice } from '@reduxjs/toolkit'
import { ApiError, api } from '../api'
import { googleSignedOut } from '../utils/googleSignIn'

const authSlice = createSlice({
  name: 'auth',
  initialState: {
    user: null,
    ready: false, // false until we know if someone is logged in
  },
  reducers: {
    userSet(state, { payload }) {
      state.user = payload
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(refreshUser.fulfilled, (state, { payload }) => {
        state.user = payload
        state.ready = true
      })
      .addCase(refreshUser.rejected, (state) => {
        // offline: keep whatever we had
        state.ready = true
      })
  },
})

const { userSet } = authSlice.actions
export default authSlice.reducer

export const refreshUser = createAsyncThunk('auth/refresh', async () => {
  const data = await api('/api/auth/me')
  return data.user
})

// Each of these resolves to { ok: true, user } or { ok: false, error: ApiError }
// (never throws), exactly like before.
async function attempt(fn) {
  try {
    return { ok: true, ...(await fn()) }
  } catch (err) {
    return { ok: false, error: err instanceof ApiError ? err : new ApiError(0, 'network') }
  }
}

export const register = (data) => (dispatch) => attempt(async () => {
  const r = await api('/api/auth/register', { method: 'POST', body: data })
  dispatch(userSet(r.user))
  return { user: r.user }
})

export const login = (email, password, remember) => (dispatch) => attempt(async () => {
  const r = await api('/api/auth/login', { method: 'POST', body: { email, password, remember: !!remember } })
  dispatch(userSet(r.user))
  return { user: r.user }
})

// credential = the ID token Google gave the browser
export const googleLogin = (credential, lang) => (dispatch) => attempt(async () => {
  const r = await api('/api/auth/google', { method: 'POST', body: { credential, lang } })
  dispatch(userSet(r.user))
  return { user: r.user }
})

export const logout = () => async (dispatch) => {
  try { await api('/api/auth/logout', { method: 'POST' }) } catch {}
  googleSignedOut()
  dispatch(userSet(null))
}

export const updateProfile = (data) => (dispatch) => attempt(async () => {
  const r = await api('/api/auth/me', { method: 'PATCH', body: data })
  dispatch(userSet(r.user))
  return { user: r.user }
})

// current is empty when the account has no password yet (made with Google)
export const changePassword = (current, next) => (dispatch) => attempt(async () => {
  const r = await api('/api/auth/password', { method: 'POST', body: { current, next } })
  dispatch(userSet(r.user))
  return { user: r.user }
})

export const changeEmail = (email, password) => (dispatch) => attempt(async () => {
  const r = await api('/api/auth/email', { method: 'POST', body: { email, password } })
  dispatch(userSet(r.user))
  return { user: r.user }
})

export const selectUser = (state) => state.auth.user
export const selectAuthReady = (state) => state.auth.ready

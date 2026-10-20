// A guest who pressed "Add to basket" is sent to sign in / register. Once they
// are signed in (password or Google), the flower goes into the basket and
// they return to the page they came from.
import { useCallback, useEffect } from 'react'
import { useDispatch } from 'react-redux'
import { useLocation, useNavigate } from 'react-router-dom'
import { useI18n } from '../contexts/I18nContext'
import { useToast } from '../contexts/ToastContext'
import { useAuth } from '../store/hooks'
import { applyPendingAdd } from '../store/cartSlice'

// For the sign-in and register pages: call once the customer is signed in.
// Adds the waiting flower and goes back, or opens the profile.
export function useFinishSignIn() {
  const dispatch = useDispatch()
  const navigate = useNavigate()
  const { t } = useI18n()
  const { toast } = useToast()
  return useCallback(() => {
    const r = dispatch(applyPendingAdd())
    if (r?.added) toast(t('notify.added'))
    navigate(r ? r.back : '/profile', { replace: true })
  }, [dispatch, navigate, t, toast])
}

// Every other page (e.g. signed in with One Tap after leaving the sign-in page).
export default function PendingCart() {
  const { user } = useAuth()
  const { pathname } = useLocation()
  const dispatch = useDispatch()
  const navigate = useNavigate()
  const { t } = useI18n()
  const { toast } = useToast()
  const authPage = pathname === '/login' || pathname === '/register'

  useEffect(() => {
    if (!user || authPage) return
    const r = dispatch(applyPendingAdd())
    if (!r) return
    if (r.added) toast(t('notify.added'))
    navigate(r.back, { replace: true })
  }, [user, authPage, dispatch, navigate, t, toast])

  return null
}

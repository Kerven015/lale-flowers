// "Continue with Google" button (sign-in and register pages) and the One Tap
// prompt (other pages). Both render nothing when Google sign-in is off.
import { useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useI18n } from '../contexts/I18nContext'
import { useTheme } from '../contexts/ThemeContext'
import { useToast } from '../contexts/ToastContext'
import { errorMessage } from '../api'
import { useAuth } from '../store/hooks'
import { cancelOneTap, googleId, onGoogleCredential } from '../utils/googleSignIn'
import { ADMIN_PATH } from '../data/adminPath'

// Google's button speaks these languages ("tk" = Turkmen)
const BUTTON_LOCALE = { tm: 'tk', ru: 'ru', tr: 'tr' }
// No One Tap where it would get in the way
const NO_ONE_TAP = /^\/(login|register|checkout|profile)(\/|\.html)?$/

export function GoogleButton() {
  const { t, lang } = useI18n()
  const { theme } = useTheme()
  const [gid, setGid] = useState(null)
  const box = useRef(null)

  useEffect(() => {
    let alive = true
    googleId().then((id) => { if (alive) setGid(id) })
    return () => { alive = false }
  }, [])

  useEffect(() => {
    const el = box.current
    if (!gid || !el) return
    el.replaceChildren()
    gid.renderButton(el, {
      type: 'standard',
      text: 'continue_with',
      theme: theme === 'dark' ? 'filled_black' : 'outline',
      size: 'large',
      shape: 'pill',
      logo_alignment: 'center',
      width: Math.max(200, Math.min(400, Math.floor(el.clientWidth) || 400)), // Google allows 200–400 px
      locale: BUTTON_LOCALE[lang],
    })
  }, [gid, theme, lang])

  if (!gid) return null
  return (
    <div className="google-signin">
      <div className="auth-or" role="separator"><span>{t('auth.or')}</span></div>
      <div ref={box} className="google-btn" />
    </div>
  )
}

// Lives in the Layout: signs in with the ID token from the button or One
// Tap, and shows One Tap to signed-out visitors on normal pages.
export function GoogleAuth() {
  const { user, ready, googleLogin } = useAuth()
  const { t, lang } = useI18n()
  const { toast } = useToast()
  const { pathname } = useLocation()

  useEffect(() => onGoogleCredential(async (credential) => {
    const r = await googleLogin(credential, lang)
    if (r.ok) toast(t('auth.okLogin'))
    else toast(errorMessage(t, r.error), 'error')
  }), [googleLogin, lang, t, toast])

  const oneTap = ready && !user && !NO_ONE_TAP.test(pathname) && pathname !== ADMIN_PATH
  useEffect(() => {
    if (!oneTap) { cancelOneTap(); return }
    let alive = true
    googleId().then((id) => { if (alive && id) id.prompt() })
    return () => { alive = false }
  }, [oneTap])

  return null
}

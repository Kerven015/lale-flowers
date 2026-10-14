import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { DEFAULT_LANG, HTML_LANG, I18N, SUPPORTED } from '../data/translations'

const I18nContext = createContext(null)
const KEY = 'lale_lang'

function storedLang() {
  try {
    const v = localStorage.getItem(KEY)
    return SUPPORTED.includes(v) ? v : DEFAULT_LANG
  } catch {
    return DEFAULT_LANG
  }
}

export function I18nProvider({ children }) {
  const [lang, setLangState] = useState(storedLang)

  const t = useCallback((key) => {
    const dict = I18N[lang] || I18N[DEFAULT_LANG]
    if (Object.prototype.hasOwnProperty.call(dict, key)) return dict[key]
    return I18N[DEFAULT_LANG][key] || key
  }, [lang])

  const setLang = useCallback((next) => {
    const value = SUPPORTED.includes(next) ? next : DEFAULT_LANG
    setLangState(value)
    try { localStorage.setItem(KEY, value) } catch {}
  }, [])

  useEffect(() => {
    document.documentElement.lang = HTML_LANG[lang] || 'tk'
  }, [lang])

  const value = useMemo(() => ({
    lang,
    setLang,
    t,
    available: SUPPORTED,
  }), [lang, setLang, t])

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n() {
  return useContext(I18nContext)
}

// The hooks the pages use. They read from Redux and return the same things
// the old Contexts did, so components just call useCart(), useProducts() or
// useAuth().
import { useCallback, useMemo } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { useLocation, useNavigate } from 'react-router-dom'
import { CATEGORIES } from '../data/catalog'
import {
  DEFAULT_MENU, FLOWER_TYPES, OCCASIONS, categoryPath, menuCategoryIcon, occasionIcon, occasionPath,
} from '../data/navigation'
import { CATEGORY_KEYS } from '../utils/catalogFilter'
import { useI18n } from '../contexts/I18nContext'
import { useToast } from '../contexts/ToastContext'
import { productDesc, productImage, productName } from '../utils/productHelpers'
import { OTHER_TYPE, customTypes, isCustomTypeKey } from '../utils/productTypes'
import {
  deleteProducts, duplicateProduct, fetchProducts, retrying, saveProduct,
  selectCategories, selectMenu, selectOccasions, selectProducts, selectProductsStatus,
} from './productsSlice'
import {
  clearCart, removeFromCart, requestAdd, selectCart,
  selectFavorites, selectOrderable, selectSoldOutIds, selectTotals, setQty, toggleFavorite,
} from './cartSlice'
import { selectSettings } from './settingsSlice'
import {
  changeEmail, changePassword, googleLogin, login, logout, refreshUser, register, selectAuthReady, selectUser, updateProfile,
} from './authSlice'

// ---- flowers ---------------------------------------------------------------

// "By flower type" links for the menus and the footer, in the admin's order
// and with the admin's names (admin → Categories). Until the list has loaded,
// the shop's original categories. [{ key, to, label }]
export function useFlowerTypeLinks() {
  const list = useSelector(selectCategories)
  const { lang, t } = useI18n()
  return useMemo(() => (list.length
    ? list.map((c) => ({ key: c.key, to: categoryPath(c.key), label: c.names?.[lang] || c.names?.tm || c.key }))
    : FLOWER_TYPES.map((c) => ({ key: c.key, to: c.to, label: t(`cat.${c.key}`) }))
  ), [list, lang, t])
}

// Occasions in the admin's order and names (admin → Menu); the original six
// until the list has loaded. occasionName(key) is null for an unknown one.
export function useOccasions() {
  const list = useSelector(selectOccasions)
  const { lang, t } = useI18n()
  return useMemo(() => {
    const occasions = list.length
      ? list.map((o) => ({ key: o.key, label: o.names?.[lang] || o.names?.tm || o.key }))
      : OCCASIONS.map((o) => ({ key: o.key, label: t(o.label) }))
    const byKey = new Map(occasions.map((o) => [o.key, o.label]))
    return { occasions, occasionKeys: occasions.map((o) => o.key), occasionName: (key) => byKey.get(key) ?? null }
  }, [list, lang, t])
}

// The admin's links in the top menu bar (between "Home" and "Catalog"):
// [{ to, label, icon }]. Links to deleted occasions / categories are left out.
export function useTopMenuLinks() {
  const menu = useSelector(selectMenu)
  const { occasionName } = useOccasions()
  const { catName, categoryKeys } = useProducts()
  return useMemo(() => (menu ?? DEFAULT_MENU).flatMap((i) => {
    if (i.type === 'occasion') {
      const label = occasionName(i.key)
      return label ? [{ to: occasionPath(i.key), label, icon: occasionIcon(i.key) }] : []
    }
    if (i.type === 'category' && categoryKeys.includes(i.key)) {
      return [{ to: categoryPath(i.key), label: catName(i.key), icon: menuCategoryIcon(i.key) }]
    }
    return []
  }), [menu, occasionName, catName, categoryKeys])
}

export function useProducts() {
  const dispatch = useDispatch()
  const products = useSelector(selectProducts)
  const status = useSelector(selectProductsStatus)
  const added = useSelector(selectCategories) // every category, admin's order
  const { lang, t } = useI18n()

  const reload = useCallback(
    () => dispatch(fetchProducts()).then((a) => !a.error),
    [dispatch],
  )
  const retry = useCallback(() => { dispatch(retrying()); reload() }, [dispatch, reload])
  const save = useCallback((payload, id = null) => dispatch(saveProduct(payload, id)), [dispatch])
  const remove = useCallback((ids) => dispatch(deleteProducts(ids)), [dispatch])
  const duplicate = useCallback((id) => dispatch(duplicateProduct(id)), [dispatch])

  const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products])
  // keys of every category, in the admin's order (the original five until loaded)
  const categoryKeys = useMemo(() => (added.length ? added.map((c) => c.key) : CATEGORY_KEYS), [added])
  const get = useCallback((id) => byId.get(parseInt(id, 10)) || null, [byId])

  // Label for a category / filter key. Custom types ('other:pion') show the
  // text the admin typed.
  const catName = useCallback((key) => {
    const own = added.find((c) => c.key === key) // the admin's name comes first
    if (own) return own.names?.[lang] || own.names?.tm || own.names?.ru || key
    const cat = CATEGORIES[key]
    if (cat) return t(cat.key)
    if (key === OTHER_TYPE) return t('cat.other')
    if (isCustomTypeKey(key)) return customTypes(products).find((c) => c.key === key)?.label || t('cat.other')
    return key
  }, [t, products, added, lang])

  // Flower type shown on cards, product page, cart and admin.
  const typeName = useCallback((p) => {
    if (p?.cat === OTHER_TYPE) return String(p.customType || '').trim() || t('cat.other')
    return catName(p?.cat)
  }, [catName, t])

  const name = useCallback((p) => productName(p, lang), [lang])
  const desc = useCallback((p) => productDesc(p, lang), [lang])

  return useMemo(() => ({
    products,
    status,
    loading: status === 'loading',
    reload,
    retry,
    saveProduct: save,
    deleteProducts: remove,
    duplicateProduct: duplicate,
    categories: CATEGORIES,
    addedCategories: added,
    categoryKeys,
    get,
    catName,
    typeName,
    name,
    desc,
    image: productImage,
  }), [products, status, added, categoryKeys, reload, retry, save, remove, duplicate, get, catName, typeName, name, desc])
}

// ---- basket + favourites ---------------------------------------------------

export function useCart() {
  const dispatch = useDispatch()
  const cart = useSelector(selectCart)
  const favorites = useSelector(selectFavorites)
  const orderable = useSelector(selectOrderable)
  const soldOut = useSelector(selectSoldOutIds)
  const { count, subtotal, delivery, total } = useSelector(selectTotals)
  const { toast } = useToast()
  const { t } = useI18n()
  const navigate = useNavigate()
  const { pathname, search } = useLocation()

  // Only signed-in customers can add to the basket. A guest is sent to
  // registration; the flower goes into the basket right after they sign in.
  // Returns true (added), false (sold out) or null (sent to sign in).
  // then = page to open after signing in (default: back to this page).
  const request = useCallback((items, then) => {
    const r = dispatch(requestAdd(items, then || pathname + search))
    if (r === 'max') { toast(t('stock.allInBasket')); return false }
    if (r !== 'signin') return r
    navigate('/register') // the page says why (cart.signInToAdd)
    return null
  }, [dispatch, navigate, pathname, search, toast, t])
  const add = useCallback((id, qty, { then } = {}) => request([{ id, qty }], then), [request])
  const addMany = useCallback((ids) => request(ids.map((id) => ({ id, qty: 1 }))), [request])
  const changeQty = useCallback((id, qty) => dispatch(setQty(id, qty)), [dispatch])
  const remove = useCallback((id) => dispatch(removeFromCart(id)), [dispatch])
  const clear = useCallback(() => dispatch(clearCart()), [dispatch])
  const toggle = useCallback((id) => dispatch(toggleFavorite(id)), [dispatch])
  const isFavorite = useCallback((id) => favorites.includes(parseInt(id, 10)), [favorites])
  const notify = useCallback((key, type) => toast(t(key), type), [toast, t])

  return useMemo(() => ({
    cart,          // everything in the basket
    orderable,     // only the flowers that can be ordered now
    soldOut,       // ids of basket flowers that are sold out
    favorites,
    add,
    addMany,
    setQty: changeQty,
    remove,
    clear,
    isFavorite,
    toggleFavorite: toggle,
    count,
    favCount: favorites.length,
    subtotal,
    delivery,
    total,
    notify,
  }), [cart, orderable, soldOut, favorites, add, addMany, changeQty, remove, clear, isFavorite, toggle, count, subtotal, delivery, total, notify])
}

// ---- shop settings -----------------------------------------------------------

// Delivery prices, contacts, "orders open", first-order discount.
// Texts (address, hours) for the current language, with the built-in
// translation when the admin left them empty.
export function useSettings() {
  const s = useSelector(selectSettings)
  const { lang, t } = useI18n()
  return useMemo(() => ({
    ...s,
    addressText: s.address?.[lang] || t('contact.addressValue'),
    hoursText: s.hours?.[lang] || t('contact.hoursValue'),
  }), [s, lang, t])
}

// ---- customer login --------------------------------------------------------

export function useAuth() {
  const dispatch = useDispatch()
  const user = useSelector(selectUser)
  const ready = useSelector(selectAuthReady)

  const actions = useMemo(() => ({
    refresh: () => dispatch(refreshUser()),
    register: (data) => dispatch(register(data)),
    login: (email, password, remember) => dispatch(login(email, password, remember)),
    logout: () => dispatch(logout()),
    updateProfile: (data) => dispatch(updateProfile(data)),
    changePassword: (current, next) => dispatch(changePassword(current, next)),
    changeEmail: (email, password) => dispatch(changeEmail(email, password)),
    googleLogin: (credential, lang) => dispatch(googleLogin(credential, lang)),
  }), [dispatch])

  return useMemo(() => ({ user, ready, ...actions }), [user, ready, actions])
}

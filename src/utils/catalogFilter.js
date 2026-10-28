// Pure filtering/sorting for the catalog page. No UI code here.
import { isCustomTypeKey, productTags, typeKey } from './productTypes'

export const CATEGORY_KEYS = ['roses', 'tulips', 'bouquets', 'gifts', 'plants']
// Address of a category the admin added, e.g. "pion-gulleri"
export const isCategorySlug = (key) => typeof key === 'string' && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(key) && key.length <= 40
export const COLOR_KEYS = ['red', 'white', 'pink', 'yellow', 'purple', 'mixed']
export const RATING_STEPS = [4.9, 4.7, 4.5]
export const SORT_KEYS = ['recommended', 'priceDesc', 'priceAsc', 'newest', 'popular']
// Quick price ranges in TMT. They simply fill the from/to price fields.
export const PRICE_RANGES = [
  ['', '250'],
  ['250', '400'],
  ['400', '600'],
  ['600', ''],
]

export const EMPTY_FILTERS = Object.freeze({
  cats: [],        // none checked = all categories
  colors: [],      // none checked = all colors
  minPrice: '',    // '' = no lower bound
  maxPrice: '',    // '' = no upper bound
  inStockOnly: false,
  minRating: 0,    // 0 = "Все"
  sameDay: false,  // only products that can be delivered today
  occasion: '',    // occasion key from the mega menu ('' = none)
})

function toNumber(v) {
  if (v === '' || v === null || v === undefined) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function nameMatches(p, s) {
  const names = ['tm', 'ru', 'tr'].map((l) => p?.i18n?.[l]?.name || '').join(' ')
  return names.toLowerCase().includes(s)
}

// A product belongs to a category when that is its flower type, or when the
// admin ticked that menu category for it (e.g. a bouquet marked "Gifts").
function inCats(p, cats) {
  return cats.includes(typeKey(p)) || productTags(p).some((tag) => cats.includes(tag))
}

// ctx.isSameDay(product) -> boolean, ctx.occasionIds -> array of ids or null
// (occasionIds is only used to know that the occasion exists; membership comes
// from the product's own tags, see productTypes.js)
export function filterProducts(products, filters, query = '', ctx = {}) {
  const f = { ...EMPTY_FILTERS, ...filters }
  const occ = f.occasion && ctx.occasionIds ? f.occasion : null
  const lo = toNumber(f.minPrice)
  const hi = toNumber(f.maxPrice)
  const s = String(query || '').trim().toLowerCase()

  return products.filter((p) => {
    if (f.cats.length && !inCats(p, f.cats)) return false
    if (f.colors.length && !(p.colors || []).some((c) => f.colors.includes(c))) return false
    if (lo !== null && p.price < lo) return false
    if (hi !== null && p.price > hi) return false
    if (f.inStockOnly && !p.inStock) return false
    if (f.minRating > 0 && (p.rating || 0) < f.minRating) return false
    if (f.sameDay && !(ctx.isSameDay ? ctx.isSameDay(p) : p.inStock)) return false
    if (occ && !productTags(p).includes(occ)) return false
    if (s && !nameMatches(p, s)) return false
    return true
  })
}

// Sorting only reorders; it never removes items. Array#sort is stable,
// so ties keep the default catalog order.
export function sortProducts(list, sort) {
  const out = list.slice()
  if (sort === 'priceAsc') out.sort((a, b) => a.price - b.price)
  else if (sort === 'priceDesc') out.sort((a, b) => b.price - a.price)
  // "New" flowers first, then the most recently added (higher id = added later)
  else if (sort === 'newest') out.sort((a, b) => (b.isNew ? 1 : 0) - (a.isNew ? 1 : 0) || b.id - a.id)
  else if (sort === 'popular') out.sort((a, b) => (b.reviews || 0) - (a.reviews || 0))
  // 'recommended' = featured flowers (admin's choice) first, then the admin's order
  else out.sort((a, b) => (b.featured ? 1 : 0) - (a.featured ? 1 : 0))
  return out
}

export function filtersFromParams(params, presetCat = '') {
  const cat = presetCat || params.get('cat')
  return {
    ...EMPTY_FILTERS,
    cats: CATEGORY_KEYS.includes(cat) || isCustomTypeKey(cat) || isCategorySlug(cat) ? [cat] : [],
    occasion: params.get('occasion') || '',
  }
}

export function activeFilterCount(f) {
  // a price range (from + to) counts as one filter
  return f.cats.length + f.colors.length + (f.minPrice !== '' || f.maxPrice !== '' ? 1 : 0)
    + (f.inStockOnly ? 1 : 0) + (f.minRating > 0 ? 1 : 0) + (f.sameDay ? 1 : 0) + (f.occasion ? 1 : 0)
}

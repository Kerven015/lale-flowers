// Flower type + occasion tags of a product, shared by the shop and the admin.
//
// Type:  p.cat is one of the catalog categories, or 'other' together with
//        p.customType (free text typed by the admin, e.g. "Pion").
// Tags:  p.occasions is the list chosen in the admin (menu categories such as
//        'birthday', 'love', 'roses', 'gifts'). Products that were never edited
//        have no list; they keep the occasions they had before (navigation.js).
import { FLOWER_TYPES, OCCASIONS } from '../data/navigation'

export const OTHER_TYPE = 'other'
const OTHER_PREFIX = 'other:'

const norm = (s) => String(s || '').trim().replace(/\s+/g, ' ')

// Key used by the catalog filter. Custom types get their own key so that
// "Pion" and "Lilia" are separate filter options.
export function typeKey(p) {
  if (!p) return ''
  if (p.cat === OTHER_TYPE) return OTHER_PREFIX + norm(p.customType).toLowerCase()
  return p.cat
}

export const isCustomTypeKey = (key) => typeof key === 'string' && key.startsWith(OTHER_PREFIX) && key.length > OTHER_PREFIX.length

// Distinct custom types present in the product list: [{ key, label }]
export function customTypes(products) {
  const seen = new Map()
  for (const p of products) {
    if (p.cat !== OTHER_TYPE || !norm(p.customType)) continue
    const key = typeKey(p)
    if (!seen.has(key)) seen.set(key, norm(p.customType))
  }
  return [...seen].map(([key, label]) => ({ key, label }))
}

// Options the admin can tick, in main-menu order: Birthday, Love & Romance,
// Roses, Bouquets, Gifts, then the rest of the mega-menu entries.
const MENU_FIRST = ['birthday', 'love', 'roses', 'bouquets', 'gifts']
const ALL_TAGS = [
  ...OCCASIONS.map((o) => ({ key: o.key, label: o.label })),
  ...FLOWER_TYPES.map((f) => ({ key: f.key, label: `cat.${f.key}` })),
]
export const TAG_OPTIONS = [
  ...MENU_FIRST.map((k) => ALL_TAGS.find((o) => o.key === k)),
  ...ALL_TAGS.filter((o) => !MENU_FIRST.includes(o.key)),
]
export const TAG_KEYS = TAG_OPTIONS.map((o) => o.key)

// Occasions a never-edited product had before tags existed.
function legacyTags(p) {
  return OCCASIONS.filter((o) => o.ids.includes(p.id)).map((o) => o.key)
}

// Tags used for filtering.
export function productTags(p) {
  if (!p) return []
  return Array.isArray(p.occasions) ? p.occasions : legacyTags(p)
}

// Tags pre-ticked when the admin opens a product for editing: what it is
// shown under right now (its occasions and its own type).
export function editableTags(p) {
  const tags = new Set(productTags(p))
  if (!Array.isArray(p.occasions) && TAG_KEYS.includes(p.cat)) tags.add(p.cat)
  return TAG_KEYS.filter((k) => tags.has(k))
}

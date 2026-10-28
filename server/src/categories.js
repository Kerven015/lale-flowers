// Categories and occasions (occasions.js use the same name helpers).
// Categories: the five that came with the shop (roses, tulips, bouquets,
// gifts, plants; migration 009) and the ones the admin adds. All of them can
// be renamed, reordered and deleted. A product's `cat` is one of these slugs,
// or 'other' with its own typed text.
import { LANGS } from './config.js'
import { query } from './db.js'

export const MAX_CATEGORIES = 50
export const NAME_MAX = 40
// Never used as an address: "Other" and words the shop uses itself.
const RESERVED = new Set(['other', 'all', 'new', 'catalog'])
export const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/

const RU = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'yo', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm',
  н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sch',
  ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya', ı: 'i',
}

// Latin letters for the address: "Pion gülleri" -> "pion-gulleri", "Пионы" -> "piony".
export function latinSlug(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[а-яёı]/g, (ch) => RU[ch] ?? '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/, '')
}

export const toCategory = (row) => ({ key: row.slug, names: row.names, sortOrder: row.sort_order })

export async function loadCategories(db = { query }) {
  const { rows } = await db.query('SELECT * FROM categories ORDER BY sort_order, id')
  return rows
}

export async function categoryKeys() {
  return (await loadCategories()).map((r) => r.slug)
}

// The three names from the admin form. Empty ones get the first name typed,
// so every language shows something. Returns { names } or { errors }.
export function checkNames(body) {
  const given = Object.fromEntries(LANGS.map((l) => [l, String(body?.names?.[l] ?? '').replace(/\s+/g, ' ').trim().slice(0, NAME_MAX)]))
  const first = LANGS.map((l) => given[l]).find(Boolean)
  if (!first) return { errors: { names: 'required' } }
  return { names: Object.fromEntries(LANGS.map((l) => [l, given[l] || first])) }
}

// A free address for a new category or occasion, made from its name. It must
// differ from every category and every occasion: the catalog filter treats a
// flower's occasion tags and categories alike. A built-in address (roses,
// birthday ...) is free again once deleted, so it can be added back.
export async function freeSlug(db, names, fallback = 'category') {
  const base = latinSlug(names.tm) || latinSlug(names.tr) || latinSlug(names.ru) || fallback
  const { rows } = await db.query(
    `SELECT slug FROM categories WHERE slug = $1 OR slug LIKE $2
     UNION SELECT slug FROM occasions WHERE slug = $1 OR slug LIKE $2`,
    [base, `${base}-%`],
  )
  const taken = new Set([...rows.map((r) => r.slug), ...RESERVED])
  if (!taken.has(base)) return base
  for (let i = 2; ; i++) if (!taken.has(`${base}-${i}`)) return `${base}-${i}`
}

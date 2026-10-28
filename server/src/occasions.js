// Occasions ("Birthday", "Love & romance" ...; migration 010) and the top
// menu bar. Occasions work like categories (same name and address rules,
// categories.js); a flower is shown under an occasion when the admin ticks
// it in the flower form (products.occasions).
import { query } from './db.js'
import { loadCategories } from './categories.js'

export const MAX_OCCASIONS = 50
export const MAX_MENU_ITEMS = 10

export const toOccasion = (row) => ({ key: row.slug, names: row.names, sortOrder: row.sort_order })

export async function loadOccasions(db = { query }) {
  const { rows } = await db.query('SELECT * FROM occasions ORDER BY sort_order, id')
  return rows
}

// Everything a flower can be "shown under": occasions and categories.
export async function tagKeys() {
  const [occ, cats] = await Promise.all([loadOccasions(), loadCategories()])
  return [...occ.map((r) => r.slug), ...cats.map((r) => r.slug)]
}

// ---- top menu bar ------------------------------------------------------------------
// [{ type: 'occasion' | 'category', key }] between "Home" and "Catalog".
export async function loadMenu(db = { query }) {
  const { rows } = await db.query(`SELECT value FROM settings WHERE key = 'menu'`)
  return Array.isArray(rows[0]?.value) ? rows[0].value : []
}

// The menu without links to occasions / categories that no longer exist.
export async function publicMenu() {
  const [menu, occ, cats] = await Promise.all([loadMenu(), loadOccasions(), loadCategories()])
  const exists = { occasion: new Set(occ.map((r) => r.slug)), category: new Set(cats.map((r) => r.slug)) }
  return menu.filter((i) => exists[i.type]?.has(i.key))
}

// Checks the admin's list. Returns { items } or { errors }.
export async function checkMenu(body) {
  const list = body?.items
  if (!Array.isArray(list) || list.length > MAX_MENU_ITEMS) return { errors: { items: 'invalid' } }
  const [occ, cats] = await Promise.all([loadOccasions(), loadCategories()])
  const exists = { occasion: new Set(occ.map((r) => r.slug)), category: new Set(cats.map((r) => r.slug)) }
  const seen = new Set()
  const items = []
  for (const i of list) {
    if (!i || !exists[i.type]?.has(i.key)) return { errors: { items: 'unknown' } }
    const id = `${i.type}:${i.key}`
    if (seen.has(id)) return { errors: { items: 'duplicate' } }
    seen.add(id)
    items.push({ type: i.type, key: i.key })
  }
  return { items }
}

export async function saveMenu(db, items) {
  await db.query(
    `INSERT INTO settings (key, value) VALUES ('menu', $1)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
    [JSON.stringify(items)],
  )
}

// A deleted occasion / category also leaves the menu and every flower's
// "shown under" list (inside the caller's transaction).
export async function forgetTag(db, type, slug) {
  const menu = await loadMenu(db)
  const left = menu.filter((i) => !(i.type === type && i.key === slug))
  if (left.length !== menu.length) await saveMenu(db, left)
  await db.query(`UPDATE products SET occasions = occasions - $1 WHERE jsonb_typeof(occasions) = 'array' AND occasions ? $1`, [slug])
}

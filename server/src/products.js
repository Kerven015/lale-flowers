// Products: database row <-> the shape the website uses, and checking the
// admin form.
import { LANGS } from './config.js'

// The flower types the shop came with (now rows in the categories table,
// see categories.js); kept for the menu tags and colours
export const TYPES = ['roses', 'tulips', 'bouquets', 'gifts', 'plants', 'other']
// Menu sections a product can be shown under (src/utils/productTypes.js)
export const TAGS = ['birthday', 'love', 'roses', 'bouquets', 'gifts', 'wedding', 'congrats', 'thanks', 'home', 'tulips', 'plants']
// Colour filter in the catalog (src/utils/catalogFilter.js COLOR_KEYS)
export const COLORS = ['red', 'white', 'pink', 'yellow', 'purple', 'mixed']
export const MAX_STOCK = 100_000

const TYPE_TONES = {
  roses: ['#e01b24', '#7a0d13'],
  tulips: ['#ffcc4d', '#e0761b'],
  bouquets: ['#d4141c', '#3a0509'],
  gifts: ['#ff7a45', '#d61f5c'],
  plants: ['#9b5de5', '#3d1f6b'],
}
const DEFAULT_TONES = ['#e01b24', '#7a0d13']

export const PRODUCT_COLUMNS = `id, slug, cat, custom_type, occasions, price, old_price, rating, reviews, colors,
  is_new, is_featured, in_stock, stock, tones, images, i18n, sort_order`

export function toProduct(row) {
  const images = Array.isArray(row.images) ? row.images : []
  return {
    id: row.id,
    slug: row.slug,
    cat: row.cat,
    ...(row.cat === 'other' ? { customType: row.custom_type || '' } : {}),
    ...(Array.isArray(row.occasions) ? { occasions: row.occasions } : {}),
    price: row.price,
    old: row.old_price,
    rating: Math.round(Number(row.rating || 0) * 10) / 10,
    reviews: row.reviews,
    colors: row.colors || [],
    isNew: row.is_new,
    featured: !!row.is_featured,
    inStock: row.in_stock,
    stock: row.stock ?? null, // flowers left; null = not counted
    sortOrder: row.sort_order,
    tones: row.tones?.length ? row.tones : DEFAULT_TONES,
    ...(images[0] ? { image: images[0] } : {}),
    images,
    i18n: row.i18n || {},
  }
}

// ---- rich text (same rules as src/utils/richText.js) --------------------------
const ALLOWED = { p: 'p', br: 'br', strong: 'strong', b: 'strong', em: 'em', i: 'em', ul: 'ul', ol: 'ul', li: 'li', div: 'p' }

// Keeps only bold, italic, bullet lists, paragraphs and line breaks.
// Every attribute is dropped; anything else is removed (its text stays).
export function sanitizeHtml(html) {
  let s = String(html || '')
  s = s.replace(/<(script|style|iframe|object|embed|template|noscript)\b[\s\S]*?<\/\1\s*>/gi, '')
  s = s.replace(/<!--[\s\S]*?-->/g, '')
  s = s.replace(/<\/?([a-zA-Z][a-zA-Z0-9]*)\b[^>]*>/g, (tag, name) => {
    const t = ALLOWED[name.toLowerCase()]
    if (!t) return ''
    if (t === 'br') return '<br>'
    return tag.startsWith('</') ? `</${t}>` : `<${t}>`
  })
  // anything that still looks like markup is shown as text
  s = s.replace(/<(?!\/?(p|br|strong|em|ul|li)>)/g, '&lt;')
  s = s
    .replace(/<p>(\s|&nbsp;|<br>)*<\/p>/g, '')
    .replace(/<li>(\s|&nbsp;|<br>)*<\/li>/g, '')
    .replace(/<ul><\/ul>/g, '')
    .replace(/(<br>\s*)+$/g, '')
    .trim()
  return htmlToText(s) ? s : ''
}

export function htmlToText(html) {
  if (!html) return ''
  return String(html)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|li|ul|div)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

const clean = (v, max) => String(v ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim().slice(0, max)

export function slugify(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9а-яё]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'flower'
}

// Checks the admin product form. Photos are checked separately (uploads.js).
// Returns { data } or { errors }.
// categories = slugs of the categories that exist now (categories.js);
// 'other' is always allowed.
export function checkProductForm(body, categories) {
  const errors = {}
  const name = clean(body.name, 120)
  if (!name) errors.name = 'name'
  const type = body.type === 'other' || categories.includes(body.type) ? body.type : null
  if (!type) errors.type = 'type'
  const customType = clean(body.customType, 40).replace(/\s+/g, ' ')
  if (type === 'other' && !customType) errors.customType = 'customType'
  const occasions = Array.isArray(body.occasions) ? TAGS.filter((k) => body.occasions.includes(k)) : []
  if (!occasions.length) errors.occasions = 'occasions'
  const price = Number(body.price)
  if (!Number.isFinite(price) || price < 1 || price > 1_000_000) errors.price = 'price'
  let old = null
  if (body.old !== undefined && body.old !== null && String(body.old).trim() !== '') {
    old = Number(body.old)
    if (!Number.isFinite(old) || old <= price || old > 1_000_000) errors.old = 'old'
  }
  // optional numbers: '' / null / missing = not set
  const optionalNumber = (field, min, max, { whole = true } = {}) => {
    const v = body[field]
    if (v === undefined || v === null || String(v).trim() === '') return null
    const n = Number(v)
    if (!Number.isFinite(n) || n < min || n > max || (whole && !Number.isInteger(n))) { errors[field] = field; return null }
    return n
  }
  const stock = optionalNumber('stock', 0, MAX_STOCK)
  const sortOrder = optionalNumber('sortOrder', 0, 1_000_000)
  const rating = optionalNumber('rating', 0, 5, { whole: false })
  const reviews = optionalNumber('reviews', 0, 10_000_000)
  const colors = Array.isArray(body.colors) ? COLORS.filter((c) => body.colors.includes(c)) : []
  const lang = LANGS.includes(body.lang) ? body.lang : 'tm'
  const details = Object.fromEntries(LANGS.map((l) => {
    const d = body.details?.[l] || {}
    const html = sanitizeHtml(typeof d.desc === 'string' ? d.desc.slice(0, 20000) : '')
    return [l, { descHtml: html, desc: htmlToText(html), composition: clean(d.composition, 300), size: clean(d.size, 120), care: clean(d.care, 800) }]
  }))
  if (Object.keys(errors).length) return { errors }
  return {
    data: {
      name, type, customType: type === 'other' ? customType : null, occasions,
      price: Math.round(price), old: old === null ? null : Math.round(old),
      // a counted flower is in stock while some are left
      stock, inStock: stock === null ? body.inStock !== false : stock > 0,
      isNew: body.isNew === true, featured: body.featured === true, sortOrder, colors,
      rating: rating === null ? 0 : Math.round(rating * 10) / 10, reviews: reviews ?? 0,
      lang, details,
    },
  }
}

// Columns for a brand-new product.
export function newProductFields(data) {
  return {
    slug: slugify(data.name),
    cat: data.type,
    custom_type: data.customType,
    occasions: data.occasions,
    price: data.price,
    old_price: data.old,
    is_new: data.isNew,
    is_featured: data.featured,
    in_stock: data.inStock,
    stock: data.stock,
    sort_order: data.sortOrder, // null = after the last one
    colors: data.colors,
    rating: data.rating,
    reviews: data.reviews,
    tones: TYPE_TONES[data.type] || DEFAULT_TONES,
    i18n: Object.fromEntries(LANGS.map((l) => [l, { name: data.name, ...data.details[l] }])),
  }
}

// Columns for an edited product. The name is changed for every language when
// all languages had the same name; otherwise only for the admin's language.
export function editedProductFields(row, data) {
  const i18n = JSON.parse(JSON.stringify(row.i18n || {}))
  const names = LANGS.map((l) => i18n[l]?.name || '')
  const sameEverywhere = names.every((n) => n === names[0])
  for (const l of LANGS) i18n[l] = i18n[l] || { name: '', desc: '' }
  if ((i18n[data.lang]?.name || '') !== data.name) {
    for (const l of sameEverywhere ? LANGS : [data.lang]) i18n[l] = { ...i18n[l], name: data.name }
  }
  for (const l of LANGS) i18n[l] = { ...i18n[l], ...data.details[l] }
  return {
    cat: data.type,
    custom_type: data.customType,
    occasions: data.occasions,
    price: data.price,
    old_price: data.old,
    in_stock: data.inStock,
    stock: data.stock,
    is_new: data.isNew,
    is_featured: data.featured,
    sort_order: data.sortOrder ?? row.sort_order,
    colors: data.colors,
    rating: data.rating,
    reviews: data.reviews,
    i18n,
  }
}

// All real photos of a product, in order (first = main/cover photo).
// Older products only have `image`; they count as a one-photo gallery.
export function productPhotos(product) {
  const list = Array.isArray(product?.images) ? product.images.filter((s) => typeof s === 'string' && s) : []
  if (list.length) return list
  return product?.image ? [product.image] : []
}

// Photos for the gallery: real photos, or the drawn placeholder if none.
export function galleryImages(product) {
  const list = productPhotos(product)
  return list.length ? list : [productImage(product)]
}

export function productImage(product) {
  const first = Array.isArray(product?.images) && product.images[0]
  if (first) return first
  if (product?.image) return product.image
  const tones = product?.tones || ['#e01b24', '#7a0d13']
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 600" width="600" height="600">` +
    `<defs>` +
    `<linearGradient id="g" x1="0" y1="0" x2="1" y2="1">` +
    `<stop offset="0" stop-color="${tones[0]}"/>` +
    `<stop offset="1" stop-color="${tones[1]}"/>` +
    `</linearGradient>` +
    `<radialGradient id="r" cx="28%" cy="22%" r="82%">` +
    `<stop offset="0" stop-color="#ffffff" stop-opacity="0.55"/>` +
    `<stop offset="1" stop-color="#ffffff" stop-opacity="0"/>` +
    `</radialGradient>` +
    `</defs>` +
    `<rect width="600" height="600" fill="url(#g)"/>` +
    `<rect width="600" height="600" fill="url(#r)"/>` +
    `<circle cx="486" cy="112" r="140" fill="#ffffff" opacity="0.08"/>` +
    `<circle cx="110" cy="510" r="180" fill="#000000" opacity="0.10"/>` +
    `<circle cx="300" cy="300" r="196" fill="#ffffff" opacity="0.10"/>` +
    // Line flower (Lucide "Flower2" geometry) instead of an emoji.
    `<g transform="translate(192 186) scale(9)" fill="none" stroke="#ffffff" stroke-opacity="0.9" stroke-width="0.55" stroke-linecap="round" stroke-linejoin="round">` +
    `<path d="M12 5a3 3 0 1 1 3 3m-3-3a3 3 0 1 0-3 3m3-3v1M9 8a3 3 0 1 0 3 3M9 8h1m5 0a3 3 0 1 1-3 3m3-3h-1m-2 3v-1"/>` +
    `<circle cx="12" cy="8" r="2"/>` +
    `<path d="M12 10v12"/>` +
    `<path d="M12 22c4.2 0 7-1.667 7-5-4.2 0-7 1.667-7 5Z"/>` +
    `<path d="M12 22c-4.2 0-7-1.667-7-5 4.2 0 7 1.667 7 5Z"/>` +
    `</g>` +
    `</svg>`
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg)
}

export function productName(product, lang = 'tm') {
  return product?.i18n?.[lang]?.name || product?.i18n?.tm?.name || product?.i18n?.ru?.name || '—'
}

export function productDesc(product, lang = 'tm') {
  return product?.i18n?.[lang]?.desc || product?.i18n?.tm?.desc || product?.i18n?.ru?.desc || ''
}

export function formatPrice(value) {
  return `${value} TMT`
}

export function discountPercent(product) {
  if (!product?.old || product.old <= product.price) return 0
  return Math.round((1 - product.price / product.old) * 100)
}

export function slugify(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9а-яё]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || `item-${Date.now()}`
}

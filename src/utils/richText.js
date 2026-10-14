// Product descriptions: a small safe subset of HTML (bold, italic, bullet
// lists, paragraphs, line breaks). Everything else is removed, including all
// attributes, so pasted text from Word/websites cannot break the page.
const ALLOWED = { P: 'p', BR: 'br', STRONG: 'strong', B: 'strong', EM: 'em', I: 'em', UL: 'ul', OL: 'ul', LI: 'li', DIV: 'p' }
const LANGS = ['tm', 'ru', 'tr']

const escapeHtml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

function cleanNode(node, out, doc) {
  for (const child of [...node.childNodes]) {
    if (child.nodeType === 3) { out.appendChild(doc.createTextNode(child.textContent)); continue }
    if (child.nodeType !== 1) continue
    const tag = ALLOWED[child.tagName]
    if (child.tagName === 'SCRIPT' || child.tagName === 'STYLE') continue
    if (!tag) { cleanNode(child, out, doc); continue } // unknown tag: keep its text
    const el = doc.createElement(tag)
    if (tag !== 'br') cleanNode(child, el, doc)
    out.appendChild(el)
  }
}

export function sanitizeHtml(html) {
  if (!html || typeof DOMParser === 'undefined') return ''
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html')
  const out = doc.createElement('div')
  cleanNode(doc.body.firstChild, out, doc)
  // drop empty paragraphs / lists at the ends, keep inner line breaks
  let s = out.innerHTML
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

// Plain text (older products) -> paragraphs.
export function textToHtml(text) {
  const t = String(text || '').trim()
  if (!t) return ''
  return t.split(/\n{2,}/).map((p) => `<p>${escapeHtml(p).replace(/\n/g, '<br>')}</p>`).join('')
}

// The description fields of one language: { html, composition, size, care }
function langDetails(product, lang) {
  const d = product?.i18n?.[lang] || {}
  return {
    html: d.descHtml ? d.descHtml : textToHtml(d.desc),
    composition: String(d.composition || '').trim(),
    size: String(d.size || '').trim(),
    care: String(d.care || '').trim(),
  }
}

// What the product page shows in `lang`; every empty field falls back to the
// first other language that has it, so a missing translation never leaves a gap.
export function productDetails(product, lang) {
  const order = [lang, ...LANGS.filter((l) => l !== lang)]
  const all = order.map((l) => langDetails(product, l))
  const pick = (k) => all.find((d) => d[k])?.[k] || ''
  return { html: pick('html'), composition: pick('composition'), size: pick('size'), care: pick('care') }
}

export const hasDetails = (d) => !!(d && (d.html || d.composition || d.size || d.care))

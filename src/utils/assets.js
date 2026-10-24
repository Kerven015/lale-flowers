// Built-in pictures (the public/ folder: logo, sample flower photos) are
// served from the site's own address: "/" normally (your domain, Docker,
// nginx, npm run dev) or "/lale-flowers/" for the GitHub Pages preview.
// Photos uploaded in the admin panel (/uploads/...) come from the shop
// server and are used as they are. Only for showing: stored paths stay "/images/...".
const BASE = import.meta.env.BASE_URL || '/'

export function assetUrl(url) {
  if (BASE === '/' || typeof url !== 'string') return url
  if (!url.startsWith('/') || url.startsWith('//') || url.startsWith('/uploads/') || url.startsWith(BASE)) return url
  return BASE + url.slice(1)
}

export const LOGO = assetUrl('/images/lale%20gulleri.jpg')

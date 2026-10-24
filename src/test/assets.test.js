// Built-in pictures follow the site's address (root, or /lale-flowers/ on
// GitHub Pages); uploaded photos and drawn placeholders are left alone.
import { afterEach, describe, expect, test, vi } from 'vitest'

async function load(base) {
  vi.resetModules()
  vi.stubEnv('BASE_URL', base)
  return import('../utils/assets')
}
afterEach(() => vi.unstubAllEnvs())

describe('assetUrl', () => {
  test('site at the root address: paths stay as they are', async () => {
    const { assetUrl, LOGO } = await load('/')
    expect(assetUrl('/images/products/peony-bouquet.jpg')).toBe('/images/products/peony-bouquet.jpg')
    expect(LOGO).toBe('/images/lale%20gulleri.jpg')
  })

  test('GitHub Pages (/lale-flowers/): built-in pictures get the prefix', async () => {
    const { assetUrl, LOGO } = await load('/lale-flowers/')
    expect(assetUrl('/images/products/peony-bouquet.jpg')).toBe('/lale-flowers/images/products/peony-bouquet.jpg')
    expect(LOGO).toBe('/lale-flowers/images/lale%20gulleri.jpg')
    expect(assetUrl('/uploads/abc.webp')).toBe('/uploads/abc.webp') // from the shop server
    expect(assetUrl('data:image/svg+xml,x')).toBe('data:image/svg+xml,x')
    expect(assetUrl('/lale-flowers/images/a.jpg')).toBe('/lale-flowers/images/a.jpg') // never twice
  })
})

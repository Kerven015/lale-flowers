// Every text must exist in every language (tm, ru, tr).
import { describe, expect, test } from 'vitest'
import { I18N, SUPPORTED } from '../data/translations'
import { TEXT } from '../pages/admin/texts'

describe.each([['shop', I18N], ['admin', TEXT]])('%s texts', (_, dict) => {
  const all = new Set(SUPPORTED.flatMap((l) => Object.keys(dict[l])))
  test.each(SUPPORTED)('%s has every key and no empty text', (lang) => {
    const missing = [...all].filter((k) => !(k in dict[lang]))
    expect(missing).toEqual([])
    const empty = Object.entries(dict[lang]).filter(([, v]) => typeof v === 'string' && !v.trim()).map(([k]) => k)
    expect(empty).toEqual([])
  })
})

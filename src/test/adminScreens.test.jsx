// @vitest-environment jsdom
// Admin screens: order status rules (same as the server) and the dashboard's
// loading / error / empty / data states.
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { canMove } from '../pages/admin/AdminOrders'
import AdminDashboard from '../pages/admin/AdminDashboard'
import { TEXT } from '../pages/admin/texts'
import { I18nProvider } from '../contexts/I18nContext'

globalThis.IS_REACT_ACT_ENVIRONMENT = true
const L = TEXT.ru

describe('order status rules', () => {
  const S = ['new', 'confirmed', 'preparing', 'delivering', 'done', 'cancelled']
  test('allowed moves', () => {
    const allowed = Object.fromEntries(S.map((from) => [from, S.filter((to) => canMove(from, to))]))
    expect(allowed).toEqual({
      new: ['confirmed', 'preparing', 'delivering', 'done', 'cancelled'],
      confirmed: ['preparing', 'delivering', 'done', 'cancelled'],
      preparing: ['delivering', 'done', 'cancelled'],
      delivering: ['done', 'cancelled'],
      done: [],
      cancelled: ['new'],
    })
  })
})

const STATS = {
  range: { from: '2026-03-01', to: '2026-03-03', group: 'day', today: '2026-03-03' },
  totals: { orders: 3, delivered: 2, cancelled: 1, revenue: 400, orderValue: 650, discounts: 20, avgDelivered: 200, avgOrder: 217 },
  series: [{ period: '2026-03-01', orders: 2, revenue: 400, orderValue: 600 }, { period: '2026-03-03', orders: 1, revenue: 0, orderValue: 50 }],
  bestSellers: [{ productId: 1, names: { ru: 'Тюльпаны' }, qty: 6, amount: 300 }],
  now: { todayOrders: 1, todayValue: 50, todayDeliveries: 2, pending: 1, byStatus: { new: 1, confirmed: 0, preparing: 0, delivering: 0, done: 2, cancelled: 1 } },
  recent: [{ id: 9, code: 'LG-AAAA1111', status: 'new', createdAt: '2026-03-03T08:00:00Z', total: 50, name: 'A B' }],
  lowStock: [{ id: 3, names: { ru: 'Пионы' }, stock: 1 }],
  lowStockThreshold: 5,
}

async function render(call) {
  localStorage.setItem('lale_lang', 'ru')
  const el = document.createElement('div')
  document.body.appendChild(el)
  await act(async () => { createRoot(el).render(<I18nProvider><AdminDashboard L={L} call={call} onOpenTab={() => {}} /></I18nProvider>) })
  await act(async () => { await new Promise((r) => setTimeout(r, 0)) })
  return el
}

describe('dashboard', () => {
  beforeEach(() => { document.body.replaceChildren(); localStorage.clear() })

  test('shows the real numbers it was given, with every day in the range', async () => {
    const call = vi.fn(async () => STATS)
    const el = await render(call)
    expect(call.mock.calls[0][0]).toMatch(/^\/api\/admin\/stats\?/)
    const text = el.textContent.replace(/\s+/g, ' ')
    expect(text).toContain('400 TMT') // revenue = delivered
    expect(text).toContain('650 TMT') // order value
    expect(text).toContain('Тюльпаны')
    expect(text).toContain('Пионы')
    expect(text).toContain('LG-AAAA1111')
    // 3 days in the range -> 3 columns (the missing day counts as 0)
    expect(el.querySelectorAll('.dash-chart rect').length).toBe(3)
    expect(el.querySelectorAll('.dash-bar').length).toBe(1) // revenue: only 03-01 has delivered sales; zero days draw no bar
  })

  test('the table view lists every period', async () => {
    const el = await render(vi.fn(async () => STATS))
    const btn = [...el.querySelectorAll('button')].find((b) => b.textContent.includes(L.dashTable))
    await act(async () => { btn.click() })
    expect(el.querySelectorAll('.dash-table tbody tr').length).toBe(3)
  })

  test('an empty period says so instead of drawing a chart', async () => {
    const empty = { ...STATS, totals: { ...STATS.totals, orders: 0, cancelled: 0, delivered: 0, revenue: 0, orderValue: 0 }, series: [], bestSellers: [], recent: [], lowStock: [] }
    const el = await render(vi.fn(async () => empty))
    expect(el.textContent).toContain(L.dashEmpty)
    expect(el.querySelector('.dash-chart')).toBeNull()
    expect(el.textContent).toContain(L.dashNoLowStock)
  })

  test('a server error shows a retry button', async () => {
    const call = vi.fn(async () => { throw new Error('boom') })
    const el = await render(call)
    expect(el.textContent).toContain(L.loadFailed)
    expect([...el.querySelectorAll('button')].some((b) => b.textContent === L.retry)).toBe(true)
  })
})

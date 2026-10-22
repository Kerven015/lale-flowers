// The shop's own clock (Turkmenistan, UTC+5, no summer time). Days for
// deliveries and statistics are counted in shop time, not the server's.
export const SHOP_TZ = 'Asia/Ashgabat'

const parts = (date) => Object.fromEntries(
  new Intl.DateTimeFormat('en-CA', { timeZone: SHOP_TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(date).map((p) => [p.type, p.value]),
)

// 'YYYY-MM-DD' of the shop's today (or of `date`)
export function shopDay(date = new Date()) {
  const p = parts(date)
  return `${p.year}-${p.month}-${p.day}`
}

// minutes since midnight, shop time
export function shopMinutes(date = new Date()) {
  const p = parts(date)
  return Number(p.hour) * 60 + Number(p.minute)
}

export const DAY_RE = /^\d{4}-\d{2}-\d{2}$/

// 'YYYY-MM-DD' + n days (calendar arithmetic, no time zones involved)
export function addDays(day, n) {
  const d = new Date(`${day}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

export function isRealDay(day) {
  return DAY_RE.test(day) && new Date(`${day}T00:00:00Z`).toISOString().slice(0, 10) === day
}

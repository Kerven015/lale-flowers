// Scheduled delivery: which days and time slots a customer can pick, and
// checking the pick when the order is placed.
import { HttpError } from './http.js'
import { slotStart } from './settings.js'
import { addDays, isRealDay, shopDay, shopMinutes } from './shopTime.js'

// A slot for today must start at least this long from now (to prepare the flowers).
export const SAME_DAY_LEAD_MINUTES = 60

// Orders already booked per "day|slot" (cancelled ones don't count).
async function bookedCounts(db, fromDay, toDay) {
  const { rows } = await db.query(
    `SELECT to_char(delivery_date, 'YYYY-MM-DD') AS day, delivery_slot AS slot, count(*)::int AS n
     FROM orders WHERE delivery_date BETWEEN $1 AND $2 AND status <> 'cancelled'
     GROUP BY delivery_date, delivery_slot`,
    [fromDay, toDay],
  )
  return new Map(rows.map((r) => [`${r.day}|${r.slot}`, r.n]))
}

function slotOpen(settings, day, slot, today, now) {
  if (day !== today) return true
  const start = slotStart(slot)
  return start !== null && start >= now + SAME_DAY_LEAD_MINUTES
}

// For the checkout page: every day with its slots and whether each can be booked.
export async function deliveryCalendar(db, settings) {
  if (!settings.scheduledDelivery) return { enabled: false, days: [] }
  const today = shopDay()
  const now = shopMinutes()
  const last = addDays(today, settings.deliveryDaysAhead)
  const booked = settings.slotCapacity > 0 ? await bookedCounts(db, today, last) : new Map()
  const days = []
  for (let d = today; d <= last; d = addDays(d, 1)) {
    const slots = settings.deliverySlots.map((slot) => ({
      slot,
      open: slotOpen(settings, d, slot, today, now) &&
        !(settings.slotCapacity > 0 && (booked.get(`${d}|${slot}`) || 0) >= settings.slotCapacity),
    }))
    if (slots.some((s) => s.open)) days.push({ date: d, slots })
  }
  return { enabled: true, days }
}

// Checks the customer's pick. Returns { date, slot } (null / '' = as soon as
// possible). Field problems go into `errors`; a full slot throws 409 slot_full.
// Call inside the order's transaction: the slot is locked until it ends, so
// two customers can't take the last place at once.
export async function checkDelivery(db, settings, body, errors) {
  const date = typeof body.deliveryDate === 'string' ? body.deliveryDate.trim() : ''
  const slot = typeof body.deliverySlot === 'string' ? body.deliverySlot.trim() : ''
  if (!date && !slot) return { date: null, slot: '' }
  if (!settings.scheduledDelivery) { errors.deliveryDate = 'invalid'; return null }
  const today = shopDay()
  if (!isRealDay(date) || date < today || date > addDays(today, settings.deliveryDaysAhead)) errors.deliveryDate = 'invalid'
  if (!settings.deliverySlots.includes(slot)) errors.deliverySlot = 'invalid'
  else if (!errors.deliveryDate && !slotOpen(settings, date, slot, today, shopMinutes())) errors.deliverySlot = 'too_late'
  if (errors.deliveryDate || errors.deliverySlot) return null
  if (settings.slotCapacity > 0) {
    await db.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`slot|${date}|${slot}`])
    const booked = await bookedCounts(db, date, date)
    if ((booked.get(`${date}|${slot}`) || 0) >= settings.slotCapacity) throw new HttpError(409, 'slot_full')
  }
  return { date, slot }
}

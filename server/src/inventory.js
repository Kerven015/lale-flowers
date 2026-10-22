// Stock history: every change to a counted flower's stock is written here.
export const ADJUST_REASONS = ['received', 'damaged', 'correction']

export async function recordMovement(db, { productId, change, stockAfter, reason, orderId = null, adminId = null, note = '' }) {
  await db.query(
    `INSERT INTO stock_movements (product_id, change, stock_after, reason, order_id, admin_id, note)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [productId, change, stockAfter, reason, orderId, adminId, String(note || '').slice(0, 300)],
  )
}

// Puts the shop's original 16 flowers into an empty database (same ids, so
// baskets and favourites saved in visitors' browsers keep working).
// Does nothing if there are already products.   Usage: npm run seed
import { DEFAULT_PRODUCTS } from '../../src/data/catalog.js'
import { OCCASIONS } from '../../src/data/navigation.js'
import { pool } from '../src/db.js'

try {
  const { rows } = await pool.query('SELECT count(*)::int AS n FROM products')
  if (rows[0].n > 0) {
    console.log(`There are already ${rows[0].n} products — nothing added.`)
  } else {
    for (const [i, p] of DEFAULT_PRODUCTS.entries()) {
      // what each flower is shown under: its original occasions and its own
      // category (the same list migration 010 writes for older shops)
      const occasions = Array.isArray(p.occasions) ? p.occasions
        : [...OCCASIONS.filter((o) => o.ids.includes(p.id)).map((o) => o.key), p.cat]
      const images = Array.isArray(p.images) && p.images.length ? p.images : p.image ? [p.image] : []
      await pool.query(
        `INSERT INTO products (id, slug, cat, custom_type, occasions, price, old_price, rating, reviews, colors,
           is_new, in_stock, tones, images, i18n, sort_order)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
        [p.id, p.slug, p.cat, p.customType || null, JSON.stringify(occasions),
          p.price, p.old || null, p.rating || 0, p.reviews || 0, JSON.stringify(p.colors || []),
          !!p.isNew, p.inStock !== false, JSON.stringify(p.tones || []), JSON.stringify(images), JSON.stringify(p.i18n), i],
      )
    }
    await pool.query(`SELECT setval(pg_get_serial_sequence('products', 'id'), (SELECT max(id) FROM products))`)
    console.log(`Added ${DEFAULT_PRODUCTS.length} products.`)
  }
} catch (err) {
  console.error('Seed failed:', err.message)
  process.exitCode = 1
} finally {
  await pool.end()
}

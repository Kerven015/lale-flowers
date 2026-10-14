-- Faster lookups when a password changes (all logins of one account) and
-- when products are looked up from old orders.
CREATE INDEX IF NOT EXISTS sessions_customer_idx ON sessions (customer_id) WHERE customer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS sessions_admin_idx ON sessions (admin_id) WHERE admin_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS order_items_product_idx ON order_items (product_id);

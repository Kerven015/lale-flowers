-- Dashboard support, scheduled delivery, stock history, featured flowers and
-- the admin activity log.

-- "Featured" flowers come first in the home page's popular section.
ALTER TABLE products ADD COLUMN is_featured boolean NOT NULL DEFAULT false;

-- Delivery day and time slot the customer asked for (NULL / '' = as soon as
-- possible), and the text for the greeting card that goes with the flowers.
ALTER TABLE orders ADD COLUMN delivery_date date;
ALTER TABLE orders ADD COLUMN delivery_slot text NOT NULL DEFAULT '';
ALTER TABLE orders ADD COLUMN card_message text NOT NULL DEFAULT '';
CREATE INDEX orders_delivery_idx ON orders (delivery_date, delivery_slot) WHERE delivery_date IS NOT NULL;
CREATE INDEX orders_created_idx ON orders (created_at);

-- Every change to a counted flower's stock: orders, cancellations, deliveries
-- received, wilted / damaged flowers, corrections.
CREATE TABLE stock_movements (
  id          serial      PRIMARY KEY,
  product_id  integer     REFERENCES products (id) ON DELETE SET NULL,
  change      integer     NOT NULL,          -- + added, - taken
  stock_after integer,                       -- NULL = the flower stopped being counted
  reason      text        NOT NULL CHECK (reason IN ('order', 'cancel', 'restore', 'received', 'damaged', 'correction', 'set')),
  order_id    integer     REFERENCES orders (id) ON DELETE SET NULL,
  admin_id    integer     REFERENCES admins (id) ON DELETE SET NULL,
  note        text        NOT NULL DEFAULT '',
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX stock_movements_product_idx ON stock_movements (product_id, created_at DESC);

-- What admins did (sign-ins, flowers, orders, customers, settings, codes).
CREATE TABLE admin_log (
  id         bigserial   PRIMARY KEY,
  admin_id   integer     REFERENCES admins (id) ON DELETE SET NULL,
  admin_name text        NOT NULL DEFAULT '',
  action     text        NOT NULL,           -- e.g. product.update, order.status
  target     text        NOT NULL DEFAULT '', -- e.g. product:5, order:LG-7K3M9Q2X
  details    jsonb       NOT NULL DEFAULT '{}',
  ip         text        NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX admin_log_created_idx ON admin_log (created_at DESC);

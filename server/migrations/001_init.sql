-- Lale Gülleri — database structure (PostgreSQL 13+)

-- Flowers / products shown in the shop. Deleted products are kept (deleted_at)
-- so old orders still point to them.
CREATE TABLE products (
  id           serial PRIMARY KEY,
  slug         text        NOT NULL,
  cat          text        NOT NULL,              -- roses, tulips, bouquets, gifts, plants, other
  custom_type  text,                              -- text typed by the admin when cat = 'other'
  occasions    jsonb,                             -- menu sections; NULL = the original built-in list
  price        integer     NOT NULL CHECK (price > 0),
  old_price    integer     CHECK (old_price IS NULL OR old_price > price),
  rating       real        NOT NULL DEFAULT 0,
  reviews      integer     NOT NULL DEFAULT 0,
  colors       jsonb       NOT NULL DEFAULT '[]',
  is_new       boolean     NOT NULL DEFAULT false,
  in_stock     boolean     NOT NULL DEFAULT true,
  tones        jsonb       NOT NULL DEFAULT '[]', -- colours of the drawn placeholder picture
  images       jsonb       NOT NULL DEFAULT '[]', -- photo URLs, first = main photo
  i18n         jsonb       NOT NULL,              -- { tm: {name, desc, descHtml, composition, size, care}, ru: ..., tr: ... }
  sort_order   integer     NOT NULL DEFAULT 0,
  deleted_at   timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX products_live_idx ON products (sort_order, id) WHERE deleted_at IS NULL;

-- Shop customers (email + password).
CREATE TABLE customers (
  id            serial PRIMARY KEY,
  email         text        NOT NULL,
  first_name    text        NOT NULL,
  last_name     text        NOT NULL DEFAULT '',
  phone         text        NOT NULL DEFAULT '',
  password_hash text        NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX customers_email_key ON customers (lower(email));

-- People who can open the admin panel (created with: npm run create-admin).
CREATE TABLE admins (
  id            serial PRIMARY KEY,
  username      text        NOT NULL,
  password_hash text        NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX admins_username_key ON admins (lower(username));

-- Login sessions. Only a hash of the cookie token is stored.
CREATE TABLE sessions (
  token_hash  text        PRIMARY KEY,
  kind        text        NOT NULL CHECK (kind IN ('customer', 'admin')),
  customer_id integer     REFERENCES customers (id) ON DELETE CASCADE,
  admin_id    integer     REFERENCES admins (id) ON DELETE CASCADE,
  expires_at  timestamptz NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CHECK ((kind = 'customer' AND customer_id IS NOT NULL) OR (kind = 'admin' AND admin_id IS NOT NULL))
);
CREATE INDEX sessions_expires_idx ON sessions (expires_at);

-- Orders. Prices are copied in at order time, so later price changes
-- never change an existing order.
CREATE TABLE orders (
  id            serial PRIMARY KEY,
  code          text        NOT NULL UNIQUE,      -- what the customer sees, e.g. LG-7K3M9Q2X
  customer_id   integer     REFERENCES customers (id) ON DELETE SET NULL,
  status        text        NOT NULL DEFAULT 'new'
                CHECK (status IN ('new', 'confirmed', 'preparing', 'delivering', 'done', 'cancelled')),
  first_name    text        NOT NULL,
  last_name     text        NOT NULL,
  phone         text        NOT NULL,
  email         text        NOT NULL,
  city          text        NOT NULL DEFAULT '',
  address       text        NOT NULL DEFAULT '',
  notes         text        NOT NULL DEFAULT '',
  delivery_type text        NOT NULL CHECK (delivery_type IN ('delivery', 'pickup')),
  payment       text        NOT NULL CHECK (payment IN ('card', 'cash')),
  lang          text        NOT NULL DEFAULT 'tm',
  subtotal      integer     NOT NULL,
  delivery_fee  integer     NOT NULL,
  total         integer     NOT NULL,
  admin_note    text        NOT NULL DEFAULT '',
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX orders_status_idx ON orders (status, created_at DESC);
CREATE INDEX orders_customer_idx ON orders (customer_id, created_at DESC);

CREATE TABLE order_items (
  id         serial PRIMARY KEY,
  order_id   integer NOT NULL REFERENCES orders (id) ON DELETE CASCADE,
  product_id integer REFERENCES products (id) ON DELETE SET NULL,
  names      jsonb   NOT NULL,                    -- product name in tm / ru / tr at order time
  price      integer NOT NULL,
  qty        integer NOT NULL CHECK (qty BETWEEN 1 AND 99)
);
CREATE INDEX order_items_order_idx ON order_items (order_id);

-- Contact form messages.
CREATE TABLE messages (
  id         serial PRIMARY KEY,
  name       text        NOT NULL,
  email      text        NOT NULL,
  phone      text        NOT NULL DEFAULT '',
  message    text        NOT NULL,
  read_at    timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Newsletter sign-ups.
CREATE TABLE subscribers (
  id         serial PRIMARY KEY,
  email      text        NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX subscribers_email_key ON subscribers (lower(email));

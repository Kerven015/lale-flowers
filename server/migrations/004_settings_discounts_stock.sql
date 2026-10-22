-- Shop settings, discount codes and flowers left in stock.

-- Settings the admin can change (one row per group; "shop" holds everything
-- for now). Values the website needs are read from here instead of the code.
CREATE TABLE settings (
  key        text        PRIMARY KEY,
  value      jsonb       NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO settings (key, value) VALUES ('shop', '{
  "deliveryPrice": 25,
  "freeDeliveryFrom": 200,
  "ordersOpen": true,
  "firstOrderDiscount": 10,
  "phone": "+993 12 000 000",
  "email": "info@lalegulleri.com",
  "instagram": "https://www.instagram.com/lale.gulleri/",
  "address": { "tm": "Aşgabat, Türkmenistan, Magtymguly şaýoly 45", "ru": "Ашхабад, Туркменистан, проспект Махтумкули, 45", "tr": "Aşkabat, Türkmenistan, Mahtumkulu Caddesi 45" },
  "hours": { "tm": "Duşenbe – Ýekşenbe: 08:00 – 22:00", "ru": "Понедельник – Воскресенье: 08:00 – 22:00", "tr": "Pazartesi – Pazar: 08:00 – 22:00" }
}');

-- How many of a flower are left. NULL = not counted (only the "in stock"
-- switch is used). When counted, the flower sells out by itself at 0.
ALTER TABLE products ADD COLUMN stock integer CHECK (stock IS NULL OR stock >= 0);

-- Discount codes typed at checkout, e.g. WELCOME10.
CREATE TABLE discount_codes (
  id               serial      PRIMARY KEY,
  code             text        NOT NULL,                 -- stored in capitals
  kind             text        NOT NULL CHECK (kind IN ('percent', 'amount')),
  value            integer     NOT NULL CHECK (value > 0),
  min_total        integer     NOT NULL DEFAULT 0 CHECK (min_total >= 0),
  starts_at        timestamptz,
  ends_at          timestamptz,
  max_uses         integer     CHECK (max_uses IS NULL OR max_uses > 0),
  used_count       integer     NOT NULL DEFAULT 0 CHECK (used_count >= 0),
  first_order_only boolean     NOT NULL DEFAULT false,
  active           boolean     NOT NULL DEFAULT true,
  created_at       timestamptz NOT NULL DEFAULT now(),
  CHECK (kind <> 'percent' OR value <= 100)
);
CREATE UNIQUE INDEX discount_codes_code_key ON discount_codes (upper(code));

-- The discount an order got: the code typed (empty = none / first-order
-- discount) and the amount taken off the flowers.
ALTER TABLE orders ADD COLUMN discount_code text NOT NULL DEFAULT '';
ALTER TABLE orders ADD COLUMN discount integer NOT NULL DEFAULT 0 CHECK (discount >= 0);

-- Categories the admin adds in the admin panel, next to the built-in ones
-- (roses, tulips, bouquets, gifts, plants, which stay in the code).
CREATE TABLE categories (
  id         serial      PRIMARY KEY,
  slug       text        NOT NULL UNIQUE,  -- in the address (/category/peonies) and in products.cat
  names      jsonb       NOT NULL,         -- {"tm": "...", "ru": "...", "tr": "..."}
  sort_order integer     NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

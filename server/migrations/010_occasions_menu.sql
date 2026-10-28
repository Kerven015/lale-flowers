-- Occasions ("Birthday", "Love & romance" ...) become editable in the admin
-- panel like categories, and the top menu bar gets its own list of links.

CREATE TABLE occasions (
  id         serial      PRIMARY KEY,
  slug       text        NOT NULL UNIQUE,  -- in the address (/catalog?occasion=birthday) and in products.occasions
  names      jsonb       NOT NULL,         -- {"tm": "...", "ru": "...", "tr": "..."}
  sort_order integer     NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO occasions (slug, names, sort_order) VALUES
  ('birthday', '{"tm": "Doglan gün",         "ru": "День рождения",      "tr": "Doğum günü"}',  1),
  ('love',     '{"tm": "Söýgi we romantika", "ru": "Любовь и романтика", "tr": "Sevgi & aşk"}', 2),
  ('wedding',  '{"tm": "Toý",                "ru": "Свадьба",            "tr": "Düğün"}',       3),
  ('congrats', '{"tm": "Gutlag",             "ru": "Поздравление",       "tr": "Tebrik"}',      4),
  ('thanks',   '{"tm": "Minnetdarlyk",       "ru": "Благодарность",      "tr": "Teşekkür"}',    5),
  ('home',     '{"tm": "Öý we ofis",         "ru": "Для дома и офиса",   "tr": "Ev ve ofis"}',  6);

-- The links between "Home" and "Catalog" in the top bar, in order.
-- Each is an occasion or a category: {"type": "occasion"|"category", "key": "..."}.
INSERT INTO settings (key, value) VALUES ('menu', '[
  {"type": "occasion", "key": "birthday"},
  {"type": "occasion", "key": "love"},
  {"type": "category", "key": "roses"},
  {"type": "category", "key": "bouquets"},
  {"type": "category", "key": "gifts"}
]') ON CONFLICT (key) DO NOTHING;

-- Flowers never edited in the admin panel got their occasions from a fixed
-- list in the website code (src/data/navigation.js). Write that list into the
-- flowers themselves (with their own built-in category, as the flower form
-- pre-ticks it), so occasions can be renamed / deleted for every flower.
UPDATE products p SET occasions = (
  SELECT coalesce(jsonb_agg(tag ORDER BY ord), '[]'::jsonb) FROM (
    SELECT v.tag, v.ord FROM (VALUES
      ('birthday', 1, ARRAY[9, 14, 6, 11, 5, 12]),
      ('love',     2, ARRAY[1, 2, 8, 4, 7, 16]),
      ('wedding',  3, ARRAY[10, 3, 16, 4]),
      ('congrats', 4, ARRAY[7, 12, 9, 6, 15, 11]),
      ('thanks',   5, ARRAY[5, 6, 11, 15, 14]),
      ('home',     6, ARRAY[13, 5, 15])
    ) AS v(tag, ord, ids) WHERE p.id = ANY(v.ids)
    UNION ALL
    SELECT p.cat, 100 WHERE p.cat IN ('roses', 'tulips', 'bouquets', 'gifts', 'plants')
  ) t
)
WHERE p.occasions IS NULL;

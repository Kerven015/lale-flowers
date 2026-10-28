-- The built-in categories (roses, tulips, bouquets, gifts, plants) become
-- normal rows, so the admin can rename, reorder or delete them like the ones
-- they add. Their addresses (/roses, /tulips ...) stay the same.
UPDATE categories SET sort_order = sort_order + 5;
INSERT INTO categories (slug, names, sort_order) VALUES
  ('roses',    '{"tm": "Güller",      "ru": "Розы",     "tr": "Güller"}',    1),
  ('tulips',   '{"tm": "Çigildemler", "ru": "Тюльпаны", "tr": "Laleler"}',   2),
  ('bouquets', '{"tm": "Buketler",    "ru": "Букеты",   "tr": "Buketler"}',  3),
  ('gifts',    '{"tm": "Sowgatlar",   "ru": "Подарки",  "tr": "Hediyeler"}', 4),
  ('plants',   '{"tm": "Ösümlikler",  "ru": "Растения", "tr": "Bitkiler"}',  5)
ON CONFLICT (slug) DO NOTHING;

-- The shop's name is written "Läle" (not "Lale"). Renames it inside flower
-- names and descriptions already saved (e.g. the shop's own bouquet).
-- Only these exact phrases change: Turkish "lale" = tulip stays as it is.
UPDATE products
SET i18n = replace(replace(replace(replace(replace(i18n::text,
      'Lale gülleri', 'Läle gülleri'),
      'Lale Gülleri', 'Läle Gülleri'),
      'Lale ýörite bukedi', 'Läle ýörite bukedi'),
      'Специальный букет Lale', 'Специальный букет Läle'),
      'Lale Özel Buketi', 'Läle Özel Buketi')::jsonb,
    updated_at = now()
WHERE i18n::text LIKE '%Lale gülleri%' OR i18n::text LIKE '%Lale Gülleri%' OR i18n::text LIKE '%Lale ýörite bukedi%'
   OR i18n::text LIKE '%Специальный букет Lale%' OR i18n::text LIKE '%Lale Özel Buketi%';

-- Order lines keep the flower names from the moment of ordering; rename the shop's name there too.
UPDATE order_items
SET names = replace(replace(replace(names::text, 'Lale ýörite bukedi', 'Läle ýörite bukedi'),
      'Специальный букет Lale', 'Специальный букет Läle'), 'Lale Özel Buketi', 'Läle Özel Buketi')::jsonb
WHERE names::text LIKE '%Lale ýörite bukedi%' OR names::text LIKE '%Специальный букет Lale%' OR names::text LIKE '%Lale Özel Buketi%';

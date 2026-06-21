-- supabase/migrations/008_units_and_stock_count.sql

-- One-time correction, named explicitly — not a pattern match on current unit
-- values, so a future item legitimately using some other unit is never
-- accidentally caught by this fix.
UPDATE items
SET unit = 'g', quantity = quantity * 1000, low_threshold = low_threshold * 1000
WHERE name_vi = 'Bún tươi';

UPDATE items
SET unit = 'ml', quantity = quantity * 1000, low_threshold = low_threshold * 1000
WHERE name_vi = 'Dầu ăn';

-- The old qty_per_serving (1.50, in kg) was an unvalidated guess that implied
-- 1.5kg of noodles per bowl. 150g is the real reference amount.
UPDATE recipe_lines
SET qty_per_serving = 150
WHERE item_id = (SELECT id FROM items WHERE name_vi = 'Bún tươi');

ALTER TABLE items
  ADD CONSTRAINT items_unit_check
  CHECK (unit IN ('g', 'ml', 'gói', 'phần', 'miếng', 'bó', 'viên', 'chai'));

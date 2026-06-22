-- Mirrors the orders.table_id fix: an item should be deletable once
-- nothing CURRENTLY depends on it. recipe_lines is active configuration
-- (a dish's current recipe needs item_id to stay valid) so it keeps
-- blocking deletion as-is. stock_logs is just historical audit data —
-- it shouldn't block a delete, it should just lose the item reference.
ALTER TABLE stock_logs ALTER COLUMN item_id DROP NOT NULL;

DO $$
DECLARE
  existing_constraint text;
BEGIN
  SELECT tc.constraint_name INTO existing_constraint
  FROM information_schema.table_constraints tc
  JOIN information_schema.key_column_usage kcu
    ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
  WHERE tc.table_name = 'stock_logs'
    AND tc.constraint_type = 'FOREIGN KEY'
    AND kcu.column_name = 'item_id'
    AND tc.table_schema = 'public';

  IF existing_constraint IS NOT NULL THEN
    EXECUTE format('ALTER TABLE stock_logs DROP CONSTRAINT %I', existing_constraint);
  END IF;
END$$;

ALTER TABLE stock_logs
  ADD CONSTRAINT stock_logs_item_id_fkey FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE SET NULL;

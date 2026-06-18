ALTER TABLE items
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS ready_at timestamptz;

-- Only add FK if tables table now exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_orders_table'
  ) THEN
    ALTER TABLE orders
      ADD CONSTRAINT fk_orders_table FOREIGN KEY (table_id) REFERENCES tables(id);
  END IF;
END$$;

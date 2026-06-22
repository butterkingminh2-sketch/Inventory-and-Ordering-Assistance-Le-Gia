ALTER TABLE orders ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

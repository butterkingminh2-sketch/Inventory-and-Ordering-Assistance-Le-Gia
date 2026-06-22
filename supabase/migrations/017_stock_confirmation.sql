ALTER TABLE orders ADD COLUMN IF NOT EXISTS needs_stock_confirmation boolean NOT NULL DEFAULT false;

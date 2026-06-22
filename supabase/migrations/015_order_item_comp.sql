ALTER TABLE order_items ADD COLUMN IF NOT EXISTS comped boolean NOT NULL DEFAULT false;

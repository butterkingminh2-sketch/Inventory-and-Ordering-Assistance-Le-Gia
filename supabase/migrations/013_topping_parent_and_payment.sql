ALTER TABLE order_items ADD COLUMN IF NOT EXISTS parent_item_id uuid REFERENCES order_items(id) ON DELETE CASCADE;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_method text CHECK (payment_method IN ('cash', 'transfer'));

-- supabase/migrations/004_register_billing.sql
ALTER TABLE dishes ADD COLUMN IF NOT EXISTS price numeric(10,2) NOT NULL DEFAULT 0;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS price_at_order numeric(10,2);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS paid_at timestamptz;

ALTER TABLE user_profiles DROP CONSTRAINT IF EXISTS user_profiles_role_check;
ALTER TABLE user_profiles ADD CONSTRAINT user_profiles_role_check
  CHECK (role IN ('foh', 'kitchen', 'manager', 'register'));

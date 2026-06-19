-- Base schema for Lê Gia Inventory App
-- Run this FIRST, before any migrations in supabase/migrations/

CREATE TABLE IF NOT EXISTS branches (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS items (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id      uuid REFERENCES branches(id) NOT NULL,
  name_vi        text NOT NULL,
  name_en        text,
  unit           text NOT NULL,
  quantity       numeric(8,2) NOT NULL DEFAULT 0,
  low_threshold  numeric(8,2) NOT NULL DEFAULT 0,
  created_at     timestamptz DEFAULT now()
);

-- table_id is nullable here; FK constraint is added in 002_alter_existing.sql
-- after the tables table is created by 001_new_tables.sql
CREATE TABLE IF NOT EXISTS orders (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id  uuid REFERENCES branches(id) NOT NULL,
  table_id   uuid,
  status     text NOT NULL DEFAULT 'pending'
               CHECK (status IN ('pending', 'ready', 'delivered', 'cancelled')),
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS stock_logs (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id    uuid REFERENCES items(id) NOT NULL,
  delta      numeric(8,2) NOT NULL,
  reason     text NOT NULL,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now()
);

-- Enable Realtime on items and orders
ALTER PUBLICATION supabase_realtime ADD TABLE items;
ALTER PUBLICATION supabase_realtime ADD TABLE orders;

-- Seed: add your branches after running this
-- INSERT INTO branches (name) VALUES ('Lê Gia - Chi nhánh 1'), ('Lê Gia - Chi nhánh 2');

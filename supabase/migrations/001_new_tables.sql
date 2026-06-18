-- tables must be created before orders FK is wired
CREATE TABLE IF NOT EXISTS tables (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id  uuid REFERENCES branches(id) NOT NULL,
  label      text NOT NULL,
  is_active  boolean NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS dishes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id   uuid REFERENCES branches(id) NOT NULL,
  name_vi     text NOT NULL,
  name_en     text,
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS recipe_lines (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dish_id         uuid REFERENCES dishes(id) ON DELETE CASCADE NOT NULL,
  item_id         uuid REFERENCES items(id) NOT NULL,
  qty_per_serving numeric(8,2) NOT NULL CHECK (qty_per_serving > 0),
  UNIQUE (dish_id, item_id)
);

CREATE TABLE IF NOT EXISTS order_items (
  id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid REFERENCES orders(id) ON DELETE CASCADE NOT NULL,
  dish_id  uuid REFERENCES dishes(id) NOT NULL,
  qty      int NOT NULL DEFAULT 1 CHECK (qty > 0)
);

CREATE TABLE IF NOT EXISTS user_profiles (
  id         uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  branch_id  uuid REFERENCES branches(id) NOT NULL,
  role       text NOT NULL CHECK (role IN ('foh', 'kitchen', 'manager')),
  full_name  text
);

-- Indexes on FK columns for frequent query patterns
CREATE INDEX IF NOT EXISTS idx_tables_branch_id ON tables(branch_id);
CREATE INDEX IF NOT EXISTS idx_dishes_branch_id ON dishes(branch_id);
CREATE INDEX IF NOT EXISTS idx_recipe_lines_dish_id ON recipe_lines(dish_id);
CREATE INDEX IF NOT EXISTS idx_recipe_lines_item_id ON recipe_lines(item_id);
CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_dish_id ON order_items(dish_id);
CREATE INDEX IF NOT EXISTS idx_user_profiles_branch_id ON user_profiles(branch_id);

-- Enable Realtime replication for order_items (items and orders already enabled)
ALTER PUBLICATION supabase_realtime ADD TABLE order_items;

-- Postgres RPC used by stock.ts to apply decrements/reversals atomically
CREATE OR REPLACE FUNCTION apply_stock_change(
  p_changes  jsonb,
  p_reason   text,
  p_user_id  uuid
) RETURNS jsonb AS $$
DECLARE
  c          jsonb;
  floored    jsonb := '[]'::jsonb;
  pre_qty    numeric;
  new_qty    numeric;
  delta_val  numeric;
  item_uuid  uuid;
BEGIN
  FOR c IN SELECT * FROM jsonb_array_elements(p_changes)
  LOOP
    delta_val := (c->>'delta')::numeric;
    item_uuid := (c->>'item_id')::uuid;

    -- Lock the row, read the current quantity, then update atomically
    SELECT quantity INTO pre_qty
    FROM items
    WHERE id = item_uuid
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'item_id % not found', item_uuid;
    END IF;

    new_qty := GREATEST(pre_qty + delta_val, 0);

    UPDATE items
    SET quantity = new_qty
    WHERE id = item_uuid;

    INSERT INTO stock_logs (item_id, delta, reason, created_by)
    VALUES (item_uuid, delta_val, p_reason, p_user_id);

    IF pre_qty + delta_val < 0 THEN
      floored := floored || jsonb_build_array(c->>'item_id');
    END IF;
  END LOOP;

  RETURN jsonb_build_object('floored', floored);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

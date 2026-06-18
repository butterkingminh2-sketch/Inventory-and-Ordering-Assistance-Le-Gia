-- tables must be created before orders FK is wired
CREATE TABLE IF NOT EXISTS tables (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id  uuid REFERENCES branches(id) NOT NULL,
  label      text NOT NULL,
  is_active  boolean DEFAULT true
);

CREATE TABLE IF NOT EXISTS dishes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id   uuid REFERENCES branches(id) NOT NULL,
  name_vi     text NOT NULL,
  name_en     text,
  is_active   boolean DEFAULT true,
  created_at  timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS recipe_lines (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dish_id         uuid REFERENCES dishes(id) ON DELETE CASCADE NOT NULL,
  item_id         uuid REFERENCES items(id) NOT NULL,
  qty_per_serving numeric(8,2) NOT NULL,
  UNIQUE (dish_id, item_id)
);

CREATE TABLE IF NOT EXISTS order_items (
  id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid REFERENCES orders(id) ON DELETE CASCADE NOT NULL,
  dish_id  uuid REFERENCES dishes(id) NOT NULL,
  qty      int NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS user_profiles (
  id         uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  branch_id  uuid REFERENCES branches(id) NOT NULL,
  role       text NOT NULL CHECK (role IN ('foh', 'kitchen', 'manager')),
  full_name  text
);

-- Postgres RPC used by stock.ts to apply decrements/reversals atomically
CREATE OR REPLACE FUNCTION apply_stock_change(
  p_changes  jsonb,
  p_reason   text,
  p_user_id  uuid
) RETURNS jsonb AS $$
DECLARE
  c         jsonb;
  floored   jsonb := '[]'::jsonb;
  old_qty   numeric;
  new_qty   numeric;
  delta_val numeric;
BEGIN
  FOR c IN SELECT * FROM jsonb_array_elements(p_changes)
  LOOP
    delta_val := (c->>'delta')::numeric;

    SELECT quantity INTO old_qty
    FROM items WHERE id = (c->>'item_id')::uuid;

    new_qty := GREATEST(old_qty + delta_val, 0);

    UPDATE items
    SET quantity = new_qty
    WHERE id = (c->>'item_id')::uuid;

    INSERT INTO stock_logs (item_id, delta, reason, created_by)
    VALUES (
      (c->>'item_id')::uuid,
      delta_val,
      p_reason,
      p_user_id
    );

    IF old_qty + delta_val < 0 THEN
      floored := floored || jsonb_build_array(c->>'item_id');
    END IF;
  END LOOP;

  RETURN jsonb_build_object('floored', floored);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

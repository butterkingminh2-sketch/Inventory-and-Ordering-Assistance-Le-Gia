-- Fixes a stock-reversal bug: apply_stock_change logged the requested
-- (theoretical) delta even when the floor-at-zero clamp meant only part of
-- it was actually applied. Cancelling such an order then recomputed a fresh
-- theoretical reversal from the recipe, over-crediting stock far beyond what
-- was ever actually deducted. This migration links stock_logs to the order
-- that caused them and switches the logged delta to the REALIZED change
-- (new_qty - pre_qty), so cancellations can reverse exactly what happened.

ALTER TABLE stock_logs ADD COLUMN IF NOT EXISTS order_id uuid REFERENCES orders(id);
CREATE INDEX IF NOT EXISTS idx_stock_logs_order_id ON stock_logs(order_id);

DROP FUNCTION IF EXISTS apply_stock_change(jsonb, text, uuid);

CREATE OR REPLACE FUNCTION apply_stock_change(
  p_changes  jsonb,
  p_reason   text,
  p_user_id  uuid,
  p_order_id uuid DEFAULT NULL
) RETURNS jsonb AS $$
DECLARE
  c             jsonb;
  floored       jsonb := '[]'::jsonb;
  pre_qty       numeric;
  new_qty       numeric;
  delta_val     numeric;
  actual_delta  numeric;
  item_uuid     uuid;
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
    actual_delta := new_qty - pre_qty;

    UPDATE items
    SET quantity = new_qty
    WHERE id = item_uuid;

    -- Log the REALIZED delta, not the requested one — this is what makes
    -- exact reversal possible even when a floor occurred.
    INSERT INTO stock_logs (item_id, delta, reason, created_by, order_id)
    VALUES (item_uuid, actual_delta, p_reason, p_user_id, p_order_id);

    IF pre_qty + delta_val < 0 THEN
      floored := floored || jsonb_build_array(c->>'item_id');
    END IF;
  END LOOP;

  RETURN jsonb_build_object('floored', floored);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

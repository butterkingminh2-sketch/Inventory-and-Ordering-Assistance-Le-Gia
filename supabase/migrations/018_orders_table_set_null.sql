-- Deleting a table should be possible once it has no unfinished business
-- (no active/unpaid orders), without the FK blocking it just because some
-- old, fully-paid order still references it. Closed-out orders keep their
-- own record — they just lose the now-gone table's name — instead of the
-- delete failing outright.
ALTER TABLE orders DROP CONSTRAINT IF EXISTS fk_orders_table;
ALTER TABLE orders ADD CONSTRAINT fk_orders_table FOREIGN KEY (table_id) REFERENCES tables(id) ON DELETE SET NULL;

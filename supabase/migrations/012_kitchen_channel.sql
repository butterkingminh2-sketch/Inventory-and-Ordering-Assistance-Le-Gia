-- supabase/migrations/012_kitchen_channel.sql
-- Adds a third "kitchen" channel — like "public" (open to everyone except
-- owner, resets daily at the same 6 AM cutoff), but topic-separated from
-- the general shift chat. Reuses the exact same access rule as "public",
-- so the existing policy is broadened rather than duplicated.
ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_channel_check;
ALTER TABLE messages ADD CONSTRAINT messages_channel_check CHECK (channel IN ('public', 'owner', 'kitchen'));

DROP POLICY IF EXISTS public_channel_rw ON messages;
CREATE POLICY open_channel_rw ON messages FOR ALL USING (
  channel IN ('public', 'kitchen') AND branch_id = (SELECT branch_id FROM user_profiles WHERE id = auth.uid())
);

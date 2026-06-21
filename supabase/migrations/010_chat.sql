-- supabase/migrations/010_chat.sql
ALTER TABLE user_profiles DROP CONSTRAINT IF EXISTS user_profiles_role_check;
ALTER TABLE user_profiles ADD CONSTRAINT user_profiles_role_check
  CHECK (role IN ('foh', 'kitchen', 'manager', 'register', 'owner'));

CREATE TABLE IF NOT EXISTS messages (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id  uuid REFERENCES branches(id) NOT NULL,
  channel    text NOT NULL CHECK (channel IN ('public', 'owner')),
  sender_id  uuid REFERENCES auth.users(id) NOT NULL,
  body       text NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER PUBLICATION supabase_realtime ADD TABLE messages;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY public_channel_rw ON messages FOR ALL USING (
  channel = 'public' AND branch_id = (SELECT branch_id FROM user_profiles WHERE id = auth.uid())
);

CREATE POLICY owner_channel_rw ON messages FOR ALL USING (
  channel = 'owner' AND (
    (SELECT role FROM user_profiles WHERE id = auth.uid()) = 'owner'
    OR (
      (SELECT role FROM user_profiles WHERE id = auth.uid()) = 'manager'
      AND branch_id = (SELECT branch_id FROM user_profiles WHERE id = auth.uid())
    )
  )
);

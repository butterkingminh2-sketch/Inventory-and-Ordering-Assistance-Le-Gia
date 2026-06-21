-- supabase/migrations/011_fix_messages_sender_fk.sql
-- messages.sender_id referenced auth.users(id) directly, which PostgREST
-- cannot use to resolve the `sender:user_profiles(full_name, role)` embedded
-- join the chat UI relies on — auth.users isn't exposed to PostgREST, and a
-- shared-but-indirect link through it doesn't give PostgREST a usable FK
-- edge to user_profiles. user_profiles.id is the same UUID as auth.users.id
-- (it's a 1:1 extension table), so pointing the FK there instead loses
-- nothing and gives PostgREST the direct relationship it needs.
ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_sender_id_fkey;
ALTER TABLE messages
  ADD CONSTRAINT messages_sender_id_fkey
  FOREIGN KEY (sender_id) REFERENCES user_profiles(id);

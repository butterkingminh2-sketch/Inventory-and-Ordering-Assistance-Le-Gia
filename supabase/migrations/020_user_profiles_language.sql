ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS language text NOT NULL DEFAULT 'vi';

ALTER TABLE user_profiles
  ADD CONSTRAINT user_profiles_language_check CHECK (language IN ('vi', 'en'));

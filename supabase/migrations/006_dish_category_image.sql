-- supabase/migrations/006_dish_category_image.sql
ALTER TABLE dishes ADD COLUMN IF NOT EXISTS category text;
ALTER TABLE dishes ADD COLUMN IF NOT EXISTS image_url text;

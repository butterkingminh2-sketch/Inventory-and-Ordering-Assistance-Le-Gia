-- supabase/migrations/021_dish_images_bucket.sql
-- 006_dish_category_image.sql added the `dishes.image_url` column but never
-- created the Storage bucket it points at, so uploads from Settings have
-- been failing with "bucket not found" / RLS-denied since that feature shipped.
INSERT INTO storage.buckets (id, name, public)
VALUES ('dish-images', 'dish-images', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "dish_images_public_read" ON storage.objects;
CREATE POLICY "dish_images_public_read" ON storage.objects FOR SELECT
  USING (bucket_id = 'dish-images');

DROP POLICY IF EXISTS "dish_images_authenticated_write" ON storage.objects;
CREATE POLICY "dish_images_authenticated_write" ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'dish-images');

DROP POLICY IF EXISTS "dish_images_authenticated_update" ON storage.objects;
CREATE POLICY "dish_images_authenticated_update" ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'dish-images');

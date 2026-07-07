-- Supabase Storage: uploads bucket for all user-generated files.
-- Path structure: {userId}/{folder}/{uuid}.{ext}
-- Folders in use: avatars, banners, chat, dm, filebank, wallpapers, themes, boards

INSERT INTO storage.buckets (id, name, public)
VALUES ('uploads', 'uploads', true)
ON CONFLICT (id) DO NOTHING;

-- Drop policies first so migration is re-runnable
DROP POLICY IF EXISTS "uploads_read"   ON storage.objects;
DROP POLICY IF EXISTS "uploads_insert" ON storage.objects;
DROP POLICY IF EXISTS "uploads_delete" ON storage.objects;

-- Public bucket — anyone can read (images are shared social content)
CREATE POLICY "uploads_read" ON storage.objects
  FOR SELECT TO public
  USING (bucket_id = 'uploads');

-- Users may only upload to their own user-id folder
CREATE POLICY "uploads_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'uploads'
    AND split_part(name, '/', 1) = (auth.uid())::text
  );

-- Users may only delete their own files
CREATE POLICY "uploads_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'uploads'
    AND split_part(name, '/', 1) = (auth.uid())::text
  );

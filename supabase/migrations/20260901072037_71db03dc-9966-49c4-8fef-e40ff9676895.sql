CREATE POLICY "chat_images_select_admin" ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'chat-images'
  AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'moderator'))
);
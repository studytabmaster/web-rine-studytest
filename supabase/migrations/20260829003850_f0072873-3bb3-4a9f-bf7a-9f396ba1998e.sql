DROP POLICY IF EXISTS chat_images_select_participants ON storage.objects;
CREATE POLICY chat_images_select_participants ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'chat-images'
  AND (
    (storage.foldername(name))[1] = (auth.uid())::text
    OR EXISTS (
      SELECT 1 FROM public.messages m
      WHERE m.image_url = objects.name AND (m.sender_id = auth.uid() OR m.receiver_id = auth.uid())
    )
    OR EXISTS (
      SELECT 1 FROM public.group_messages gm
      WHERE gm.image_url = objects.name AND public.is_group_member(gm.group_id, auth.uid())
    )
  )
);
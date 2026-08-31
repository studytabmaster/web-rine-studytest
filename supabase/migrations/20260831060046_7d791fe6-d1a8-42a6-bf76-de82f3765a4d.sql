ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE public.group_messages ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

DROP POLICY IF EXISTS messages_update_sender_unsend ON public.messages;
CREATE POLICY messages_update_sender_unsend ON public.messages
  FOR UPDATE TO authenticated
  USING (auth.uid() = sender_id)
  WITH CHECK (auth.uid() = sender_id);

DROP POLICY IF EXISTS group_messages_update_sender_unsend ON public.group_messages;
CREATE POLICY group_messages_update_sender_unsend ON public.group_messages
  FOR UPDATE TO authenticated
  USING (sender_id = auth.uid())
  WITH CHECK (sender_id = auth.uid());

CREATE OR REPLACE FUNCTION public.create_group(_name text)
RETURNS public.groups
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me UUID := auth.uid();
  cleaned TEXT := btrim(coalesce(_name, ''));
  g public.groups;
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'ログインが必要です'; END IF;
  IF cleaned = '' THEN RAISE EXCEPTION 'グループ名を入力してください'; END IF;
  IF length(cleaned) > 40 THEN cleaned := left(cleaned, 40); END IF;

  INSERT INTO public.groups (name, owner_id) VALUES (cleaned, me) RETURNING * INTO g;
  INSERT INTO public.group_members (group_id, user_id) VALUES (g.id, me)
    ON CONFLICT DO NOTHING;
  RETURN g;
END;
$$;

REVOKE ALL ON FUNCTION public.create_group(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_group(text) TO authenticated;

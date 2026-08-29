CREATE TABLE public.groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL DEFAULT 'グループ',
  avatar_url TEXT,
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.group_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (group_id, user_id)
);

CREATE TABLE public.group_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content TEXT NOT NULL DEFAULT '',
  image_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_group_members_user ON public.group_members(user_id);
CREATE INDEX idx_group_messages_group ON public.group_messages(group_id, created_at);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.groups TO authenticated;
GRANT ALL ON public.groups TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.group_members TO authenticated;
GRANT ALL ON public.group_members TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.group_messages TO authenticated;
GRANT ALL ON public.group_messages TO service_role;

CREATE OR REPLACE FUNCTION public.is_group_member(_group_id UUID, _user_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.group_members WHERE group_id = _group_id AND user_id = _user_id)
$$;
REVOKE EXECUTE ON FUNCTION public.is_group_member(UUID, UUID) FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.is_group_owner(_group_id UUID, _user_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.groups WHERE id = _group_id AND owner_id = _user_id)
$$;
REVOKE EXECUTE ON FUNCTION public.is_group_owner(UUID, UUID) FROM anon, authenticated;

ALTER TABLE public.groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY groups_select_member ON public.groups FOR SELECT TO authenticated
  USING (owner_id = auth.uid() OR public.is_group_member(id, auth.uid()));
CREATE POLICY groups_insert_own ON public.groups FOR INSERT TO authenticated
  WITH CHECK (owner_id = auth.uid());
CREATE POLICY groups_update_owner ON public.groups FOR UPDATE TO authenticated
  USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE POLICY groups_delete_owner ON public.groups FOR DELETE TO authenticated
  USING (owner_id = auth.uid());

CREATE POLICY group_members_select ON public.group_members FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_group_member(group_id, auth.uid()) OR public.is_group_owner(group_id, auth.uid()));
CREATE POLICY group_members_insert ON public.group_members FOR INSERT TO authenticated
  WITH CHECK (
    public.is_group_owner(group_id, auth.uid())
    OR public.is_group_member(group_id, auth.uid())
  );
CREATE POLICY group_members_delete ON public.group_members FOR DELETE TO authenticated
  USING (public.is_group_owner(group_id, auth.uid()) OR user_id = auth.uid());

CREATE POLICY group_messages_select ON public.group_messages FOR SELECT TO authenticated
  USING (public.is_group_member(group_id, auth.uid()));
CREATE POLICY group_messages_insert ON public.group_messages FOR INSERT TO authenticated
  WITH CHECK (sender_id = auth.uid() AND public.is_group_member(group_id, auth.uid()));
CREATE POLICY group_messages_delete_own ON public.group_messages FOR DELETE TO authenticated
  USING (sender_id = auth.uid());

CREATE TRIGGER groups_updated_at BEFORE UPDATE ON public.groups
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
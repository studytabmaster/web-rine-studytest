CREATE TABLE public.user_bans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reason text NOT NULL DEFAULT '',
  banned_until timestamptz,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_bans TO authenticated;
GRANT ALL ON public.user_bans TO service_role;
ALTER TABLE public.user_bans ENABLE ROW LEVEL SECURITY;

CREATE POLICY user_bans_select_own_or_staff ON public.user_bans FOR SELECT TO authenticated
USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'moderator'));
CREATE POLICY user_bans_insert_admin ON public.user_bans FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY user_bans_update_admin ON public.user_bans FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY user_bans_delete_admin ON public.user_bans FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER user_bans_updated_at BEFORE UPDATE ON public.user_bans
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.user_warnings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  message text NOT NULL,
  acknowledged_at timestamptz,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_warnings TO authenticated;
GRANT ALL ON public.user_warnings TO service_role;
ALTER TABLE public.user_warnings ENABLE ROW LEVEL SECURITY;

CREATE POLICY user_warnings_select_own_or_staff ON public.user_warnings FOR SELECT TO authenticated
USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'moderator'));
CREATE POLICY user_warnings_insert_staff ON public.user_warnings FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'moderator'));
CREATE POLICY user_warnings_update_own_or_admin ON public.user_warnings FOR UPDATE TO authenticated
USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
WITH CHECK (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY user_warnings_delete_admin ON public.user_warnings FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX user_bans_user_idx ON public.user_bans(user_id);
CREATE INDEX user_warnings_user_idx ON public.user_warnings(user_id);

CREATE OR REPLACE FUNCTION public.is_banned(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_bans
    WHERE user_id = _user_id
      AND (banned_until IS NULL OR banned_until > now())
  )
$$;

REVOKE ALL ON FUNCTION public.is_banned(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.is_banned(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.reject_banned_sender()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF public.is_banned(NEW.sender_id) THEN
    RAISE EXCEPTION 'このアカウントは現在利用停止中です';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER messages_reject_banned BEFORE INSERT ON public.messages
FOR EACH ROW EXECUTE FUNCTION public.reject_banned_sender();

CREATE TRIGGER group_messages_reject_banned BEFORE INSERT ON public.group_messages
FOR EACH ROW EXECUTE FUNCTION public.reject_banned_sender();
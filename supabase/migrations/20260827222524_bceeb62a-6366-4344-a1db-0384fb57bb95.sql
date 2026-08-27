CREATE TABLE public.blocks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  blocker_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  blocked_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (blocker_id, blocked_id),
  CHECK (blocker_id <> blocked_id)
);

GRANT SELECT, INSERT, DELETE ON public.blocks TO authenticated;
GRANT ALL ON public.blocks TO service_role;
ALTER TABLE public.blocks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "blocks_select_own" ON public.blocks FOR SELECT TO authenticated
  USING (auth.uid() = blocker_id);
CREATE POLICY "blocks_insert_own" ON public.blocks FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = blocker_id);
CREATE POLICY "blocks_delete_own" ON public.blocks FOR DELETE TO authenticated
  USING (auth.uid() = blocker_id);

CREATE TABLE public.reports (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  reporter_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reported_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.reports TO authenticated;
GRANT ALL ON public.reports TO service_role;
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "reports_select_own" ON public.reports FOR SELECT TO authenticated
  USING (auth.uid() = reporter_id);
CREATE POLICY "reports_insert_own" ON public.reports FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = reporter_id AND reporter_id <> reported_id);

CREATE OR REPLACE FUNCTION public.is_blocked_pair(_a UUID, _b UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.blocks
    WHERE (blocker_id = _a AND blocked_id = _b)
       OR (blocker_id = _b AND blocked_id = _a)
  )
$$;

DROP POLICY IF EXISTS "messages_insert_own" ON public.messages;
CREATE POLICY "messages_insert_own" ON public.messages FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = sender_id AND NOT public.is_blocked_pair(sender_id, receiver_id));

DROP POLICY IF EXISTS "call_signals_insert" ON public.call_signals;
CREATE POLICY "call_signals_insert" ON public.call_signals FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = from_user AND NOT public.is_blocked_pair(from_user, to_user));

ALTER PUBLICATION supabase_realtime ADD TABLE public.blocks;
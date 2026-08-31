ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS media_type text NOT NULL DEFAULT 'image';
ALTER TABLE public.group_messages ADD COLUMN IF NOT EXISTS media_type text NOT NULL DEFAULT 'image';

CREATE TABLE IF NOT EXISTS public.group_reads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  last_read_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (group_id, user_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.group_reads TO authenticated;
GRANT ALL ON public.group_reads TO service_role;

ALTER TABLE public.group_reads ENABLE ROW LEVEL SECURITY;

CREATE POLICY group_reads_select_member ON public.group_reads
  FOR SELECT TO authenticated
  USING (public.is_group_member(group_id, auth.uid()));

CREATE POLICY group_reads_insert_own ON public.group_reads
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND public.is_group_member(group_id, auth.uid()));

CREATE POLICY group_reads_update_own ON public.group_reads
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE TRIGGER group_reads_updated_at BEFORE UPDATE ON public.group_reads
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
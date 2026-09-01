GRANT EXECUTE ON FUNCTION public.is_group_member(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_group_owner(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_blocked_pair(uuid, uuid) TO authenticated;

ALTER TABLE public.reports
  ADD COLUMN IF NOT EXISTS evidence_url TEXT,
  ADD COLUMN IF NOT EXISTS evidence_type TEXT,
  ADD COLUMN IF NOT EXISTS message_id UUID,
  ADD COLUMN IF NOT EXISTS message_content TEXT;
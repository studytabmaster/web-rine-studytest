DROP POLICY IF EXISTS "messages_insert_own" ON public.messages;
CREATE POLICY "messages_insert_own" ON public.messages FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = sender_id);

DROP POLICY IF EXISTS "call_signals_insert" ON public.call_signals;
CREATE POLICY "call_signals_insert" ON public.call_signals FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = from_user);

REVOKE ALL ON FUNCTION public.is_blocked_pair(UUID, UUID) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.reject_blocked_message()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.is_blocked_pair(NEW.sender_id, NEW.receiver_id) THEN
    RAISE EXCEPTION 'ブロック中の相手には送信できません';
  END IF;
  RETURN NEW;
END; $$;

REVOKE ALL ON FUNCTION public.reject_blocked_message() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER messages_block_guard
BEFORE INSERT ON public.messages
FOR EACH ROW EXECUTE FUNCTION public.reject_blocked_message();

CREATE OR REPLACE FUNCTION public.reject_blocked_signal()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.is_blocked_pair(NEW.from_user, NEW.to_user) THEN
    RAISE EXCEPTION 'ブロック中の相手には発信できません';
  END IF;
  RETURN NEW;
END; $$;

REVOKE ALL ON FUNCTION public.reject_blocked_signal() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER call_signals_block_guard
BEFORE INSERT ON public.call_signals
FOR EACH ROW EXECUTE FUNCTION public.reject_blocked_signal();
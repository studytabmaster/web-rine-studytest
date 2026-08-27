ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS image_url TEXT;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS read_at TIMESTAMP WITH TIME ZONE;

ALTER TABLE public.messages ALTER COLUMN content SET DEFAULT '';

CREATE POLICY "messages_update_read_receiver" ON public.messages
FOR UPDATE TO authenticated
USING (auth.uid() = receiver_id)
WITH CHECK (auth.uid() = receiver_id);

CREATE OR REPLACE FUNCTION public.protect_friend_code()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.friend_code IS DISTINCT FROM OLD.friend_code THEN
    NEW.friend_code := OLD.friend_code;
  END IF;
  NEW.id := OLD.id;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS profiles_protect_friend_code ON public.profiles;
CREATE TRIGGER profiles_protect_friend_code
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.protect_friend_code();

ALTER TABLE public.messages REPLICA IDENTITY FULL;
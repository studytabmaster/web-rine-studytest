
-- profiles
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  display_name TEXT NOT NULL DEFAULT 'ユーザー',
  status_message TEXT NOT NULL DEFAULT '',
  avatar_url TEXT,
  friend_code TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles_select_auth" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "profiles_insert_own" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
CREATE POLICY "profiles_update_own" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- friendships (両方向に1行ずつ)
CREATE TABLE public.friendships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  friend_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, friend_id)
);
GRANT SELECT, DELETE ON public.friendships TO authenticated;
GRANT ALL ON public.friendships TO service_role;
ALTER TABLE public.friendships ENABLE ROW LEVEL SECURITY;
CREATE POLICY "friendships_select_own" ON public.friendships FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "friendships_delete_own" ON public.friendships FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- messages
CREATE TABLE public.messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id UUID NOT NULL,
  receiver_id UUID NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX messages_pair_idx ON public.messages (sender_id, receiver_id, created_at);
GRANT SELECT, INSERT, DELETE ON public.messages TO authenticated;
GRANT ALL ON public.messages TO service_role;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "messages_select_participant" ON public.messages FOR SELECT TO authenticated
  USING (auth.uid() = sender_id OR auth.uid() = receiver_id);
CREATE POLICY "messages_insert_own" ON public.messages FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = sender_id);
CREATE POLICY "messages_delete_own" ON public.messages FOR DELETE TO authenticated
  USING (auth.uid() = sender_id);

-- call signaling
CREATE TABLE public.call_signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_user UUID NOT NULL,
  to_user UUID NOT NULL,
  kind TEXT NOT NULL,
  payload JSONB,
  video BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX call_signals_to_idx ON public.call_signals (to_user, created_at);
GRANT SELECT, INSERT, DELETE ON public.call_signals TO authenticated;
GRANT ALL ON public.call_signals TO service_role;
ALTER TABLE public.call_signals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "call_signals_select" ON public.call_signals FOR SELECT TO authenticated
  USING (auth.uid() = to_user OR auth.uid() = from_user);
CREATE POLICY "call_signals_insert" ON public.call_signals FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = from_user);
CREATE POLICY "call_signals_delete" ON public.call_signals FOR DELETE TO authenticated
  USING (auth.uid() = to_user OR auth.uid() = from_user);

-- updated_at
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;
CREATE TRIGGER profiles_updated_at BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- friend code generator
CREATE OR REPLACE FUNCTION public.generate_friend_code()
RETURNS TEXT LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  chars TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  code TEXT;
  i INT;
BEGIN
  LOOP
    code := '';
    FOR i IN 1..8 LOOP
      code := code || substr(chars, 1 + floor(random() * length(chars))::int, 1);
    END LOOP;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.friend_code = code);
  END LOOP;
  RETURN code;
END; $$;

-- new user -> profile
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name, friend_code)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'display_name', NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1), 'ユーザー'),
    public.generate_friend_code()
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END; $$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- add friend by code
CREATE OR REPLACE FUNCTION public.add_friend_by_code(_code TEXT)
RETURNS public.profiles LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  target public.profiles;
  me UUID := auth.uid();
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'ログインが必要です'; END IF;
  SELECT * INTO target FROM public.profiles WHERE upper(friend_code) = upper(trim(_code));
  IF target.id IS NULL THEN RAISE EXCEPTION 'このIDのユーザーは見つかりません'; END IF;
  IF target.id = me THEN RAISE EXCEPTION '自分自身は追加できません'; END IF;
  INSERT INTO public.friendships (user_id, friend_id) VALUES (me, target.id) ON CONFLICT DO NOTHING;
  INSERT INTO public.friendships (user_id, friend_id) VALUES (target.id, me) ON CONFLICT DO NOTHING;
  RETURN target;
END; $$;

ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.call_signals;
ALTER PUBLICATION supabase_realtime ADD TABLE public.friendships;

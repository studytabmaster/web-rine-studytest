CREATE TABLE public.call_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  caller_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  callee_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  video boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'missed',
  duration_seconds integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.call_logs TO authenticated;
GRANT ALL ON public.call_logs TO service_role;
ALTER TABLE public.call_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY call_logs_select_participant ON public.call_logs FOR SELECT TO authenticated USING (auth.uid() = caller_id OR auth.uid() = callee_id);
CREATE POLICY call_logs_insert_caller ON public.call_logs FOR INSERT TO authenticated WITH CHECK (auth.uid() = caller_id);
ALTER PUBLICATION supabase_realtime ADD TABLE public.call_logs;
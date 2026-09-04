REVOKE ALL ON FUNCTION public.is_banned(uuid) FROM authenticated, anon, public;
GRANT EXECUTE ON FUNCTION public.is_banned(uuid) TO service_role;
REVOKE ALL ON FUNCTION public.reject_banned_sender() FROM authenticated, anon, public;
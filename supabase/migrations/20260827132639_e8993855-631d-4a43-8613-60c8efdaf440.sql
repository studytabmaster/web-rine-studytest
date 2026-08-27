
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.add_friend_by_code(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.add_friend_by_code(TEXT) TO authenticated;

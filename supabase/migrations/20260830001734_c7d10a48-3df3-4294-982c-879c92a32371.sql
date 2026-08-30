-- Trigger/helper functions must not be callable via the API
REVOKE EXECUTE ON FUNCTION public.enforce_profile_identity() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.normalize_display_name() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.reject_blocked_message() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.reject_blocked_signal() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_blocked_pair(uuid, uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.generate_friend_code() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.protect_friend_code() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_updated_at() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_group_member(uuid, uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_group_owner(uuid, uuid) FROM anon, authenticated;
-- Keep add_friend_by_code available to signed-in users only
REVOKE EXECUTE ON FUNCTION public.add_friend_by_code(text) FROM anon;
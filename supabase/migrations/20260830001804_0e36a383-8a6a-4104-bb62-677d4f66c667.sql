REVOKE EXECUTE ON FUNCTION public.enforce_profile_identity() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.normalize_display_name() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.reject_blocked_message() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.reject_blocked_signal() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_blocked_pair(uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.generate_friend_code() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.protect_friend_code() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.set_updated_at() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_group_member(uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_group_owner(uuid, uuid) FROM PUBLIC;
-- add_friend_by_code stays callable by signed-in users only
REVOKE EXECUTE ON FUNCTION public.add_friend_by_code(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.add_friend_by_code(text) TO authenticated;
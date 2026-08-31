-- trigger-only functions: not callable through the API at all
REVOKE ALL ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.normalize_display_name() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.protect_friend_code() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_profile_identity() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reject_blocked_message() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reject_blocked_signal() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.generate_friend_code() FROM PUBLIC, anon, authenticated;

-- helper predicates used inside RLS policies (SECURITY DEFINER runs as owner; no direct API access needed)
REVOKE ALL ON FUNCTION public.is_group_member(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.is_group_owner(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.is_blocked_pair(uuid, uuid) FROM PUBLIC, anon, authenticated;

-- app-facing functions: signed-in users only
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
REVOKE ALL ON FUNCTION public.add_friend_by_code(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.add_friend_by_code(text) TO authenticated;
REVOKE ALL ON FUNCTION public.create_group(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_group(text) TO authenticated;

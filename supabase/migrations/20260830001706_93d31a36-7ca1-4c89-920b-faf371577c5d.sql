-- Force system-generated friend codes and correct owner on profile insert
CREATE OR REPLACE FUNCTION public.enforce_profile_identity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- friend_code is always system-assigned, never client-chosen
  NEW.friend_code := public.generate_friend_code();

  -- profile row must belong to the calling user when called from the API
  IF auth.uid() IS NOT NULL THEN
    NEW.id := auth.uid();
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_enforce_identity ON public.profiles;
CREATE TRIGGER profiles_enforce_identity
BEFORE INSERT ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.enforce_profile_identity();

-- Normalize display names to block invisible-character impersonation
CREATE OR REPLACE FUNCTION public.normalize_display_name()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  cleaned TEXT;
BEGIN
  cleaned := NEW.display_name;
  -- strip zero-width / invisible formatting characters
  cleaned := regexp_replace(cleaned, '[\u200B-\u200F\u202A-\u202E\u2060\uFEFF]', '', 'g');
  cleaned := btrim(cleaned);
  IF cleaned = '' THEN
    cleaned := 'ユーザー';
  END IF;
  NEW.display_name := cleaned;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_normalize_display_name ON public.profiles;
CREATE TRIGGER profiles_normalize_display_name
BEFORE INSERT OR UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.normalize_display_name();
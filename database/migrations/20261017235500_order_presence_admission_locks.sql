-- Presence must acquire the tribe fence before UPDATE locks its membership row.
-- Admission writers retain the same tribe -> reviewer order and all source guards.
-- CREATE OR REPLACE preserves the existing function identity, owner and EXECUTE ACL.
CREATE OR REPLACE FUNCTION public.touch_tribe_member_presence(target_tribe_slug text)
RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = pg_catalog,public
AS $$
DECLARE
  native_actor_id text := public.current_app_user_id();
  locked_tribe_id uuid;
BEGIN
  IF native_actor_id IS NULL THEN RETURN false; END IF;

  SELECT tribe.id INTO locked_tribe_id
    FROM public.tribes tribe
    WHERE tribe.slug=target_tribe_slug
    FOR SHARE;
  IF NOT FOUND THEN RETURN false; END IF;

  UPDATE public.tribe_members
    SET last_seen_at=timezone('utc',now())
    WHERE tribe_id=locked_tribe_id
      AND user_id=native_actor_id
      AND status IN ('active','muted');
  RETURN FOUND;
END;
$$;

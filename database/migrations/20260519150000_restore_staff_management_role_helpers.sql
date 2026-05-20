CREATE OR REPLACE FUNCTION public.can_manage_tribe_channels(target_tribe_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.tribe_members
    WHERE tribe_members.tribe_id = target_tribe_id
      AND tribe_members.user_id = public.current_app_user_id()
      AND tribe_members.status = 'active'
      AND tribe_members.role IN ('leader', 'guardian')
  );
$$;

CREATE OR REPLACE FUNCTION public.can_manage_tribe_events(target_tribe_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.tribe_members
    WHERE tribe_members.tribe_id = target_tribe_id
      AND tribe_members.user_id = public.current_app_user_id()
      AND tribe_members.status = 'active'
      AND tribe_members.role IN ('leader', 'guardian')
  );
$$;

CREATE OR REPLACE FUNCTION public.can_pin_tribe_messages(target_tribe_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.tribe_members
    WHERE tribe_members.tribe_id = target_tribe_id
      AND tribe_members.user_id = public.current_app_user_id()
      AND tribe_members.status = 'active'
      AND tribe_members.role IN ('leader', 'guardian')
  );
$$;

GRANT EXECUTE ON FUNCTION public.can_manage_tribe_channels(uuid)
TO public;

GRANT EXECUTE ON FUNCTION public.can_manage_tribe_events(uuid)
TO public;

GRANT EXECUTE ON FUNCTION public.can_pin_tribe_messages(uuid)
TO public;

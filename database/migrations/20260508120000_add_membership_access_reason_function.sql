CREATE OR REPLACE FUNCTION public.get_current_tribe_membership_by_slug(
  target_slug text
)
RETURNS TABLE(status text, status_reason text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT tribe_members.status, tribe_members.status_reason
  FROM public.tribe_members
  INNER JOIN public.tribes
    ON tribes.id = tribe_members.tribe_id
  WHERE tribes.slug = lower(trim(target_slug))
    AND tribe_members.user_id = public.current_app_user_id()
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_current_tribe_membership_by_slug(text)
TO public;

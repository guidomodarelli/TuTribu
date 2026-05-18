CREATE OR REPLACE FUNCTION public.get_current_tribe_membership_by_slug(
  target_slug text
)
RETURNS TABLE(status text, status_reason text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH target_tribe AS (
    SELECT tribes.id
    FROM public.tribes
    WHERE tribes.slug = lower(trim(target_slug))
    LIMIT 1
  ),
  current_membership AS (
    SELECT tribe_members.status, tribe_members.status_reason
    FROM public.tribe_members
    INNER JOIN target_tribe
      ON target_tribe.id = tribe_members.tribe_id
    WHERE tribe_members.user_id = public.current_app_user_id()
    LIMIT 1
  )
  SELECT 'owner_read', 'none'
  WHERE public.is_app_owner()
    AND EXISTS (SELECT 1 FROM target_tribe)
  UNION ALL
  SELECT current_membership.status, current_membership.status_reason
  FROM current_membership
  WHERE NOT public.is_app_owner()
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_current_tribe_membership_by_slug(text)
TO public;

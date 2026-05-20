CREATE OR REPLACE FUNCTION public.list_visible_membership_tribes()
RETURNS TABLE(
  tribe_id uuid,
  name text,
  slug text,
  role text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH active_memberships AS (
    SELECT
      tribes.id AS tribe_id,
      tribes.name,
      tribes.slug,
      tribe_members.role
    FROM public.tribes
    INNER JOIN public.tribe_members
      ON tribe_members.tribe_id = tribes.id
    WHERE tribe_members.user_id = public.current_app_user_id()
      AND tribe_members.status IN ('active', 'muted')
  )
  SELECT
    active_memberships.tribe_id,
    active_memberships.name,
    active_memberships.slug,
    active_memberships.role
  FROM active_memberships
  UNION ALL
  SELECT
    tribes.id AS tribe_id,
    tribes.name,
    tribes.slug,
    'tribemate' AS role
  FROM public.tribes
  WHERE public.is_app_owner()
    AND NOT EXISTS (
      SELECT 1
      FROM active_memberships
      WHERE active_memberships.tribe_id = tribes.id
    );
$$;

GRANT EXECUTE ON FUNCTION public.list_visible_membership_tribes()
TO public;

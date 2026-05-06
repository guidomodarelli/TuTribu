CREATE OR REPLACE FUNCTION public.list_visible_tribe_members_by_slug(
  target_slug text
)
RETURNS TABLE (
  member_id text,
  role text,
  name text,
  image text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    tribe_members.user_id AS member_id,
    tribe_members.role,
    "user".name,
    "user".image
  FROM public.tribes
  INNER JOIN public.tribe_members
    ON tribe_members.tribe_id = tribes.id
  INNER JOIN public."user"
    ON "user".id = tribe_members.user_id
  WHERE tribes.slug = lower(trim(target_slug))
    AND tribe_members.status IN ('active', 'muted')
    AND EXISTS (
      SELECT 1
      FROM public.tribe_members AS viewer_membership
      WHERE viewer_membership.tribe_id = tribes.id
        AND viewer_membership.user_id = public.current_app_user_id()
        AND viewer_membership.status IN ('active', 'muted')
    )
  ORDER BY
    CASE tribe_members.role
      WHEN 'leader' THEN 1
      WHEN 'guardian' THEN 2
      ELSE 3
    END,
    "user".name ASC;
$$;

GRANT EXECUTE ON FUNCTION public.list_visible_tribe_members_by_slug(text)
TO public;

-- Expose whether each visible tribe member joined through a free invitation.
-- The flag is sensitive management information, so it is disclosed only to an
-- active tribe leader; every other viewer receives FALSE. This mirrors the
-- email-visibility gating already enforced by this SECURITY DEFINER function.

DROP FUNCTION IF EXISTS public.list_visible_tribe_members_by_slug(text);

CREATE OR REPLACE FUNCTION public.list_visible_tribe_members_by_slug(
  target_slug text
)
RETURNS TABLE (
  member_id text,
  role text,
  name text,
  email text,
  image text,
  joined_free boolean
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH viewer AS (
    SELECT
      viewer_membership.tribe_id,
      viewer_membership.role,
      viewer_membership.status
    FROM public.tribes AS viewer_tribe
    INNER JOIN public.tribe_members AS viewer_membership
      ON viewer_membership.tribe_id = viewer_tribe.id
    WHERE viewer_tribe.slug = lower(trim(target_slug))
      AND viewer_membership.user_id = public.current_app_user_id()
      AND viewer_membership.status IN ('active', 'muted')
    LIMIT 1
  )
  SELECT
    tribe_members.user_id AS member_id,
    tribe_members.role,
    "user".name,
    CASE
      WHEN (SELECT viewer.role FROM viewer) IN ('leader', 'guardian')
        AND (SELECT viewer.status FROM viewer) = 'active'
        THEN "user".email
      ELSE NULL
    END AS email,
    "user".image,
    CASE
      WHEN (SELECT viewer.role FROM viewer) = 'leader'
        AND (SELECT viewer.status FROM viewer) = 'active'
        THEN tribe_members.joined_via = 'free_invitation'
      ELSE FALSE
    END AS joined_free
  FROM public.tribes
  INNER JOIN public.tribe_members
    ON tribe_members.tribe_id = tribes.id
  INNER JOIN public."user"
    ON "user".id = tribe_members.user_id
  WHERE tribes.slug = lower(trim(target_slug))
    AND tribe_members.status IN ('active', 'muted')
    AND EXISTS (SELECT 1 FROM viewer)
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

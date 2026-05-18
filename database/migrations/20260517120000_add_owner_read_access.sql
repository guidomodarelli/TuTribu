CREATE OR REPLACE FUNCTION public.current_app_owner_email()
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT lower(trim(coalesce(nullif(current_setting('app.owner_email', true), ''), '')));
$$;

CREATE OR REPLACE FUNCTION public.is_app_owner()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT public.current_app_owner_email() <> ''
    AND public.current_app_user_email() = public.current_app_owner_email();
$$;

DROP POLICY IF EXISTS "Tribemates can read own tribes"
ON public.tribes;

DROP POLICY IF EXISTS "Tribemates and owner can read tribes"
ON public.tribes;

CREATE POLICY "Tribemates and owner can read tribes"
ON public.tribes
FOR SELECT
USING (
  public.is_app_owner()
  OR EXISTS (
    SELECT 1
    FROM public.tribe_members
    WHERE tribe_members.tribe_id = tribes.id
      AND tribe_members.user_id = public.current_app_user_id()
      AND tribe_members.status IN ('active', 'muted')
  )
);

CREATE OR REPLACE FUNCTION public.can_read_tribe_content(target_tribe_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT public.is_app_owner()
    OR EXISTS (
      SELECT 1
      FROM public.tribe_members
      WHERE tribe_members.tribe_id = target_tribe_id
        AND tribe_members.user_id = public.current_app_user_id()
        AND tribe_members.status IN ('active', 'muted')
    );
$$;

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
  SELECT current_membership.status, current_membership.status_reason
  FROM current_membership
  UNION ALL
  SELECT 'owner_read', 'none'
  WHERE public.is_app_owner()
    AND EXISTS (SELECT 1 FROM target_tribe)
    AND NOT EXISTS (SELECT 1 FROM current_membership)
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_current_tribe_membership_by_slug(text)
TO public;

DROP FUNCTION IF EXISTS public.list_visible_tribe_members_by_slug(text);

CREATE OR REPLACE FUNCTION public.list_visible_tribe_members_by_slug(
  target_slug text
)
RETURNS TABLE (
  member_id text,
  role text,
  name text,
  email text,
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
    "user".email,
    "user".image
  FROM public.tribes
  INNER JOIN public.tribe_members
    ON tribe_members.tribe_id = tribes.id
  INNER JOIN public."user"
    ON "user".id = tribe_members.user_id
  WHERE tribes.slug = lower(trim(target_slug))
    AND tribe_members.status IN ('active', 'muted')
    AND (
      public.is_app_owner()
      OR EXISTS (
        SELECT 1
        FROM public.tribe_members AS viewer_membership
        WHERE viewer_membership.tribe_id = tribes.id
          AND viewer_membership.user_id = public.current_app_user_id()
          AND viewer_membership.status IN ('active', 'muted')
      )
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

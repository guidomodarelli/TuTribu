CREATE OR REPLACE FUNCTION public.create_private_community_with_owner_membership(
  target_name text,
  target_slug text,
  target_owner_id uuid
)
RETURNS public.communities
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  created_community public.communities;
BEGIN
  IF target_slug IS NULL
    OR target_slug <> lower(target_slug)
    OR target_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
  THEN
    RAISE EXCEPTION 'Community slug must use lowercase letters, numbers, and hyphens only.'
      USING ERRCODE = '23514';
  END IF;

  INSERT INTO public.communities (
    created_by,
    name,
    slug,
    visibility
  )
  VALUES (
    target_owner_id,
    target_name,
    target_slug,
    'private'
  )
  RETURNING * INTO created_community;

  INSERT INTO public.community_members (
    community_id,
    role,
    status,
    user_id
  )
  VALUES (
    created_community.id,
    'owner',
    'active',
    target_owner_id
  );

  RETURN created_community;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_private_community_with_owner_membership(
  text,
  text,
  uuid
)
TO authenticated;

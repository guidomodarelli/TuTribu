CREATE OR REPLACE FUNCTION public.is_community_slug_taken(target_slug text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    EXISTS (
      SELECT 1
      FROM public.community_creator_whitelist
      WHERE community_creator_whitelist.email = lower(coalesce(auth.jwt() ->> 'email', ''))
    )
    AND EXISTS (
      SELECT 1
      FROM public.communities
      WHERE communities.slug = lower(trim(target_slug))
    );
$$;

GRANT EXECUTE ON FUNCTION public.is_community_slug_taken(text)
TO authenticated;

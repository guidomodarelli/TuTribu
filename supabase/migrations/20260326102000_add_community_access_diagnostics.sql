CREATE OR REPLACE FUNCTION public.get_current_community_membership_status_by_slug(
  target_slug text
)
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT community_members.status
  FROM public.community_members
  INNER JOIN public.communities
    ON communities.id = community_members.community_id
  WHERE communities.slug = lower(trim(target_slug))
    AND community_members.user_id = auth.uid()
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_current_community_membership_status_by_slug(text)
TO authenticated;

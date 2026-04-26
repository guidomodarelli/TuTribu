CREATE OR REPLACE FUNCTION public.can_manage_community_categories(target_community_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.community_members
    WHERE community_members.community_id = target_community_id
      AND community_members.user_id = public.current_app_user_id()
      AND community_members.status = 'active'
      AND community_members.role IN ('owner', 'admin')
  );
$$;

DROP POLICY IF EXISTS "Owners and admins can manage community post categories"
ON public.community_post_categories;

DROP POLICY IF EXISTS "Owners can manage community post categories"
ON public.community_post_categories;

DROP POLICY IF EXISTS "Owners and admins can move posts between categories"
ON public.posts;

CREATE POLICY "Owners and admins can manage community post categories"
ON public.community_post_categories
FOR ALL
USING (
  public.can_manage_community_categories(community_id)
)
WITH CHECK (
  public.can_manage_community_categories(community_id)
);

CREATE POLICY "Owners and admins can move posts between categories"
ON public.posts
FOR UPDATE
USING (
  public.can_manage_community_categories(community_id)
)
WITH CHECK (
  public.can_manage_community_categories(community_id)
);

CREATE OR REPLACE FUNCTION public.can_manage_tribe_categories(target_tribe_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.tribe_members
    WHERE tribe_members.tribe_id = target_tribe_id
      AND tribe_members.user_id = public.current_app_user_id()
      AND tribe_members.status = 'active'
      AND tribe_members.role IN ('owner', 'admin')
  );
$$;

DROP POLICY IF EXISTS "Owners and admins can manage tribe post categories"
ON public.tribe_post_categories;

DROP POLICY IF EXISTS "Owners can manage tribe post categories"
ON public.tribe_post_categories;

DROP POLICY IF EXISTS "Owners and admins can move posts between categories"
ON public.posts;

CREATE POLICY "Owners and admins can manage tribe post categories"
ON public.tribe_post_categories
FOR ALL
USING (
  public.can_manage_tribe_categories(tribe_id)
)
WITH CHECK (
  public.can_manage_tribe_categories(tribe_id)
);

CREATE POLICY "Owners and admins can move posts between categories"
ON public.posts
FOR UPDATE
USING (
  public.can_manage_tribe_categories(tribe_id)
)
WITH CHECK (
  public.can_manage_tribe_categories(tribe_id)
);

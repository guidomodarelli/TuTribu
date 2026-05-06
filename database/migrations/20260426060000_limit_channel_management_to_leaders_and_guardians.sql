CREATE OR REPLACE FUNCTION public.can_manage_tribe_channels(target_tribe_id uuid)
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
      AND tribe_members.role IN ('leader', 'guardian')
  );
$$;

DROP POLICY IF EXISTS "Leaders and guardians can manage tribe channels"
ON public.tribe_channels;

DROP POLICY IF EXISTS "Leaders can manage tribe channels"
ON public.tribe_channels;

DROP POLICY IF EXISTS "Leaders and guardians can move messages between channels"
ON public.messages;

CREATE POLICY "Leaders and guardians can manage tribe channels"
ON public.tribe_channels
FOR ALL
USING (
  public.can_manage_tribe_channels(tribe_id)
)
WITH CHECK (
  public.can_manage_tribe_channels(tribe_id)
);

CREATE POLICY "Leaders and guardians can move messages between channels"
ON public.messages
FOR UPDATE
USING (
  public.can_manage_tribe_channels(tribe_id)
)
WITH CHECK (
  public.can_manage_tribe_channels(tribe_id)
);

CREATE OR REPLACE FUNCTION public.is_tribe_leader(target_tribe_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.tribe_members
    WHERE tribe_members.tribe_id = target_tribe_id
      AND tribe_members.user_id = public.current_app_user_id()
      AND tribe_members.role = 'leader'
      AND tribe_members.status = 'active'
  );
$$;

DROP POLICY IF EXISTS "Leaders can update tribe messages"
ON public.messages;

CREATE POLICY "Leaders can update tribe messages"
ON public.messages
FOR UPDATE
USING (
  public.is_tribe_leader(tribe_id)
)
WITH CHECK (
  public.is_tribe_leader(tribe_id)
);

ALTER TABLE public.tribe_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tribe_invitations FORCE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.can_manage_tribe_invitations(
  target_tribe_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
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

DROP POLICY IF EXISTS "Authenticated users can read invited tribe by token"
ON public.tribes;

CREATE POLICY "Authenticated users can read invited tribe by token"
ON public.tribes
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.tribe_invitations
    WHERE tribe_invitations.tribe_id = tribes.id
      AND tribe_invitations.status = 'active'
      AND tribe_invitations.token_hash = current_setting(
        'app.current_invitation_hash',
        true
      )
  )
);

DROP POLICY IF EXISTS "Invitation managers can read active invitations"
ON public.tribe_invitations;

CREATE POLICY "Invitation managers can read active invitations"
ON public.tribe_invitations
FOR SELECT
USING (
  status = 'active'
  AND public.can_manage_tribe_invitations(tribe_id)
);

DROP POLICY IF EXISTS "Authenticated users can read invitation by token"
ON public.tribe_invitations;

DROP POLICY IF EXISTS "Authenticated users can read active invitation by token"
ON public.tribe_invitations;

CREATE POLICY "Authenticated users can read invitation by token"
ON public.tribe_invitations
FOR SELECT
USING (
  status IN ('active', 'revoked')
  AND token_hash = current_setting(
    'app.current_invitation_hash',
    true
  )
);

DROP POLICY IF EXISTS "Invitation managers can create invitations"
ON public.tribe_invitations;

CREATE POLICY "Invitation managers can create invitations"
ON public.tribe_invitations
FOR INSERT
WITH CHECK (
  created_by = public.current_app_user_id()
  AND status = 'active'
  AND public.can_manage_tribe_invitations(tribe_id)
);

DROP POLICY IF EXISTS "Invitation managers can revoke invitations"
ON public.tribe_invitations;

CREATE POLICY "Invitation managers can revoke invitations"
ON public.tribe_invitations
FOR UPDATE
USING (public.can_manage_tribe_invitations(tribe_id))
WITH CHECK (
  status = 'revoked'
  AND public.can_manage_tribe_invitations(tribe_id)
);

DROP POLICY IF EXISTS "Authenticated users can accept active invitations"
ON public.tribe_members;

CREATE POLICY "Authenticated users can accept active invitations"
ON public.tribe_members
FOR INSERT
WITH CHECK (
  user_id = public.current_app_user_id()
  AND role = 'tribemate'
  AND status = 'active'
  AND EXISTS (
    SELECT 1
    FROM public.tribe_invitations
    WHERE tribe_invitations.tribe_id = tribe_members.tribe_id
      AND tribe_invitations.status = 'active'
      AND tribe_invitations.token_hash = current_setting(
        'app.current_invitation_hash',
        true
      )
  )
);

GRANT EXECUTE ON FUNCTION public.can_manage_tribe_invitations(uuid)
TO public;

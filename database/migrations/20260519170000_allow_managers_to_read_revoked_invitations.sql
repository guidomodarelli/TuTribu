DROP POLICY IF EXISTS "Invitation managers can read active invitations"
ON public.tribe_invitations;

DROP POLICY IF EXISTS "Invitation managers can read managed invitations"
ON public.tribe_invitations;

CREATE POLICY "Invitation managers can read managed invitations"
ON public.tribe_invitations
FOR SELECT
USING (
  status IN ('active', 'revoked')
  AND public.can_manage_tribe_invitations(tribe_id)
);

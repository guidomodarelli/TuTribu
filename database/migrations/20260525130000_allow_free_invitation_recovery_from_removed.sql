DROP POLICY IF EXISTS "Authenticated users can activate own free invitation membership"
ON public.tribe_members;

DROP POLICY IF EXISTS "Authenticated users can activate own free invitation memberships"
ON public.tribe_members;

CREATE POLICY "Authenticated users can activate own free invitation memberships"
ON public.tribe_members
FOR UPDATE
USING (
  user_id = public.current_app_user_id()
  AND (
    (
      status = 'blocked'
      AND status_reason = 'payment_blocked'
    )
    OR (
      status = 'removed'
      AND status_reason = 'subscription_inactive'
    )
  )
)
WITH CHECK (
  user_id = public.current_app_user_id()
  AND role = 'tribemate'
  AND status = 'active'
  AND status_reason = 'none'
  AND joined_via = 'free_invitation'
  AND EXISTS (
    SELECT 1
    FROM public.tribes
    INNER JOIN public.tribe_invitations
      ON tribe_invitations.tribe_id = tribes.id
    WHERE tribes.id = tribe_members.tribe_id
      AND tribe_invitations.status = 'active'
      AND tribe_invitations.token_hash = nullif(
        current_setting('app.current_invitation_hash', true),
        ''
      )
      AND (
        tribe_invitations.subscription_association_type = 'free'
        OR (
          tribe_invitations.subscription_association_type = 'current'
          AND tribes.free_join_is_current = true
        )
      )
  )
);

-- Open join attribution update: let a tokenless, non-member visitor's pending
-- (payment-blocked) membership pass the UPDATE RLS check during open-join
-- checkout, without depending on the recover-retry policy's coincidental
-- coverage.
--
-- reservePendingSubscription() inserts the blocked/payment_blocked membership,
-- then persistReservedPlanCheckout() runs INSERT ... ON CONFLICT DO UPDATE on
-- public.tribe_members with an empty invitation token, which triggers the
-- conflict UPDATE on the just-inserted row. Migration 20260606120000 opened the
-- INSERT policy for the tokenless open-join branch, but this UPDATE policy still
-- required an active invitation in its WITH CHECK. The tokenless conflict update
-- only passed because the OR-combined WITH CHECK of the separate
-- "Authenticated users can recover paid retry memberships" policy already
-- accepted it. This migration makes the open-join authorization explicit here,
-- mirroring the open-join INSERT branch so the checkout no longer relies on that
-- coincidental coverage.
--
-- The open join branch is allowed only when the row carries no invitation
-- (joined_via_invitation_id IS NULL) and public.can_open_join_tribe_paid_plan
-- confirms the tribe offers a current paid plan and the visitor is not
-- conduct-blocked. The existing invitation branch is preserved unchanged.

ALTER POLICY "Authenticated users can update pending invitation attribution"
ON public.tribe_members
USING (
  user_id = public.current_app_user_id()
  AND role = 'tribemate'
  AND status = 'blocked'
  AND status_reason = 'payment_blocked'
)
WITH CHECK (
  user_id = public.current_app_user_id()
  AND role = 'tribemate'
  AND status = 'blocked'
  AND status_reason = 'payment_blocked'
  AND (
    EXISTS (
      SELECT 1
      FROM public.tribe_invitations
      WHERE tribe_invitations.id = joined_via_invitation_id
        AND tribe_invitations.tribe_id = tribe_members.tribe_id
        AND tribe_invitations.token_hash = nullif(
          current_setting('app.current_invitation_hash', true),
          ''
        )
        AND tribe_invitations.status = 'active'
    )
    OR (
      joined_via_invitation_id IS NULL
      AND public.can_open_join_tribe_paid_plan(tribe_members.tribe_id)
    )
  )
);

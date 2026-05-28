-- Metadata-only referral updates (channel, campaign_name, referrer_handle) run
-- through public.update_tribe_invitation_referral_metadata, a SECURITY DEFINER
-- function that executes as the owner of public.tribe_invitations. Because the
-- table is FORCE ROW LEVEL SECURITY, that owner still has to satisfy the UPDATE
-- policy WITH CHECK. The previous policy kept the active Mercado Pago plan
-- EXISTS check unconditionally for the 'specific' branch, so editing referral
-- metadata on a historical invitation whose plan was later canceled or
-- soft-deleted was rejected.
--
-- This migration extends the existing owner exception (already applied to the
-- can_manage_tribe_subscription_prices authorization check) to the active-plan
-- EXISTS check. Billing-association changes still run with the application role
-- ('authenticated', never the table owner), so they keep requiring an active,
-- provider-backed price. Metadata-only updates via the SECURITY DEFINER owner
-- path no longer require it.

DROP POLICY IF EXISTS "Invitation managers can update invitations"
  ON public.tribe_invitations;

CREATE POLICY "Invitation managers can update invitations"
ON public.tribe_invitations
FOR UPDATE
USING (public.can_manage_tribe_invitations(tribe_id))
WITH CHECK (
  status IN ('active', 'revoked')
  AND public.can_manage_tribe_invitations(tribe_id)
  AND (
    status = 'revoked'
    OR (
      subscription_association_type = 'current'
      AND subscription_price_id IS NULL
    )
    OR (
      subscription_association_type = 'free'
      AND subscription_price_id IS NULL
      AND (
        public.can_manage_tribe_subscription_prices(tribe_id)
        OR current_user = (
          SELECT pg_get_userbyid(pg_class.relowner)
          FROM pg_class
          WHERE pg_class.oid = 'public.tribe_invitations'::regclass
        )
      )
    )
    OR (
      subscription_association_type = 'specific'
      AND (
        public.can_manage_tribe_subscription_prices(tribe_id)
        OR current_user = (
          SELECT pg_get_userbyid(pg_class.relowner)
          FROM pg_class
          WHERE pg_class.oid = 'public.tribe_invitations'::regclass
        )
      )
      AND (
        current_user = (
          SELECT pg_get_userbyid(pg_class.relowner)
          FROM pg_class
          WHERE pg_class.oid = 'public.tribe_invitations'::regclass
        )
        OR EXISTS (
          SELECT 1
          FROM public.tribe_subscription_prices
          WHERE tribe_subscription_prices.id = subscription_price_id
            AND tribe_subscription_prices.tribe_id = tribe_invitations.tribe_id
            AND tribe_subscription_prices.status = 'active'
            AND tribe_subscription_prices.mercado_pago_preapproval_plan_id IS NOT NULL
        )
      )
    )
  )
);

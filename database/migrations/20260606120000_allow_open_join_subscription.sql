-- Open join: let a non-member subscribe to the tribe current paid price from the
-- public tribe link (tutribu.app/<slug>) without an invitation token.
--
-- Both the pending subscription row and the pending (payment-blocked) membership
-- row are created at checkout start. After migration 20260525120000 both INSERT
-- policies required an active invitation, so a tokenless visitor could not start
-- a paid checkout. This migration adds a tokenless "open join" branch to each
-- policy.
--
-- The authorization is encapsulated in a SECURITY DEFINER function so the policy
-- can read tribe and price state that a non-member cannot see through RLS (the
-- tribes SELECT policy hides private tribes from non-members). The open join is
-- allowed only when:
--   * a current paid price exists (is_current = true, active, with a provider plan),
--   * the tribe offers the paid price as current (free_join_is_current = false),
--   * the visitor is not conduct-blocked in the tribe.
-- The existing invitation and recovery branches are preserved unchanged.

CREATE OR REPLACE FUNCTION public.can_open_join_tribe_paid_plan(
  target_tribe_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    EXISTS (
      SELECT 1
      FROM public.tribes
      INNER JOIN public.tribe_subscription_prices
        ON tribe_subscription_prices.tribe_id = tribes.id
      WHERE tribes.id = target_tribe_id
        AND tribes.free_join_is_current = false
        AND tribe_subscription_prices.status = 'active'
        AND tribe_subscription_prices.is_current = true
        AND tribe_subscription_prices.mercado_pago_preapproval_plan_id IS NOT NULL
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.tribe_members
      WHERE tribe_members.tribe_id = target_tribe_id
        AND tribe_members.user_id = public.current_app_user_id()
        AND tribe_members.status = 'blocked'
        AND tribe_members.status_reason = 'conduct_blocked'
    );
$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    GRANT EXECUTE ON FUNCTION public.can_open_join_tribe_paid_plan(uuid)
      TO authenticated;
  END IF;
END;
$$;

ALTER POLICY "Members can create own pending subscription rows"
ON public.tribe_member_subscriptions
WITH CHECK (
  user_id = public.current_app_user_id()
  AND status = 'pending'
  AND EXISTS (
    SELECT 1
    FROM public.tribe_subscription_prices
    WHERE tribe_subscription_prices.id = tribe_member_subscriptions.price_id
      AND tribe_subscription_prices.tribe_id = tribe_member_subscriptions.tribe_id
      AND tribe_subscription_prices.status = 'active'
      AND tribe_subscription_prices.mercado_pago_preapproval_plan_id IS NOT NULL
      AND (
        (
          tribe_subscription_prices.is_current = true
          AND (
            EXISTS (
              SELECT 1
              FROM public.tribe_invitations
              WHERE tribe_invitations.tribe_id = tribe_member_subscriptions.tribe_id
                AND tribe_invitations.token_hash = nullif(
                  current_setting('app.current_invitation_hash', true),
                  ''
                )
                AND tribe_invitations.status = 'active'
                AND tribe_invitations.subscription_association_type = 'current'
            )
            OR EXISTS (
              SELECT 1
              FROM public.tribe_members
              WHERE tribe_members.tribe_id = tribe_member_subscriptions.tribe_id
                AND tribe_members.user_id = public.current_app_user_id()
                AND (
                  (
                    tribe_members.status = 'blocked'
                    AND tribe_members.status_reason = 'payment_blocked'
                  )
                  OR (
                    tribe_members.status = 'removed'
                    AND tribe_members.status_reason = 'subscription_inactive'
                  )
                )
            )
            OR public.can_open_join_tribe_paid_plan(
              tribe_member_subscriptions.tribe_id
            )
          )
        )
        OR EXISTS (
          SELECT 1
          FROM public.tribe_invitations
          WHERE tribe_invitations.tribe_id = tribe_member_subscriptions.tribe_id
            AND tribe_invitations.token_hash = nullif(
              current_setting('app.current_invitation_hash', true),
              ''
            )
            AND tribe_invitations.status = 'active'
            AND tribe_invitations.subscription_association_type = 'specific'
            AND tribe_invitations.subscription_price_id = tribe_member_subscriptions.price_id
        )
      )
  )
);

ALTER POLICY "Authenticated users can create paid pending memberships"
ON public.tribe_members
WITH CHECK (
  user_id = public.current_app_user_id()
  AND role = 'tribemate'
  AND status = 'blocked'
  AND status_reason = 'payment_blocked'
  AND (
    joined_via_invitation_id IS NULL
    OR EXISTS (
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
  )
  AND (
    EXISTS (
      SELECT 1
      FROM public.tribe_invitations
      WHERE tribe_invitations.tribe_id = tribe_members.tribe_id
        AND tribe_invitations.token_hash = nullif(
          current_setting('app.current_invitation_hash', true),
          ''
        )
        AND tribe_invitations.status = 'active'
        AND (
          (
            tribe_invitations.subscription_association_type = 'current'
            AND EXISTS (
              SELECT 1
              FROM public.tribe_subscription_prices
              WHERE tribe_subscription_prices.tribe_id = tribe_members.tribe_id
                AND tribe_subscription_prices.status = 'active'
                AND tribe_subscription_prices.is_current = true
                AND tribe_subscription_prices.mercado_pago_preapproval_plan_id IS NOT NULL
            )
          )
          OR (
            tribe_invitations.subscription_association_type = 'specific'
            AND EXISTS (
              SELECT 1
              FROM public.tribe_subscription_prices
              WHERE tribe_subscription_prices.id = tribe_invitations.subscription_price_id
                AND tribe_subscription_prices.tribe_id = tribe_members.tribe_id
                AND tribe_subscription_prices.status = 'active'
                AND tribe_subscription_prices.mercado_pago_preapproval_plan_id IS NOT NULL
            )
          )
        )
    )
    OR (
      joined_via_invitation_id IS NULL
      AND public.can_open_join_tribe_paid_plan(tribe_members.tribe_id)
    )
  )
);

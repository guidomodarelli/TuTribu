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
      AND tribe_subscription_prices.is_current = true
  )
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
  )
);

DROP POLICY IF EXISTS "Authenticated users can recover paid retry memberships"
ON public.tribe_members;

CREATE POLICY "Authenticated users can recover paid retry memberships"
ON public.tribe_members
FOR UPDATE
USING (
  user_id = public.current_app_user_id()
  AND status = 'removed'
  AND status_reason = 'subscription_inactive'
)
WITH CHECK (
  user_id = public.current_app_user_id()
  AND role = 'tribemate'
  AND status = 'blocked'
  AND status_reason = 'payment_blocked'
  AND EXISTS (
    SELECT 1
    FROM public.tribe_subscription_prices
    WHERE tribe_subscription_prices.tribe_id = tribe_members.tribe_id
      AND tribe_subscription_prices.status = 'active'
      AND tribe_subscription_prices.is_current = true
  )
);

-- Conversion metrics counted every tribe_members row attributed to an
-- invitation as a signup, regardless of membership status. Paid invitation
-- links reserve the membership as status = 'blocked' / status_reason =
-- 'payment_blocked' the moment checkout is opened, and only flip to 'active'
-- once the Mercado Pago webhook confirms payment. As a result, a user who
-- opened Mercado Pago and abandoned the payment was still counted under
-- signups, inflating the metric for every abandoned paid checkout.
--
-- Restrict the signup count to memberships that actually joined by excluding
-- the pending paid-checkout state. Conduct-blocked and removed members are
-- kept, because they did join at some point. paid_active and revenue_cents are
-- unaffected: they only aggregate 'active' subscriptions, which a
-- payment-blocked membership never has.

CREATE OR REPLACE FUNCTION public.get_tribe_invitation_conversion_metrics(
  target_tribe_slug text
)
RETURNS TABLE (
  invitation_id uuid,
  channel text,
  campaign_name text,
  referrer_handle text,
  clicks integer,
  signups bigint,
  paid_active bigint,
  revenue_cents numeric,
  payment_integration_id uuid,
  mercado_pago_account_label text,
  mercado_pago_account_email text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH target_tribe AS (
    SELECT tribes.id
    FROM public.tribes
    WHERE tribes.slug = target_tribe_slug
    LIMIT 1
  )
  SELECT
    tribe_invitations.id AS invitation_id,
    tribe_invitations.channel,
    tribe_invitations.campaign_name,
    tribe_invitations.referrer_handle,
    NULL::integer AS clicks,
    count(DISTINCT tribe_members.id) FILTER (
      WHERE NOT (
        tribe_members.status = 'blocked'
        AND tribe_members.status_reason = 'payment_blocked'
      )
    ) AS signups,
    count(DISTINCT active_subscriptions.id) AS paid_active,
    coalesce(
      sum(
        coalesce(
          active_subscriptions.price_snapshot_amount_cents,
          tribe_subscription_prices.amount_cents,
          0
        )
      ),
      0
    ) AS revenue_cents,
    coalesce(
      active_subscriptions.payment_integration_id,
      tribe_subscription_prices.payment_integration_id
    ) AS payment_integration_id,
    tribe_payment_integrations.account_label AS mercado_pago_account_label,
    tribe_payment_integrations.provider_account_email AS mercado_pago_account_email
  FROM public.tribe_invitations
  INNER JOIN target_tribe
    ON target_tribe.id = tribe_invitations.tribe_id
  LEFT JOIN public.tribe_members
    ON tribe_members.joined_via_invitation_id = tribe_invitations.id
    AND tribe_members.tribe_id = target_tribe.id
  LEFT JOIN public.tribe_member_subscriptions active_subscriptions
    ON active_subscriptions.tribe_id = tribe_members.tribe_id
    AND active_subscriptions.user_id = tribe_members.user_id
    AND active_subscriptions.status = 'active'
  LEFT JOIN public.tribe_subscription_prices
    ON tribe_subscription_prices.id = active_subscriptions.price_id
  LEFT JOIN public.tribe_payment_integrations
    ON tribe_payment_integrations.id = coalesce(
      active_subscriptions.payment_integration_id,
      tribe_subscription_prices.payment_integration_id
    )
    AND tribe_payment_integrations.tribe_id = target_tribe.id
  WHERE tribe_invitations.status IN ('active', 'revoked')
    AND public.can_manage_tribe_invitations(target_tribe.id)
  GROUP BY
    tribe_invitations.id,
    tribe_invitations.channel,
    tribe_invitations.campaign_name,
    tribe_invitations.referrer_handle,
    coalesce(
      active_subscriptions.payment_integration_id,
      tribe_subscription_prices.payment_integration_id
    ),
    tribe_payment_integrations.account_label,
    tribe_payment_integrations.provider_account_email
  ORDER BY tribe_invitations.created_at DESC;
$$;

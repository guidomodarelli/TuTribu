-- Open join checkout: resolve the target tribe for a tokenless, non-member
-- visitor starting the current paid plan checkout from the public tribe link
-- (tutribu.app/<slug>).
--
-- startCurrentPriceSubscriptionCheckout resolves the tribe by joining
-- public.tribes, but the tribes SELECT policies hide the tribe row from an
-- authenticated non-member without an invitation token (only active/muted
-- members or invitation-token holders can read it). For an open-join visitor
-- the target_tribe id resolved to null, so current_price_id and the whole
-- checkout context collapsed to null and the action returned
-- missing_current_price instead of reserving the pending subscription and the
-- pending membership.
--
-- This SECURITY DEFINER function resolves the tribe id by slug only when the
-- tribe exposes its current paid plan as the live option
-- (free_join_is_current = false) and the price has a synchronized provider
-- plan. It mirrors can_open_join_tribe_paid_plan and
-- tribe_open_join_current_paid_offer: the same open-join conditions, read
-- through a definer so the checkout can resolve the tribe id without exposing
-- the private tribe row through RLS. The pending subscription and membership
-- inserts stay gated by can_open_join_tribe_paid_plan, which also rejects a
-- conduct-blocked visitor.

CREATE OR REPLACE FUNCTION public.tribe_open_join_id_by_slug(
  target_tribe_slug text
)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT tribes.id
  FROM public.tribes
  INNER JOIN public.tribe_subscription_prices
    ON tribe_subscription_prices.tribe_id = tribes.id
  WHERE tribes.slug = target_tribe_slug
    AND tribes.free_join_is_current = false
    AND tribe_subscription_prices.status = 'active'
    AND tribe_subscription_prices.is_current = true
    AND tribe_subscription_prices.mercado_pago_preapproval_plan_id IS NOT NULL
  LIMIT 1;
$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    GRANT EXECUTE ON FUNCTION public.tribe_open_join_id_by_slug(text)
      TO authenticated;
  END IF;
END;
$$;

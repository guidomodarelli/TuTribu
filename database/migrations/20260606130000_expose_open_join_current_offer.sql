-- Open join offer read: expose the tribe current paid offer to a tokenless,
-- non-member visitor on the public tribe link (tutribu.app/<slug>).
--
-- getCurrentSubscriptionOffer resolved the tribe by joining public.tribes, but
-- the tribes SELECT policies hide the tribe row from an authenticated non-member
-- without an invitation token (only active/muted members or invitation-token
-- holders can read it). The join produced no row, so the public paid join page
-- always reported the offer as unavailable and returned 404 even when a current
-- paid plan existed.
--
-- This SECURITY DEFINER function resolves the tribe by slug and returns the
-- current paid offer only when the tribe exposes it as the live option
-- (free_join_is_current = false) and the price has a synchronized provider plan.
-- It mirrors can_open_join_tribe_paid_plan: the same open-join conditions, read
-- through a definer so a non-member can see the publicly shared offer without an
-- invitation token. It exposes only the safe, public price fields (name, amount,
-- currency, frequency), never private tribe state.

CREATE OR REPLACE FUNCTION public.tribe_open_join_current_paid_offer(
  target_tribe_slug text
)
RETURNS TABLE (
  amount_cents integer,
  currency text,
  frequency text,
  name text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    tribe_subscription_prices.amount_cents,
    tribe_subscription_prices.currency,
    tribe_subscription_prices.frequency,
    tribe_subscription_prices.name
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
    GRANT EXECUTE ON FUNCTION public.tribe_open_join_current_paid_offer(text)
      TO authenticated;
  END IF;
END;
$$;

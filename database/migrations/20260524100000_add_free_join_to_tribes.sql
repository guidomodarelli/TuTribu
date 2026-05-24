ALTER TABLE public.tribes
  ADD COLUMN IF NOT EXISTS free_join_is_current boolean NOT NULL DEFAULT true;

ALTER TABLE public.tribes
  ALTER COLUMN free_join_is_current SET DEFAULT true;

UPDATE public.tribes
SET free_join_is_current = true
WHERE NOT EXISTS (
  SELECT 1
  FROM public.tribe_subscription_prices
  WHERE tribe_subscription_prices.tribe_id = tribes.id
    AND tribe_subscription_prices.is_current = true
    AND tribe_subscription_prices.status = 'active'
    AND tribe_subscription_prices.mercado_pago_preapproval_plan_id IS NOT NULL
);

UPDATE public.tribes
SET free_join_is_current = false
WHERE EXISTS (
  SELECT 1
  FROM public.tribe_subscription_prices
  WHERE tribe_subscription_prices.tribe_id = tribes.id
    AND tribe_subscription_prices.is_current = true
    AND tribe_subscription_prices.status = 'active'
    AND tribe_subscription_prices.mercado_pago_preapproval_plan_id IS NOT NULL
);

UPDATE public.tribe_subscription_prices
SET is_current = false
WHERE tribe_subscription_prices.is_current = true
  AND tribe_subscription_prices.status = 'active'
  AND tribe_subscription_prices.mercado_pago_preapproval_plan_id IS NULL;

ALTER TABLE public.tribe_members
  ADD COLUMN IF NOT EXISTS joined_via text NOT NULL DEFAULT 'unknown';

DROP POLICY IF EXISTS "Leaders can update tribe free join mode"
ON public.tribes;

CREATE POLICY "Leaders can update tribe free join mode"
ON public.tribes
FOR UPDATE
USING (public.can_manage_tribe_subscription_prices(id))
WITH CHECK (public.can_manage_tribe_subscription_prices(id));

DROP POLICY IF EXISTS "Verified Mercado Pago webhooks can update tribe free join mode"
ON public.tribes;

CREATE POLICY "Verified Mercado Pago webhooks can update tribe free join mode"
ON public.tribes
FOR UPDATE
USING (public.is_mercado_pago_webhook_verified())
WITH CHECK (public.is_mercado_pago_webhook_verified());

DROP POLICY IF EXISTS "Authenticated users can activate own free invitation memberships"
ON public.tribe_members;

CREATE POLICY "Authenticated users can activate own free invitation memberships"
ON public.tribe_members
FOR UPDATE
USING (
  user_id = public.current_app_user_id()
  AND status = 'blocked'
  AND status_reason = 'payment_blocked'
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
      AND tribes.free_join_is_current = true
      AND tribe_invitations.status = 'active'
      AND tribe_invitations.token_hash = current_setting(
        'app.current_invitation_hash',
        true
      )
  )
);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    GRANT UPDATE (free_join_is_current) ON public.tribes TO authenticated;
    GRANT UPDATE (status, status_reason, joined_via) ON public.tribe_members TO authenticated;
  END IF;
END;
$$;

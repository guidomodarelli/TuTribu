DROP POLICY IF EXISTS "Verified Mercado Pago flows can recover subscription rows"
ON public.tribe_member_subscriptions;

CREATE POLICY "Verified Mercado Pago flows can recover subscription rows"
ON public.tribe_member_subscriptions
FOR INSERT
WITH CHECK (
  public.is_mercado_pago_webhook_verified()
  AND mercado_pago_preapproval_id IS NOT NULL
  AND status IN ('active', 'pending', 'canceled', 'paused')
);

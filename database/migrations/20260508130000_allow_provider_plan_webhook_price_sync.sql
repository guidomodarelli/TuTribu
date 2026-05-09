CREATE POLICY "Verified Mercado Pago webhooks can read tribe prices"
ON public.tribe_subscription_prices
FOR SELECT
USING (public.is_mercado_pago_webhook_verified());

CREATE POLICY "Verified Mercado Pago webhooks can update provider prices"
ON public.tribe_subscription_prices
FOR UPDATE
USING (public.is_mercado_pago_webhook_verified())
WITH CHECK (public.is_mercado_pago_webhook_verified());

CREATE POLICY "Verified Mercado Pago webhooks can delete idempotency operations"
ON public.subscription_idempotency_operations
FOR DELETE
USING (public.is_mercado_pago_webhook_verified());

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    GRANT DELETE ON public.subscription_idempotency_operations TO authenticated;
  END IF;
END;
$$;

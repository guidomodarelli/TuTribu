ALTER TABLE public.tribe_member_subscriptions
ADD COLUMN IF NOT EXISTS price_snapshot_name text,
ADD COLUMN IF NOT EXISTS price_snapshot_amount_cents integer,
ADD COLUMN IF NOT EXISTS price_snapshot_currency text,
ADD COLUMN IF NOT EXISTS price_snapshot_frequency text,
ADD COLUMN IF NOT EXISTS price_snapshot_provider_plan_id text;

UPDATE public.tribe_member_subscriptions
SET
  price_snapshot_name = tribe_subscription_prices.name,
  price_snapshot_amount_cents = tribe_subscription_prices.amount_cents,
  price_snapshot_currency = tribe_subscription_prices.currency,
  price_snapshot_frequency = tribe_subscription_prices.frequency,
  price_snapshot_provider_plan_id = tribe_subscription_prices.mercado_pago_preapproval_plan_id
FROM public.tribe_subscription_prices
WHERE tribe_member_subscriptions.price_id = tribe_subscription_prices.id
  AND tribe_member_subscriptions.price_snapshot_name IS NULL;

ALTER TABLE public.tribe_member_subscriptions
ALTER COLUMN price_id DROP NOT NULL;

DROP POLICY IF EXISTS "Leaders can detach subscriptions from deleted prices"
ON public.tribe_member_subscriptions;

DROP POLICY IF EXISTS "Leaders can snapshot subscriptions before price changes"
ON public.tribe_member_subscriptions;

DROP POLICY IF EXISTS "Subscription price maintenance can update subscription snapshots"
ON public.tribe_member_subscriptions;

CREATE POLICY "Subscription price maintenance can update subscription snapshots"
ON public.tribe_member_subscriptions
FOR UPDATE
USING (
  nullif(
    current_setting('app.subscription_price_snapshot_maintenance', true),
    ''
  ) = 'true'
  AND (
    public.can_manage_tribe_subscription_prices(tribe_id)
    OR public.is_mercado_pago_webhook_verified()
  )
)
WITH CHECK (
  nullif(
    current_setting('app.subscription_price_snapshot_maintenance', true),
    ''
  ) = 'true'
  AND (
    public.can_manage_tribe_subscription_prices(tribe_id)
    OR public.is_mercado_pago_webhook_verified()
  )
  AND price_snapshot_name IS NOT NULL
  AND price_snapshot_amount_cents IS NOT NULL
  AND price_snapshot_currency IS NOT NULL
  AND price_snapshot_frequency IS NOT NULL
);

CREATE OR REPLACE FUNCTION public.snapshot_tribe_member_subscriptions_before_price_change(
  target_price_id uuid
)
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  selected_price_id uuid;
  selected_tribe_id uuid;
  selected_name text;
  selected_amount_cents integer;
  selected_currency text;
  selected_frequency text;
  selected_provider_plan_id text;
  updated_count integer;
BEGIN
  SELECT
    tribe_subscription_prices.id,
    tribe_subscription_prices.tribe_id,
    tribe_subscription_prices.name,
    tribe_subscription_prices.amount_cents,
    tribe_subscription_prices.currency,
    tribe_subscription_prices.frequency,
    tribe_subscription_prices.mercado_pago_preapproval_plan_id
  INTO
    selected_price_id,
    selected_tribe_id,
    selected_name,
    selected_amount_cents,
    selected_currency,
    selected_frequency,
    selected_provider_plan_id
  FROM public.tribe_subscription_prices
  WHERE tribe_subscription_prices.id = target_price_id
  LIMIT 1;

  IF selected_price_id IS NULL THEN
    RETURN 0;
  END IF;

  IF NOT (
    public.can_manage_tribe_subscription_prices(selected_tribe_id)
    OR public.is_mercado_pago_webhook_verified()
  ) THEN
    RETURN 0;
  END IF;

  PERFORM set_config(
    'app.subscription_price_snapshot_maintenance',
    'true',
    true
  );

  UPDATE public.tribe_member_subscriptions
  SET
    price_snapshot_name = coalesce(
      tribe_member_subscriptions.price_snapshot_name,
      selected_name
    ),
    price_snapshot_amount_cents = coalesce(
      tribe_member_subscriptions.price_snapshot_amount_cents,
      selected_amount_cents
    ),
    price_snapshot_currency = coalesce(
      tribe_member_subscriptions.price_snapshot_currency,
      selected_currency
    ),
    price_snapshot_frequency = coalesce(
      tribe_member_subscriptions.price_snapshot_frequency,
      selected_frequency
    ),
    price_snapshot_provider_plan_id = coalesce(
      tribe_member_subscriptions.price_snapshot_provider_plan_id,
      selected_provider_plan_id
    )
  WHERE tribe_member_subscriptions.price_id = selected_price_id;

  GET DIAGNOSTICS updated_count = ROW_COUNT;

  RETURN updated_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.detach_tribe_member_subscriptions_from_deleted_price(
  target_price_id uuid
)
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  selected_price_id uuid;
  selected_tribe_id uuid;
  selected_name text;
  selected_amount_cents integer;
  selected_currency text;
  selected_frequency text;
  selected_provider_plan_id text;
  updated_count integer;
BEGIN
  SELECT
    tribe_subscription_prices.id,
    tribe_subscription_prices.tribe_id,
    tribe_subscription_prices.name,
    tribe_subscription_prices.amount_cents,
    tribe_subscription_prices.currency,
    tribe_subscription_prices.frequency,
    tribe_subscription_prices.mercado_pago_preapproval_plan_id
  INTO
    selected_price_id,
    selected_tribe_id,
    selected_name,
    selected_amount_cents,
    selected_currency,
    selected_frequency,
    selected_provider_plan_id
  FROM public.tribe_subscription_prices
  WHERE tribe_subscription_prices.id = target_price_id
    AND tribe_subscription_prices.status = 'canceled'
  LIMIT 1;

  IF selected_price_id IS NULL THEN
    RETURN 0;
  END IF;

  IF NOT (
    public.can_manage_tribe_subscription_prices(selected_tribe_id)
    OR public.is_mercado_pago_webhook_verified()
  ) THEN
    RETURN 0;
  END IF;

  PERFORM set_config(
    'app.subscription_price_snapshot_maintenance',
    'true',
    true
  );

  UPDATE public.tribe_member_subscriptions
  SET
    price_snapshot_name = coalesce(
      tribe_member_subscriptions.price_snapshot_name,
      selected_name
    ),
    price_snapshot_amount_cents = coalesce(
      tribe_member_subscriptions.price_snapshot_amount_cents,
      selected_amount_cents
    ),
    price_snapshot_currency = coalesce(
      tribe_member_subscriptions.price_snapshot_currency,
      selected_currency
    ),
    price_snapshot_frequency = coalesce(
      tribe_member_subscriptions.price_snapshot_frequency,
      selected_frequency
    ),
    price_snapshot_provider_plan_id = coalesce(
      tribe_member_subscriptions.price_snapshot_provider_plan_id,
      selected_provider_plan_id
    ),
    price_id = NULL
  WHERE tribe_member_subscriptions.price_id = selected_price_id;

  GET DIAGNOSTICS updated_count = ROW_COUNT;

  RETURN updated_count;
END;
$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    GRANT EXECUTE ON FUNCTION public.snapshot_tribe_member_subscriptions_before_price_change(uuid)
    TO authenticated;

    GRANT EXECUTE ON FUNCTION public.detach_tribe_member_subscriptions_from_deleted_price(uuid)
    TO authenticated;
  END IF;
END;
$$;

ALTER TABLE public.tribe_subscription_prices
DROP CONSTRAINT IF EXISTS tribe_subscription_prices_status_check;

ALTER TABLE public.tribe_subscription_prices
ADD CONSTRAINT tribe_subscription_prices_status_check
CHECK (status IN ('active', 'paused', 'canceled', 'deleted', 'pending_provider_plan'));

ALTER TABLE public.tribe_payment_integrations
DROP CONSTRAINT IF EXISTS tribe_payment_integrations_tribe_provider_key;

DROP INDEX IF EXISTS public.tribe_payment_integrations_tribe_provider_key;

ALTER TABLE public.tribe_payment_integrations
ADD COLUMN IF NOT EXISTS account_label text,
ADD COLUMN IF NOT EXISTS provider_account_email text,
ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'connected';

UPDATE public.tribe_payment_integrations
SET
  account_label = coalesce(
    nullif(account_label, ''),
    'Cuenta Mercado Pago ' || row_number_by_tribe.account_position::text
  ),
  status = coalesce(nullif(status, ''), 'connected')
FROM (
  SELECT
    tribe_payment_integrations.id,
    row_number() OVER (
      PARTITION BY tribe_payment_integrations.tribe_id, tribe_payment_integrations.provider
      ORDER BY tribe_payment_integrations.created_at ASC, tribe_payment_integrations.id ASC
    ) AS account_position
  FROM public.tribe_payment_integrations
) AS row_number_by_tribe
WHERE row_number_by_tribe.id = tribe_payment_integrations.id;

ALTER TABLE public.tribe_payment_integrations
ALTER COLUMN account_label SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'tribe_payment_integrations_status_check'
  ) THEN
    ALTER TABLE public.tribe_payment_integrations
    ADD CONSTRAINT tribe_payment_integrations_status_check
    CHECK (status IN ('connected', 'requires_reconnection'));
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS tribe_payment_integrations_provider_account_key
ON public.tribe_payment_integrations(
  tribe_id,
  provider,
  COALESCE(provider_account_id, id::text)
);

CREATE UNIQUE INDEX IF NOT EXISTS tribe_payment_integrations_provider_account_id_key
ON public.tribe_payment_integrations(tribe_id, provider, provider_account_id)
WHERE provider_account_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS tribe_payment_integrations_id_tribe_key
ON public.tribe_payment_integrations(id, tribe_id);

ALTER TABLE public.tribe_subscription_prices
ADD COLUMN IF NOT EXISTS payment_integration_id uuid;

WITH existing_integration AS (
  SELECT DISTINCT ON (tribe_payment_integrations.tribe_id)
    tribe_payment_integrations.id,
    tribe_payment_integrations.tribe_id
  FROM public.tribe_payment_integrations
  WHERE tribe_payment_integrations.provider = 'mercado_pago'
  ORDER BY
    tribe_payment_integrations.tribe_id,
    tribe_payment_integrations.created_at ASC,
    tribe_payment_integrations.id ASC
)
UPDATE public.tribe_subscription_prices
SET payment_integration_id = existing_integration.id
FROM existing_integration
WHERE tribe_subscription_prices.tribe_id = existing_integration.tribe_id
  AND tribe_subscription_prices.payment_integration_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_tribe_subscription_prices_payment_integration
ON public.tribe_subscription_prices(payment_integration_id);

CREATE UNIQUE INDEX IF NOT EXISTS tribe_subscription_prices_id_tribe_key
ON public.tribe_subscription_prices(id, tribe_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'tribe_subscription_prices_payment_integration_tribe_fkey'
  ) THEN
    ALTER TABLE public.tribe_subscription_prices
    ADD CONSTRAINT tribe_subscription_prices_payment_integration_tribe_fkey
    FOREIGN KEY (payment_integration_id, tribe_id)
    REFERENCES public.tribe_payment_integrations(id, tribe_id)
    NOT VALID;
  END IF;
END $$;

ALTER TABLE public.tribe_member_subscriptions
ADD COLUMN IF NOT EXISTS payment_integration_id uuid;

WITH existing_integration AS (
  SELECT DISTINCT ON (tribe_payment_integrations.tribe_id)
    tribe_payment_integrations.id,
    tribe_payment_integrations.tribe_id
  FROM public.tribe_payment_integrations
  WHERE tribe_payment_integrations.provider = 'mercado_pago'
  ORDER BY
    tribe_payment_integrations.tribe_id,
    tribe_payment_integrations.created_at ASC,
    tribe_payment_integrations.id ASC
)
UPDATE public.tribe_member_subscriptions
SET payment_integration_id = coalesce(
  (
    SELECT tribe_subscription_prices.payment_integration_id
    FROM public.tribe_subscription_prices
    WHERE tribe_subscription_prices.id = tribe_member_subscriptions.price_id
    LIMIT 1
  ),
  existing_integration.id
)
FROM existing_integration
WHERE tribe_member_subscriptions.tribe_id = existing_integration.tribe_id
  AND tribe_member_subscriptions.payment_integration_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_tribe_member_subscriptions_payment_integration
ON public.tribe_member_subscriptions(payment_integration_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'tribe_member_subscriptions_payment_integration_tribe_fkey'
  ) THEN
    ALTER TABLE public.tribe_member_subscriptions
    ADD CONSTRAINT tribe_member_subscriptions_payment_integration_tribe_fkey
    FOREIGN KEY (payment_integration_id, tribe_id)
    REFERENCES public.tribe_payment_integrations(id, tribe_id)
    NOT VALID;
  END IF;
END $$;

DROP POLICY IF EXISTS "Leaders can update Mercado Pago account labels"
ON public.tribe_payment_integrations;

CREATE POLICY "Leaders can update Mercado Pago account labels"
ON public.tribe_payment_integrations
FOR UPDATE
USING (
  provider = 'mercado_pago'
  AND public.can_manage_tribe_subscription_prices(tribe_id)
)
WITH CHECK (
  provider = 'mercado_pago'
  AND public.can_manage_tribe_subscription_prices(tribe_id)
);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    GRANT UPDATE (account_label) ON public.tribe_payment_integrations TO authenticated;
  END IF;
END $$;

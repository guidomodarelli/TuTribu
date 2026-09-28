-- Product discriminator for prices and member subscriptions, plus the ledger of
-- verified subscription payments that backs paid academy coverage.
--
-- - Existing rows are `membership` (historical behavior) and are never
--   reclassified globally; only the per-tribe cutover may reclassify rows that
--   its approved manifest identifies as academy.
-- - The "current price" and the "one live subscription per member" rules are
--   now per product, so an academy price never replaces the free or paid
--   membership entry and an academy checkout never collides with a legacy
--   membership subscription.
-- - Academy subscriptions freeze the accepted offer version and acceptance time
--   next to the existing price snapshot (amount, currency, frequency).
-- - subscription_payment_periods records each verified provider invoice with
--   its payment state, amount, currency and service interval. Access for new
--   academy contracts is derived from these periods, never from the remote
--   `authorized` status alone.

ALTER TABLE public.tribe_subscription_prices
  ADD COLUMN IF NOT EXISTS product_key text NOT NULL DEFAULT 'membership';

ALTER TABLE public.tribe_member_subscriptions
  ADD COLUMN IF NOT EXISTS product_key text NOT NULL DEFAULT 'membership',
  ADD COLUMN IF NOT EXISTS offer_version_snapshot integer,
  ADD COLUMN IF NOT EXISTS terms_accepted_at timestamptz,
  ADD COLUMN IF NOT EXISTS billing_anchor_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancel_requested_at timestamptz,
  ADD COLUMN IF NOT EXISTS coverage_reconciled_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'tribe_subscription_prices_product_key_check'
  ) THEN
    ALTER TABLE public.tribe_subscription_prices
      ADD CONSTRAINT tribe_subscription_prices_product_key_check
      CHECK (product_key IN ('membership', 'academy'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'tribe_member_subscriptions_product_key_check'
  ) THEN
    ALTER TABLE public.tribe_member_subscriptions
      ADD CONSTRAINT tribe_member_subscriptions_product_key_check
      CHECK (product_key IN ('membership', 'academy'));
  END IF;

  -- Academy contracts must freeze the accepted terms.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'tribe_member_subscriptions_academy_snapshot_check'
  ) THEN
    ALTER TABLE public.tribe_member_subscriptions
      ADD CONSTRAINT tribe_member_subscriptions_academy_snapshot_check
      CHECK (
        product_key <> 'academy'
        OR (
          price_snapshot_amount_cents IS NOT NULL
          AND price_snapshot_currency IS NOT NULL
          AND price_snapshot_frequency IS NOT NULL
          AND terms_accepted_at IS NOT NULL
        )
      );
  END IF;
END $$;

DROP INDEX IF EXISTS public.tribe_subscription_prices_current_key;
CREATE UNIQUE INDEX IF NOT EXISTS tribe_subscription_prices_current_key
ON public.tribe_subscription_prices(tribe_id, product_key)
WHERE is_current AND status = 'active';

DROP INDEX IF EXISTS public.tribe_member_subscriptions_active_key;
CREATE UNIQUE INDEX IF NOT EXISTS tribe_member_subscriptions_active_key
ON public.tribe_member_subscriptions(tribe_id, user_id, product_key)
WHERE status IN ('active', 'pending', 'grace_period', 'past_due', 'payment_blocked', 'paused');

CREATE INDEX IF NOT EXISTS idx_tribe_member_subscriptions_member_product
ON public.tribe_member_subscriptions(tribe_id, user_id, product_key);

-- A subscription can only point to a price of its own product.
CREATE OR REPLACE FUNCTION public.ensure_subscription_price_product()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.price_id IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.tribe_subscription_prices
    WHERE tribe_subscription_prices.id = NEW.price_id
      AND (
        tribe_subscription_prices.product_key <> NEW.product_key
        OR tribe_subscription_prices.tribe_id <> NEW.tribe_id
      )
  ) THEN
    RAISE EXCEPTION 'subscription product does not match its price'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.ensure_subscription_price_product() FROM PUBLIC;

DROP TRIGGER IF EXISTS ensure_subscription_price_product
ON public.tribe_member_subscriptions;
CREATE TRIGGER ensure_subscription_price_product
BEFORE INSERT OR UPDATE OF price_id, product_key, tribe_id
ON public.tribe_member_subscriptions
FOR EACH ROW
EXECUTE FUNCTION public.ensure_subscription_price_product();

-- Ledger of verified provider invoices.
CREATE TABLE IF NOT EXISTS public.subscription_payment_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tribe_id uuid NOT NULL REFERENCES public.tribes(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES public."user"(id) ON DELETE CASCADE,
  subscription_id uuid NOT NULL REFERENCES public.tribe_member_subscriptions(id) ON DELETE CASCADE,
  payment_integration_id uuid NOT NULL,
  product_key text NOT NULL,
  provider_subscription_id text NOT NULL,
  provider_invoice_id text NOT NULL,
  provider_payment_id text,
  payment_status text NOT NULL,
  amount_cents integer NOT NULL,
  currency text NOT NULL,
  debit_at timestamptz,
  service_starts_at timestamptz,
  service_ends_at timestamptz,
  provider_last_modified_at timestamptz,
  grant_id uuid REFERENCES public.member_access_grants(id) ON DELETE SET NULL,
  review_reason text,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT subscription_payment_periods_integration_tribe_fkey
    FOREIGN KEY (payment_integration_id, tribe_id)
    REFERENCES public.tribe_payment_integrations(id, tribe_id),
  CONSTRAINT subscription_payment_periods_product_key_check
    CHECK (product_key IN ('academy')),
  CONSTRAINT subscription_payment_periods_status_check
    CHECK (payment_status IN (
      'approved',
      'pending',
      'rejected',
      'refunded',
      'charged_back',
      'partially_refunded',
      'needs_reconciliation'
    )),
  CONSTRAINT subscription_payment_periods_amount_check CHECK (amount_cents >= 0),
  CONSTRAINT subscription_payment_periods_interval_check
    CHECK (
      (service_starts_at IS NULL AND service_ends_at IS NULL)
      OR (service_starts_at IS NOT NULL AND service_ends_at > service_starts_at)
    ),
  -- Approved periods always carry a resolved service interval.
  CONSTRAINT subscription_payment_periods_approved_interval_check
    CHECK (payment_status <> 'approved' OR service_starts_at IS NOT NULL),
  CONSTRAINT subscription_payment_periods_review_reason_check
    CHECK (review_reason IS NULL OR char_length(review_reason) <= 200)
);

-- One ledger row per provider invoice and integration: repeated deliveries of
-- the same payment collapse on this key.
CREATE UNIQUE INDEX IF NOT EXISTS subscription_payment_periods_invoice_key
ON public.subscription_payment_periods(payment_integration_id, provider_invoice_id);

CREATE INDEX IF NOT EXISTS idx_subscription_payment_periods_subscription
ON public.subscription_payment_periods(subscription_id, service_starts_at);

CREATE INDEX IF NOT EXISTS idx_subscription_payment_periods_review
ON public.subscription_payment_periods(tribe_id, payment_status, created_at);

ALTER TABLE public.subscription_payment_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscription_payment_periods FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Leaders read subscription payment periods"
ON public.subscription_payment_periods;
CREATE POLICY "Leaders read subscription payment periods"
ON public.subscription_payment_periods
FOR SELECT
USING (public.can_manage_tribe_subscription_prices(tribe_id));

DROP POLICY IF EXISTS "Table owner manages subscription_payment_periods"
ON public.subscription_payment_periods;
CREATE POLICY "Table owner manages subscription_payment_periods"
ON public.subscription_payment_periods
FOR ALL
USING (
  current_user = (
    SELECT pg_get_userbyid(pg_class.relowner)
    FROM pg_class
    WHERE pg_class.oid = 'public.subscription_payment_periods'::regclass
  )
)
WITH CHECK (
  current_user = (
    SELECT pg_get_userbyid(pg_class.relowner)
    FROM pg_class
    WHERE pg_class.oid = 'public.subscription_payment_periods'::regclass
  )
);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE INSERT, UPDATE, DELETE ON public.subscription_payment_periods FROM authenticated;
    GRANT SELECT ON public.subscription_payment_periods TO authenticated;
  END IF;
END $$;

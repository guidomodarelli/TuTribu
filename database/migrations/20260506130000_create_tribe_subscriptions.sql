CREATE TABLE IF NOT EXISTS public.tribe_payment_integrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tribe_id uuid NOT NULL REFERENCES public.tribes(id) ON DELETE CASCADE,
  provider text NOT NULL,
  provider_account_id text,
  access_token text NOT NULL,
  refresh_token text,
  token_expires_at timestamptz,
  connected_by text NOT NULL REFERENCES public."user"(id),
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE UNIQUE INDEX IF NOT EXISTS tribe_payment_integrations_tribe_provider_key
ON public.tribe_payment_integrations(tribe_id, provider);

CREATE TABLE IF NOT EXISTS public.tribe_subscription_prices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tribe_id uuid NOT NULL REFERENCES public.tribes(id) ON DELETE CASCADE,
  name text NOT NULL,
  amount_cents integer NOT NULL CHECK (amount_cents > 0),
  currency text NOT NULL,
  frequency text NOT NULL,
  status text NOT NULL,
  is_current boolean NOT NULL DEFAULT false,
  mercado_pago_preapproval_plan_id text,
  created_by text NOT NULL REFERENCES public."user"(id),
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  deleted_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS tribe_subscription_prices_current_key
ON public.tribe_subscription_prices(tribe_id)
WHERE is_current AND status = 'active';

CREATE INDEX IF NOT EXISTS idx_tribe_subscription_prices_tribe_created_at
ON public.tribe_subscription_prices(tribe_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.tribe_member_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tribe_id uuid NOT NULL REFERENCES public.tribes(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES public."user"(id) ON DELETE CASCADE,
  price_id uuid NOT NULL REFERENCES public.tribe_subscription_prices(id),
  mercado_pago_preapproval_id text,
  status text NOT NULL,
  status_reason text NOT NULL DEFAULT 'none',
  current_period_end timestamptz,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE UNIQUE INDEX IF NOT EXISTS tribe_member_subscriptions_active_key
ON public.tribe_member_subscriptions(tribe_id, user_id)
WHERE status IN ('active', 'pending', 'grace_period', 'past_due', 'payment_blocked');

CREATE INDEX IF NOT EXISTS idx_tribe_member_subscriptions_price
ON public.tribe_member_subscriptions(price_id);

CREATE TABLE IF NOT EXISTS public.subscription_idempotency_operations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_key text NOT NULL,
  operation_type text NOT NULL,
  tribe_id uuid REFERENCES public.tribes(id) ON DELETE CASCADE,
  user_id text REFERENCES public."user"(id) ON DELETE CASCADE,
  payload_hash text NOT NULL,
  response_body jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE UNIQUE INDEX IF NOT EXISTS subscription_idempotency_operations_key
ON public.subscription_idempotency_operations(operation_key);

CREATE OR REPLACE FUNCTION public.can_view_tribe_subscription_prices(
  target_tribe_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.tribe_members
    WHERE tribe_members.tribe_id = target_tribe_id
      AND tribe_members.user_id = public.current_app_user_id()
      AND tribe_members.status = 'active'
      AND tribe_members.role IN ('leader', 'guardian')
  );
$$;

CREATE OR REPLACE FUNCTION public.can_manage_tribe_subscription_prices(
  target_tribe_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.tribe_members
    WHERE tribe_members.tribe_id = target_tribe_id
      AND tribe_members.user_id = public.current_app_user_id()
      AND tribe_members.status = 'active'
      AND tribe_members.role = 'leader'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_mercado_pago_webhook_verified()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(
    nullif(current_setting('app.mercado_pago_webhook_verified', true), ''),
    'false'
  ) = 'true';
$$;

ALTER TABLE public.tribe_payment_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tribe_payment_integrations FORCE ROW LEVEL SECURITY;
ALTER TABLE public.tribe_subscription_prices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tribe_subscription_prices FORCE ROW LEVEL SECURITY;
ALTER TABLE public.tribe_member_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tribe_member_subscriptions FORCE ROW LEVEL SECURITY;
ALTER TABLE public.subscription_idempotency_operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscription_idempotency_operations FORCE ROW LEVEL SECURITY;

CREATE POLICY "Leaders can manage tribe payment integrations"
ON public.tribe_payment_integrations
FOR ALL
USING (public.can_manage_tribe_subscription_prices(tribe_id))
WITH CHECK (
  connected_by = public.current_app_user_id()
  AND public.can_manage_tribe_subscription_prices(tribe_id)
);

CREATE POLICY "Authenticated checkout can read tribe payment integrations"
ON public.tribe_payment_integrations
FOR SELECT
USING (
  public.can_manage_tribe_subscription_prices(tribe_id)
  OR public.is_mercado_pago_webhook_verified()
  OR (
    public.current_app_user_id() <> ''
    AND nullif(
      current_setting('app.subscription_checkout_tribe_id', true),
      ''
    )::uuid = tribe_id
  )
);

CREATE POLICY "Subscription admins can read tribe prices"
ON public.tribe_subscription_prices
FOR SELECT
USING (public.can_view_tribe_subscription_prices(tribe_id));

CREATE POLICY "Authenticated users can read current active tribe prices"
ON public.tribe_subscription_prices
FOR SELECT
USING (
  public.current_app_user_id() <> ''
  AND status = 'active'
  AND is_current = true
);

CREATE POLICY "Leaders can create tribe prices"
ON public.tribe_subscription_prices
FOR INSERT
WITH CHECK (
  created_by = public.current_app_user_id()
  AND public.can_manage_tribe_subscription_prices(tribe_id)
);

CREATE POLICY "Leaders can update tribe prices"
ON public.tribe_subscription_prices
FOR UPDATE
USING (public.can_manage_tribe_subscription_prices(tribe_id))
WITH CHECK (public.can_manage_tribe_subscription_prices(tribe_id));

CREATE POLICY "Members can read own subscription rows"
ON public.tribe_member_subscriptions
FOR SELECT
USING (
  user_id = public.current_app_user_id()
  OR public.can_view_tribe_subscription_prices(tribe_id)
  OR public.is_mercado_pago_webhook_verified()
);

CREATE POLICY "Members can create own pending subscription rows"
ON public.tribe_member_subscriptions
FOR INSERT
WITH CHECK (
  user_id = public.current_app_user_id()
  AND status = 'pending'
);

CREATE POLICY "Members can update own payment subscription rows"
ON public.tribe_member_subscriptions
FOR UPDATE
USING (
  user_id = public.current_app_user_id()
  OR public.is_mercado_pago_webhook_verified()
)
WITH CHECK (
  user_id = public.current_app_user_id()
  OR public.is_mercado_pago_webhook_verified()
);

CREATE POLICY "Verified Mercado Pago webhooks can update paid memberships"
ON public.tribe_members
FOR UPDATE
USING (public.is_mercado_pago_webhook_verified())
WITH CHECK (
  public.is_mercado_pago_webhook_verified()
  AND status IN ('active', 'blocked')
);

CREATE POLICY "Authenticated users can create paid pending memberships"
ON public.tribe_members
FOR INSERT
WITH CHECK (
  user_id = public.current_app_user_id()
  AND role = 'tribemate'
  AND status = 'blocked'
  AND EXISTS (
    SELECT 1
    FROM public.tribe_subscription_prices
    WHERE tribe_subscription_prices.tribe_id = tribe_members.tribe_id
      AND tribe_subscription_prices.status = 'active'
      AND tribe_subscription_prices.is_current = true
  )
);

CREATE POLICY "Members can read own idempotency operations"
ON public.subscription_idempotency_operations
FOR SELECT
USING (
  user_id = public.current_app_user_id()
  OR public.can_manage_tribe_subscription_prices(tribe_id)
);

CREATE POLICY "Members can create own idempotency operations"
ON public.subscription_idempotency_operations
FOR INSERT
WITH CHECK (
  user_id = public.current_app_user_id()
  OR public.can_manage_tribe_subscription_prices(tribe_id)
  OR public.is_mercado_pago_webhook_verified()
);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    GRANT SELECT, INSERT, UPDATE ON public.tribe_payment_integrations TO authenticated;
    GRANT SELECT, INSERT, UPDATE ON public.tribe_subscription_prices TO authenticated;
    GRANT SELECT, INSERT, UPDATE ON public.tribe_member_subscriptions TO authenticated;
    GRANT SELECT, INSERT ON public.subscription_idempotency_operations TO authenticated;
    GRANT EXECUTE ON FUNCTION public.can_view_tribe_subscription_prices(uuid) TO authenticated;
    GRANT EXECUTE ON FUNCTION public.can_manage_tribe_subscription_prices(uuid) TO authenticated;
    GRANT EXECUTE ON FUNCTION public.is_mercado_pago_webhook_verified() TO authenticated;
  END IF;
END;
$$;

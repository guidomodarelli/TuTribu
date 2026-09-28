-- Legacy entry paths are scoped to the membership product and closed in
-- academy mode, where the only entry is the basic academy admission.
--
-- - Paid open join and its offer only consider the current MEMBERSHIP price;
--   an academy price never becomes a membership checkout (AC-37).
-- - In academy mode the legacy paid open join and the free open join are
--   closed: a historical path cannot skip the new eligibility (AC-38).
-- - tribe_academy_admission_id_by_slug resolves the tribe for the basic
--   academy admission (admission_enabled, not conduct blocked). It exposes only
--   the tribe id, never the private tribe row.
-- - tribe_academy_public_offer(slug) returns the minimum public offer data a
--   visitor needs (title, description, benefits, admission flag and the
--   current academy price), without internal ids.

CREATE OR REPLACE FUNCTION public.can_open_join_tribe_paid_plan(
  target_tribe_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    EXISTS (
      SELECT 1
      FROM public.tribes
      INNER JOIN public.tribe_subscription_prices
        ON tribe_subscription_prices.tribe_id = tribes.id
      WHERE tribes.id = target_tribe_id
        AND tribes.free_join_is_current = false
        AND tribe_subscription_prices.product_key = 'membership'
        AND tribe_subscription_prices.status = 'active'
        AND tribe_subscription_prices.is_current = true
        AND tribe_subscription_prices.mercado_pago_preapproval_plan_id IS NOT NULL
    )
    AND NOT public.tribe_uses_academy_access(target_tribe_id)
    AND NOT EXISTS (
      SELECT 1
      FROM public.tribe_members
      WHERE tribe_members.tribe_id = target_tribe_id
        AND tribe_members.user_id = public.current_app_user_id()
        AND tribe_members.status = 'blocked'
        AND tribe_members.status_reason = 'conduct_blocked'
    );
$$;

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
    AND NOT public.tribe_uses_academy_access(tribes.id)
    AND tribe_subscription_prices.product_key = 'membership'
    AND tribe_subscription_prices.status = 'active'
    AND tribe_subscription_prices.is_current = true
    AND tribe_subscription_prices.mercado_pago_preapproval_plan_id IS NOT NULL
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.can_open_join_tribe_free(target_tribe_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    EXISTS (
      SELECT 1
      FROM public.tribes
      WHERE tribes.id = target_tribe_id
        AND tribes.free_join_is_current = true
        AND tribes.open_free_join_enabled = true
    )
    AND NOT public.tribe_uses_academy_access(target_tribe_id)
    AND NOT EXISTS (
      SELECT 1
      FROM public.tribe_members
      WHERE tribe_members.tribe_id = target_tribe_id
        AND tribe_members.user_id = public.current_app_user_id()
        AND tribe_members.status = 'blocked'
        AND tribe_members.status_reason = 'conduct_blocked'
    );
$$;

CREATE OR REPLACE FUNCTION public.tribe_academy_admission_id_by_slug(
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
  INNER JOIN public.tribe_academy_settings
    ON tribe_academy_settings.tribe_id = tribes.id
  WHERE tribes.slug = lower(btrim(target_tribe_slug))
    AND tribe_academy_settings.access_model = 'academy'
    AND tribe_academy_settings.admission_enabled = true
    AND public.current_app_user_id() IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM public.tribe_members
      WHERE tribe_members.tribe_id = tribes.id
        AND tribe_members.user_id = public.current_app_user_id()
        AND tribe_members.status = 'blocked'
        AND tribe_members.status_reason = 'conduct_blocked'
    )
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.tribe_academy_public_offer(target_tribe_slug text)
RETURNS TABLE (
  tribe_name text,
  title text,
  description text,
  benefits jsonb,
  offer_version integer,
  admission_enabled boolean,
  sales_enabled boolean,
  price_amount_cents integer,
  price_currency text,
  price_frequency text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    tribes.name,
    tribe_academy_settings.title,
    tribe_academy_settings.description,
    tribe_academy_settings.benefits,
    tribe_academy_settings.offer_version,
    tribe_academy_settings.admission_enabled,
    tribe_academy_settings.sales_enabled,
    academy_price.amount_cents,
    academy_price.currency,
    academy_price.frequency
  FROM public.tribes
  INNER JOIN public.tribe_academy_settings
    ON tribe_academy_settings.tribe_id = tribes.id
  LEFT JOIN LATERAL (
    SELECT
      tribe_subscription_prices.amount_cents,
      tribe_subscription_prices.currency,
      tribe_subscription_prices.frequency
    FROM public.tribe_subscription_prices
    WHERE tribe_subscription_prices.tribe_id = tribes.id
      AND tribe_subscription_prices.product_key = 'academy'
      AND tribe_subscription_prices.status = 'active'
      AND tribe_subscription_prices.is_current = true
      AND tribe_subscription_prices.mercado_pago_preapproval_plan_id IS NOT NULL
    LIMIT 1
  ) AS academy_price ON true
  WHERE tribes.slug = lower(btrim(target_tribe_slug))
    AND tribe_academy_settings.access_model = 'academy'
  LIMIT 1;
$$;

-- Defense in depth for request roles: basic academy admission INSERT.
DROP POLICY IF EXISTS "Authenticated users can join academy tribes as basic members"
ON public.tribe_members;
CREATE POLICY "Authenticated users can join academy tribes as basic members"
ON public.tribe_members
FOR INSERT
WITH CHECK (
  user_id = public.current_app_user_id()
  AND role = 'tribemate'
  AND status = 'active'
  AND status_reason = 'none'
  AND joined_via = 'academy_admission'
  AND joined_via_invitation_id IS NULL
  AND tribe_id = public.tribe_academy_admission_id_by_slug(
    (SELECT tribes.slug FROM public.tribes WHERE tribes.id = tribe_members.tribe_id)
  )
);

REVOKE ALL ON FUNCTION public.tribe_academy_admission_id_by_slug(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.tribe_academy_public_offer(text) FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    GRANT EXECUTE ON FUNCTION public.tribe_academy_admission_id_by_slug(text) TO authenticated;
    GRANT EXECUTE ON FUNCTION public.tribe_academy_public_offer(text) TO authenticated;
  END IF;
END $$;

ALTER TABLE public.tribe_invitations
  ADD COLUMN IF NOT EXISTS channel text;

ALTER TABLE public.tribe_invitations
  ADD COLUMN IF NOT EXISTS campaign_name text;

ALTER TABLE public.tribe_invitations
  ADD COLUMN IF NOT EXISTS referrer_handle text;

ALTER TABLE public.tribe_invitations
  DROP CONSTRAINT IF EXISTS tribe_invitations_channel_check;

ALTER TABLE public.tribe_invitations
  ADD CONSTRAINT tribe_invitations_channel_check
  CHECK (
    channel IS NULL
    OR channel IN ('instagram', 'youtube', 'tiktok', 'whatsapp', 'direct', 'other')
  );

ALTER TABLE public.tribe_members
  ADD COLUMN IF NOT EXISTS joined_via_invitation_id uuid
    REFERENCES public.tribe_invitations(id)
    ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_tribe_invitations_tribe_channel
  ON public.tribe_invitations(tribe_id, channel);

CREATE INDEX IF NOT EXISTS idx_tribe_members_joined_via_invitation
  ON public.tribe_members(joined_via_invitation_id);

CREATE OR REPLACE FUNCTION public.update_tribe_invitation_referral_metadata(
  target_invitation_id uuid,
  target_tribe_slug text,
  selected_channel text,
  selected_campaign_name text,
  selected_referrer_handle text
)
RETURNS TABLE (
  status text,
  id uuid,
  channel text,
  campaign_name text,
  referrer_handle text,
  created_at timestamptz,
  created_by text,
  token_encrypted text,
  subscription_association_type text,
  subscription_price_id uuid
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH target_tribe AS (
    SELECT tribes.id
    FROM public.tribes
    WHERE tribes.slug = target_tribe_slug
    LIMIT 1
  ),
  target_invitation AS (
    SELECT tribe_invitations.id, tribe_invitations.tribe_id
    FROM public.tribe_invitations
    INNER JOIN target_tribe
      ON target_tribe.id = tribe_invitations.tribe_id
    WHERE tribe_invitations.id = target_invitation_id
      AND tribe_invitations.status = 'active'
    LIMIT 1
  ),
  updated_invitation AS (
    UPDATE public.tribe_invitations
    SET
      channel = selected_channel,
      campaign_name = selected_campaign_name,
      referrer_handle = selected_referrer_handle
    FROM target_invitation
    WHERE tribe_invitations.id = target_invitation.id
      AND public.can_manage_tribe_invitations(tribe_invitations.tribe_id)
    RETURNING
      tribe_invitations.id,
      tribe_invitations.channel,
      tribe_invitations.campaign_name,
      tribe_invitations.referrer_handle,
      tribe_invitations.created_at,
      tribe_invitations.created_by,
      tribe_invitations.token_encrypted,
      tribe_invitations.subscription_association_type,
      tribe_invitations.subscription_price_id
  )
  SELECT
    CASE
      WHEN EXISTS (SELECT 1 FROM updated_invitation) THEN 'updated'
      WHEN NOT EXISTS (SELECT 1 FROM target_tribe) THEN 'not_found'
      WHEN NOT EXISTS (SELECT 1 FROM target_invitation) THEN 'not_found'
      ELSE 'forbidden'
    END AS status,
    updated_invitation.id,
    updated_invitation.channel,
    updated_invitation.campaign_name,
    updated_invitation.referrer_handle,
    updated_invitation.created_at,
    updated_invitation.created_by,
    updated_invitation.token_encrypted,
    updated_invitation.subscription_association_type,
    updated_invitation.subscription_price_id
  FROM (SELECT 1) result
  LEFT JOIN updated_invitation
    ON true;
$$;

CREATE OR REPLACE FUNCTION public.get_tribe_invitation_conversion_metrics(
  target_tribe_slug text
)
RETURNS TABLE (
  invitation_id uuid,
  channel text,
  campaign_name text,
  referrer_handle text,
  clicks integer,
  signups bigint,
  paid_active bigint,
  revenue_cents numeric,
  payment_integration_id uuid,
  mercado_pago_account_label text,
  mercado_pago_account_email text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH target_tribe AS (
    SELECT tribes.id
    FROM public.tribes
    WHERE tribes.slug = target_tribe_slug
    LIMIT 1
  )
  SELECT
    tribe_invitations.id AS invitation_id,
    tribe_invitations.channel,
    tribe_invitations.campaign_name,
    tribe_invitations.referrer_handle,
    NULL::integer AS clicks,
    count(DISTINCT tribe_members.id) AS signups,
    count(DISTINCT active_subscriptions.id) AS paid_active,
    coalesce(
      sum(
        coalesce(
          active_subscriptions.price_snapshot_amount_cents,
          tribe_subscription_prices.amount_cents,
          0
        )
      ),
      0
    ) AS revenue_cents,
    coalesce(
      active_subscriptions.payment_integration_id,
      tribe_subscription_prices.payment_integration_id
    ) AS payment_integration_id,
    tribe_payment_integrations.account_label AS mercado_pago_account_label,
    tribe_payment_integrations.provider_account_email AS mercado_pago_account_email
  FROM public.tribe_invitations
  INNER JOIN target_tribe
    ON target_tribe.id = tribe_invitations.tribe_id
  LEFT JOIN public.tribe_members
    ON tribe_members.joined_via_invitation_id = tribe_invitations.id
    AND tribe_members.tribe_id = target_tribe.id
  LEFT JOIN public.tribe_member_subscriptions active_subscriptions
    ON active_subscriptions.tribe_id = tribe_members.tribe_id
    AND active_subscriptions.user_id = tribe_members.user_id
    AND active_subscriptions.status = 'active'
  LEFT JOIN public.tribe_subscription_prices
    ON tribe_subscription_prices.id = active_subscriptions.price_id
  LEFT JOIN public.tribe_payment_integrations
    ON tribe_payment_integrations.id = coalesce(
      active_subscriptions.payment_integration_id,
      tribe_subscription_prices.payment_integration_id
    )
    AND tribe_payment_integrations.tribe_id = target_tribe.id
  WHERE tribe_invitations.status IN ('active', 'revoked')
    AND public.can_manage_tribe_invitations(target_tribe.id)
  GROUP BY
    tribe_invitations.id,
    tribe_invitations.channel,
    tribe_invitations.campaign_name,
    tribe_invitations.referrer_handle,
    coalesce(
      active_subscriptions.payment_integration_id,
      tribe_subscription_prices.payment_integration_id
    ),
    tribe_payment_integrations.account_label,
    tribe_payment_integrations.provider_account_email
  ORDER BY tribe_invitations.created_at DESC;
$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    GRANT UPDATE (channel, campaign_name, referrer_handle)
      ON public.tribe_invitations TO authenticated;
    GRANT UPDATE (joined_via_invitation_id)
      ON public.tribe_members TO authenticated;
    GRANT EXECUTE ON FUNCTION public.update_tribe_invitation_referral_metadata(
      uuid,
      text,
      text,
      text,
      text
    ) TO authenticated;
    GRANT EXECUTE ON FUNCTION public.get_tribe_invitation_conversion_metrics(text)
      TO authenticated;
  END IF;
END;
$$;

DROP POLICY IF EXISTS "Invitation managers can update invitations"
  ON public.tribe_invitations;

CREATE POLICY "Invitation managers can update invitations"
ON public.tribe_invitations
FOR UPDATE
USING (public.can_manage_tribe_invitations(tribe_id))
WITH CHECK (
  status IN ('active', 'revoked')
  AND public.can_manage_tribe_invitations(tribe_id)
  AND (
    status = 'revoked'
    OR (
      subscription_association_type = 'current'
      AND subscription_price_id IS NULL
    )
    OR (
      subscription_association_type = 'free'
      AND subscription_price_id IS NULL
      AND (
        public.can_manage_tribe_subscription_prices(tribe_id)
        OR current_user = (
          SELECT pg_get_userbyid(pg_class.relowner)
          FROM pg_class
          WHERE pg_class.oid = 'public.tribe_invitations'::regclass
        )
      )
    )
    OR (
      subscription_association_type = 'specific'
      AND (
        public.can_manage_tribe_subscription_prices(tribe_id)
        OR current_user = (
          SELECT pg_get_userbyid(pg_class.relowner)
          FROM pg_class
          WHERE pg_class.oid = 'public.tribe_invitations'::regclass
        )
      )
      AND EXISTS (
        SELECT 1
        FROM public.tribe_subscription_prices
        WHERE tribe_subscription_prices.id = subscription_price_id
          AND tribe_subscription_prices.tribe_id = tribe_invitations.tribe_id
          AND tribe_subscription_prices.status = 'active'
          AND tribe_subscription_prices.mercado_pago_preapproval_plan_id IS NOT NULL
      )
    )
  )
);

ALTER POLICY "Authenticated users can create paid pending memberships"
ON public.tribe_members
WITH CHECK (
  user_id = public.current_app_user_id()
  AND role = 'tribemate'
  AND status = 'blocked'
  AND status_reason = 'payment_blocked'
  AND (
    joined_via_invitation_id IS NULL
    OR EXISTS (
      SELECT 1
      FROM public.tribe_invitations
      WHERE tribe_invitations.id = joined_via_invitation_id
        AND tribe_invitations.tribe_id = tribe_members.tribe_id
        AND tribe_invitations.token_hash = nullif(
          current_setting('app.current_invitation_hash', true),
          ''
        )
        AND tribe_invitations.status = 'active'
    )
  )
  AND EXISTS (
    SELECT 1
    FROM public.tribe_invitations
    WHERE tribe_invitations.tribe_id = tribe_members.tribe_id
      AND tribe_invitations.token_hash = nullif(
        current_setting('app.current_invitation_hash', true),
        ''
      )
      AND tribe_invitations.status = 'active'
      AND (
        (
          tribe_invitations.subscription_association_type = 'current'
          AND EXISTS (
            SELECT 1
            FROM public.tribe_subscription_prices
            WHERE tribe_subscription_prices.tribe_id = tribe_members.tribe_id
              AND tribe_subscription_prices.status = 'active'
              AND tribe_subscription_prices.is_current = true
              AND tribe_subscription_prices.mercado_pago_preapproval_plan_id IS NOT NULL
          )
        )
        OR (
          tribe_invitations.subscription_association_type = 'specific'
          AND EXISTS (
            SELECT 1
            FROM public.tribe_subscription_prices
            WHERE tribe_subscription_prices.id = tribe_invitations.subscription_price_id
              AND tribe_subscription_prices.tribe_id = tribe_members.tribe_id
              AND tribe_subscription_prices.status = 'active'
              AND tribe_subscription_prices.mercado_pago_preapproval_plan_id IS NOT NULL
          )
        )
      )
  )
);

ALTER POLICY "Authenticated users can recover paid retry memberships"
ON public.tribe_members
USING (
  user_id = public.current_app_user_id()
  AND status = 'removed'
  AND status_reason = 'subscription_inactive'
)
WITH CHECK (
  user_id = public.current_app_user_id()
  AND role = 'tribemate'
  AND status = 'blocked'
  AND status_reason = 'payment_blocked'
  AND (
    joined_via_invitation_id IS NULL
    OR nullif(
      current_setting('app.current_invitation_hash', true),
      ''
    ) IS NULL
    OR EXISTS (
      SELECT 1
      FROM public.tribe_invitations
      WHERE tribe_invitations.id = joined_via_invitation_id
        AND tribe_invitations.tribe_id = tribe_members.tribe_id
        AND tribe_invitations.token_hash = nullif(
          current_setting('app.current_invitation_hash', true),
          ''
        )
        AND tribe_invitations.status = 'active'
    )
  )
  AND EXISTS (
    SELECT 1
    FROM public.tribe_subscription_prices
    WHERE tribe_subscription_prices.tribe_id = tribe_members.tribe_id
      AND tribe_subscription_prices.status = 'active'
      AND tribe_subscription_prices.mercado_pago_preapproval_plan_id IS NOT NULL
      AND (
        tribe_subscription_prices.is_current = true
        OR EXISTS (
          SELECT 1
          FROM public.tribe_invitations
          WHERE tribe_invitations.tribe_id = tribe_members.tribe_id
            AND tribe_invitations.token_hash = nullif(
              current_setting('app.current_invitation_hash', true),
              ''
            )
            AND tribe_invitations.status = 'active'
            AND tribe_invitations.subscription_association_type = 'specific'
            AND tribe_invitations.subscription_price_id = tribe_subscription_prices.id
        )
      )
  )
);

DROP POLICY IF EXISTS "Authenticated users can update pending invitation attribution"
ON public.tribe_members;

CREATE POLICY "Authenticated users can update pending invitation attribution"
ON public.tribe_members
FOR UPDATE
USING (
  user_id = public.current_app_user_id()
  AND role = 'tribemate'
  AND status = 'blocked'
  AND status_reason = 'payment_blocked'
)
WITH CHECK (
  user_id = public.current_app_user_id()
  AND role = 'tribemate'
  AND status = 'blocked'
  AND status_reason = 'payment_blocked'
  AND EXISTS (
    SELECT 1
    FROM public.tribe_invitations
    WHERE tribe_invitations.id = joined_via_invitation_id
      AND tribe_invitations.tribe_id = tribe_members.tribe_id
      AND tribe_invitations.token_hash = nullif(
        current_setting('app.current_invitation_hash', true),
        ''
      )
      AND tribe_invitations.status = 'active'
  )
);

DROP POLICY IF EXISTS "Authenticated users can accept active invitations"
ON public.tribe_members;

CREATE POLICY "Authenticated users can accept active invitations"
ON public.tribe_members
FOR INSERT
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
      AND tribe_invitations.status = 'active'
      AND tribe_invitations.token_hash = nullif(
        current_setting('app.current_invitation_hash', true),
        ''
      )
      AND (
        joined_via_invitation_id IS NULL
        OR joined_via_invitation_id = tribe_invitations.id
      )
      AND (
        tribe_invitations.subscription_association_type = 'free'
        OR (
          tribe_invitations.subscription_association_type = 'current'
          AND tribes.free_join_is_current = true
        )
      )
  )
);

DROP POLICY IF EXISTS "Authenticated users can activate own free invitation memberships"
ON public.tribe_members;

CREATE POLICY "Authenticated users can activate own free invitation memberships"
ON public.tribe_members
FOR UPDATE
USING (
  user_id = public.current_app_user_id()
  AND (
    (
      status = 'blocked'
      AND status_reason = 'payment_blocked'
    )
    OR (
      status = 'removed'
      AND status_reason = 'subscription_inactive'
    )
  )
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
      AND tribe_invitations.status = 'active'
      AND tribe_invitations.token_hash = nullif(
        current_setting('app.current_invitation_hash', true),
        ''
      )
      AND (
        joined_via_invitation_id IS NULL
        OR joined_via_invitation_id = tribe_invitations.id
      )
      AND (
        tribe_invitations.subscription_association_type = 'free'
        OR (
          tribe_invitations.subscription_association_type = 'current'
          AND tribes.free_join_is_current = true
        )
      )
  )
);

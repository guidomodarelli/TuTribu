ALTER TABLE public.tribe_invitations
  ADD COLUMN IF NOT EXISTS subscription_association_type text NOT NULL DEFAULT 'current';

ALTER TABLE public.tribe_invitations
  ADD COLUMN IF NOT EXISTS subscription_price_id uuid
    REFERENCES public.tribe_subscription_prices(id);

ALTER TABLE public.tribe_invitations
  DROP CONSTRAINT IF EXISTS tribe_invitations_subscription_association_check;

ALTER TABLE public.tribe_invitations
  ADD CONSTRAINT tribe_invitations_subscription_association_check
  CHECK (
    (subscription_association_type = 'specific' AND subscription_price_id IS NOT NULL)
    OR (
      subscription_association_type IN ('current', 'free')
      AND subscription_price_id IS NULL
    )
  );

CREATE INDEX IF NOT EXISTS idx_tribe_invitations_subscription_price_id
  ON public.tribe_invitations(subscription_price_id)
  WHERE subscription_price_id IS NOT NULL;

ALTER POLICY "Members can create own pending subscription rows"
ON public.tribe_member_subscriptions
WITH CHECK (
  user_id = public.current_app_user_id()
  AND status = 'pending'
  AND EXISTS (
    SELECT 1
    FROM public.tribe_subscription_prices
    WHERE tribe_subscription_prices.id = tribe_member_subscriptions.price_id
      AND tribe_subscription_prices.tribe_id = tribe_member_subscriptions.tribe_id
      AND tribe_subscription_prices.status = 'active'
      AND tribe_subscription_prices.mercado_pago_preapproval_plan_id IS NOT NULL
      AND (
        (
          tribe_subscription_prices.is_current = true
          AND (
            EXISTS (
              SELECT 1
              FROM public.tribe_invitations
              WHERE tribe_invitations.tribe_id = tribe_member_subscriptions.tribe_id
                AND tribe_invitations.token_hash = nullif(
                  current_setting('app.current_invitation_hash', true),
                  ''
                )
                AND tribe_invitations.status = 'active'
                AND tribe_invitations.subscription_association_type = 'current'
            )
            OR EXISTS (
              SELECT 1
              FROM public.tribe_members
              WHERE tribe_members.tribe_id = tribe_member_subscriptions.tribe_id
                AND tribe_members.user_id = public.current_app_user_id()
                AND (
                  (
                    tribe_members.status = 'blocked'
                    AND tribe_members.status_reason = 'payment_blocked'
                  )
                  OR (
                    tribe_members.status = 'removed'
                    AND tribe_members.status_reason = 'subscription_inactive'
                  )
                )
            )
          )
        )
        OR EXISTS (
          SELECT 1
          FROM public.tribe_invitations
          WHERE tribe_invitations.tribe_id = tribe_member_subscriptions.tribe_id
            AND tribe_invitations.token_hash = nullif(
              current_setting('app.current_invitation_hash', true),
              ''
            )
            AND tribe_invitations.status = 'active'
            AND tribe_invitations.subscription_association_type = 'specific'
            AND tribe_invitations.subscription_price_id = tribe_member_subscriptions.price_id
        )
      )
  )
);

DROP POLICY IF EXISTS "Authenticated users can read specific invitation prices"
ON public.tribe_subscription_prices;

CREATE POLICY "Authenticated users can read specific invitation prices"
ON public.tribe_subscription_prices
FOR SELECT
USING (
  public.current_app_user_id() <> ''
  AND tribe_subscription_prices.status = 'active'
  AND tribe_subscription_prices.mercado_pago_preapproval_plan_id IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM public.tribe_invitations
    WHERE tribe_invitations.tribe_id = tribe_subscription_prices.tribe_id
      AND tribe_invitations.token_hash = nullif(
        current_setting('app.current_invitation_hash', true),
        ''
      )
      AND tribe_invitations.status = 'active'
      AND tribe_invitations.subscription_association_type = 'specific'
      AND tribe_invitations.subscription_price_id = tribe_subscription_prices.id
  )
);

ALTER POLICY "Authenticated users can create paid pending memberships"
ON public.tribe_members
WITH CHECK (
  user_id = public.current_app_user_id()
  AND role = 'tribemate'
  AND status = 'blocked'
  AND status_reason = 'payment_blocked'
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

DROP POLICY IF EXISTS "Authenticated users can activate own free invitation membership"
ON public.tribe_members;

DROP POLICY IF EXISTS "Authenticated users can activate own free invitation memberships"
ON public.tribe_members;

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
        tribe_invitations.subscription_association_type = 'free'
        OR (
          tribe_invitations.subscription_association_type = 'current'
          AND tribes.free_join_is_current = true
        )
      )
  )
);

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
      AND tribe_invitations.status = 'active'
      AND tribe_invitations.token_hash = nullif(
        current_setting('app.current_invitation_hash', true),
        ''
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

DROP POLICY IF EXISTS "Invitation managers can revoke invitations"
  ON public.tribe_invitations;

DROP POLICY IF EXISTS "Invitation managers can create invitations"
  ON public.tribe_invitations;

CREATE POLICY "Invitation managers can create invitations"
ON public.tribe_invitations
FOR INSERT
WITH CHECK (
  created_by = public.current_app_user_id()
  AND status = 'active'
  AND public.can_manage_tribe_invitations(tribe_id)
  AND (
    subscription_association_type = 'current'
    OR public.can_manage_tribe_subscription_prices(tribe_id)
  )
  AND (
    subscription_association_type <> 'specific'
    OR EXISTS (
      SELECT 1
      FROM public.tribe_subscription_prices
      WHERE tribe_subscription_prices.id = subscription_price_id
        AND tribe_subscription_prices.tribe_id = tribe_invitations.tribe_id
        AND tribe_subscription_prices.status = 'active'
        AND tribe_subscription_prices.mercado_pago_preapproval_plan_id IS NOT NULL
    )
  )
);

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
    OR subscription_association_type = 'current'
    OR public.can_manage_tribe_subscription_prices(tribe_id)
  )
  AND (
    status = 'revoked'
    OR subscription_association_type <> 'specific'
    OR EXISTS (
      SELECT 1
      FROM public.tribe_subscription_prices
      WHERE tribe_subscription_prices.id = subscription_price_id
        AND tribe_subscription_prices.tribe_id = tribe_invitations.tribe_id
        AND tribe_subscription_prices.status = 'active'
        AND tribe_subscription_prices.mercado_pago_preapproval_plan_id IS NOT NULL
    )
  )
);

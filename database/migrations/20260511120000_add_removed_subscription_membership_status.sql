ALTER TABLE public.tribe_members
DROP CONSTRAINT IF EXISTS tribe_members_status_check;

ALTER TABLE public.tribe_members
ADD CONSTRAINT tribe_members_status_check
CHECK (status IN ('active', 'muted', 'blocked', 'removed'));

ALTER TABLE public.tribe_members
DROP CONSTRAINT IF EXISTS tribe_members_status_reason_check;

ALTER TABLE public.tribe_members
ADD CONSTRAINT tribe_members_status_reason_check
CHECK (status_reason IN ('none', 'conduct_blocked', 'payment_blocked', 'subscription_inactive'));

DROP POLICY IF EXISTS "Tribemates can read own tribes"
ON public.tribes;

CREATE POLICY "Tribemates can read own tribes"
ON public.tribes
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.tribe_members
    WHERE tribe_members.tribe_id = tribes.id
      AND tribe_members.user_id = public.current_app_user_id()
      AND tribe_members.status IN ('active', 'muted')
  )
);

DROP INDEX IF EXISTS public.tribe_member_subscriptions_active_key;

CREATE UNIQUE INDEX IF NOT EXISTS tribe_member_subscriptions_active_key
ON public.tribe_member_subscriptions(tribe_id, user_id)
WHERE status IN ('active', 'pending', 'grace_period', 'past_due', 'payment_blocked', 'paused');

DROP POLICY IF EXISTS "Verified Mercado Pago webhooks can update paid memberships"
ON public.tribe_members;

CREATE POLICY "Verified Mercado Pago webhooks can update paid memberships"
ON public.tribe_members
FOR UPDATE
USING (public.is_mercado_pago_webhook_verified())
WITH CHECK (
  public.is_mercado_pago_webhook_verified()
  AND status IN ('active', 'blocked', 'removed')
  AND status_reason IN ('none', 'payment_blocked', 'subscription_inactive')
);

DO $$
DECLARE
  forced_rls_table_name text;
  enabled_rls_table_name text;
  protected_table regclass;
BEGIN
  FOREACH forced_rls_table_name IN ARRAY ARRAY[
    'public.tribe_creator_whitelist',
    'public.tribes',
    'public.tribe_channels',
    'public.tribe_invitations',
    'public.messages',
    'public.message_replies',
    'public.message_reactions',
    'public.message_pins',
    'public.message_polls',
    'public.message_poll_options',
    'public.message_poll_votes',
    'public.events',
    'public.tribe_payment_integrations',
    'public.tribe_subscription_prices',
    'public.tribe_member_subscriptions',
    'public.subscription_idempotency_operations'
  ] LOOP
    protected_table := to_regclass(forced_rls_table_name);

    IF protected_table IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', protected_table);
      EXECUTE format('ALTER TABLE %s FORCE ROW LEVEL SECURITY', protected_table);
    END IF;
  END LOOP;

  FOREACH enabled_rls_table_name IN ARRAY ARRAY[
    'public.tribe_members'
  ] LOOP
    protected_table := to_regclass(enabled_rls_table_name);

    IF protected_table IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', protected_table);
      EXECUTE format('ALTER TABLE %s NO FORCE ROW LEVEL SECURITY', protected_table);
    END IF;
  END LOOP;
END
$$;

DROP POLICY IF EXISTS "Recoverable subscription members can read retry tribes"
ON public.tribes;

CREATE POLICY "Recoverable subscription members can read retry tribes"
ON public.tribes
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.tribe_members
    WHERE tribe_members.tribe_id = tribes.id
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
);

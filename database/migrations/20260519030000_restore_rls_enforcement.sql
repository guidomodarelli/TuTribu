DO $$
DECLARE
  protected_table_name text;
  protected_table regclass;
BEGIN
  FOREACH protected_table_name IN ARRAY ARRAY[
    'public.tribe_creator_whitelist',
    'public.tribes',
    'public.tribe_members',
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
    protected_table := to_regclass(protected_table_name);

    IF protected_table IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', protected_table);
      EXECUTE format('ALTER TABLE %s FORCE ROW LEVEL SECURITY', protected_table);
    END IF;
  END LOOP;
END
$$;

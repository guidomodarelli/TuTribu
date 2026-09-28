-- Self-service academy activation by the active tribe leader (Ajustes).
--
-- academy_activate_by_leader(slug, expected_config_version) switches a legacy
-- tribe to academy mode in ONE transaction, without the operator manifest:
-- - only an active leader of that tribe can run it (checked here against
--   app.current_user_id, with the leader membership locked FOR SHARE);
-- - every current active or muted member except the leader (who has the
--   administrative preview) keeps full access through an unbounded `legacy`
--   grant and keeps the drip origin of the membership (`migration_preserved`),
--   so nobody loses what they had; only people who join later start as basic;
-- - memberships, roles, moderation, prices and subscriptions are untouched
--   (existing membership subscriptions keep charging exactly as before);
-- - admissions and sales start closed; the leader opens them afterwards;
-- - the compare-and-swap on config_version rejects a stale request, and a
--   tribe already in academy mode returns `already_academy` without changes.
-- The operator procedure (academy_apply_cutover) stays available for tribes
-- that need per-member decisions.

CREATE OR REPLACE FUNCTION public.academy_activate_by_leader(
  target_tribe_slug text,
  expected_config_version integer
)
RETURNS text
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor_user_id text := public.current_app_user_id();
  target_tribe_id uuid;
  actor_role text;
  actor_status text;
  current_settings public.tribe_academy_settings%ROWTYPE;
  preserved_members integer;
BEGIN
  IF actor_user_id IS NULL THEN
    RETURN 'forbidden';
  END IF;

  SELECT tribes.id INTO target_tribe_id
  FROM public.tribes
  WHERE tribes.slug = lower(btrim(target_tribe_slug))
  FOR UPDATE;

  IF target_tribe_id IS NULL THEN
    RETURN 'not_found';
  END IF;

  SELECT tribe_members.role, tribe_members.status INTO actor_role, actor_status
  FROM public.tribe_members
  WHERE tribe_members.tribe_id = target_tribe_id
    AND tribe_members.user_id = actor_user_id
  FOR SHARE;

  IF actor_role IS DISTINCT FROM 'leader' OR actor_status IS DISTINCT FROM 'active' THEN
    RETURN 'forbidden';
  END IF;

  SELECT * INTO current_settings
  FROM public.tribe_academy_settings
  WHERE tribe_academy_settings.tribe_id = target_tribe_id
  FOR UPDATE;

  IF current_settings.access_model = 'academy' THEN
    RETURN 'already_academy';
  END IF;

  IF coalesce(current_settings.config_version, 0) <> expected_config_version THEN
    RETURN 'conflict';
  END IF;

  -- Freeze the current memberships while their rights are preserved.
  PERFORM 1
  FROM public.tribe_members
  WHERE tribe_members.tribe_id = target_tribe_id
  FOR SHARE;

  INSERT INTO public.member_access_grants (
    tribe_id, user_id, product_key, source_type, source_key, starts_at, ends_at, created_by
  )
  SELECT
    target_tribe_id,
    tribe_members.user_id,
    'academy',
    'legacy',
    'leader-activation:' || tribe_members.user_id,
    now(),
    NULL,
    actor_user_id
  FROM public.tribe_members
  WHERE tribe_members.tribe_id = target_tribe_id
    AND tribe_members.status IN ('active', 'muted')
    AND tribe_members.role <> 'leader'
  ON CONFLICT (tribe_id, product_key, source_type, source_key) DO NOTHING;
  GET DIAGNOSTICS preserved_members = ROW_COUNT;

  INSERT INTO public.member_product_enrollments (
    tribe_id, user_id, product_key, first_activated_at, activation_origin
  )
  SELECT
    target_tribe_id,
    tribe_members.user_id,
    'academy',
    tribe_members.created_at,
    'migration_preserved'
  FROM public.tribe_members
  WHERE tribe_members.tribe_id = target_tribe_id
    AND tribe_members.status IN ('active', 'muted')
    AND tribe_members.role <> 'leader'
  ON CONFLICT (tribe_id, user_id, product_key) DO NOTHING;

  INSERT INTO public.tribe_academy_settings (
    tribe_id, access_model, admission_enabled, sales_enabled, activated_at,
    activation_manifest_id, config_version, updated_by
  )
  VALUES (
    target_tribe_id, 'academy', false, false, now(), 'leader-activation', 1, actor_user_id
  )
  ON CONFLICT (tribe_id) DO UPDATE
  SET
    access_model = 'academy',
    admission_enabled = false,
    sales_enabled = false,
    activated_at = now(),
    activation_manifest_id = 'leader-activation',
    config_version = tribe_academy_settings.config_version + 1,
    updated_by = actor_user_id,
    updated_at = timezone('utc', now());

  INSERT INTO public.academy_audit_events (
    tribe_id, actor_user_id, action, entity_type, entity_id, from_state, to_state, reason
  )
  VALUES (
    target_tribe_id, actor_user_id, 'academy_activated_by_leader', 'tribe_academy_settings',
    target_tribe_id::text, 'legacy', 'academy',
    'preserved_members=' || preserved_members
  );

  RETURN 'activated';
END;
$$;

REVOKE EXECUTE ON FUNCTION public.academy_activate_by_leader(text, integer) FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    GRANT EXECUTE ON FUNCTION public.academy_activate_by_leader(text, integer) TO authenticated;
  END IF;
END $$;

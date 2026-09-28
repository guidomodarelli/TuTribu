-- Academy migration procedures (preflight + explicit cutover per tribe).
--
-- Both functions are owner-only (EXECUTE revoked from PUBLIC, never granted to
-- request roles): they run from the maintenance connection through
-- scripts/academy-cutover.mjs, never from a user request.
--
-- academy_preflight(slug) is read-only (dry-run). It classifies every member
-- and lists what the cutover would preserve and what blocks it, plus a
-- fingerprint of the membership/payment state the manifest must be built on.
--
-- academy_apply_cutover(slug, manifest) applies an approved manifest in ONE
-- transaction: any validation failure raises and nothing changes (the tribe
-- stays legacy). It never calls the payment provider, never reactivates a
-- blocked or removed membership, never grants anything that the manifest does
-- not list, and leaves admissions and sales closed. Running the same manifest
-- twice returns `already_applied` without touching grants or dates.

ALTER TABLE public.tribe_academy_settings
  ADD COLUMN IF NOT EXISTS activation_manifest_id text;

CREATE OR REPLACE FUNCTION public.academy_preflight(target_tribe_slug text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH target_tribe AS (
    SELECT tribes.id, tribes.slug
    FROM public.tribes
    WHERE tribes.slug = lower(btrim(target_tribe_slug))
  ),
  settings AS (
    SELECT tribe_academy_settings.*
    FROM public.tribe_academy_settings
    WHERE tribe_academy_settings.tribe_id = (SELECT id FROM target_tribe)
  ),
  member_rows AS (
    SELECT
      tribe_members.user_id,
      tribe_members.role,
      tribe_members.status,
      tribe_members.status_reason,
      tribe_members.joined_via,
      tribe_members.created_at,
      live_subscription.id AS subscription_id,
      live_subscription.status AS subscription_status,
      live_subscription.price_id AS subscription_price_id,
      live_subscription.mercado_pago_preapproval_id IS NOT NULL AS has_provider_link,
      live_subscription.current_period_end
    FROM public.tribe_members
    LEFT JOIN LATERAL (
      SELECT tribe_member_subscriptions.*
      FROM public.tribe_member_subscriptions
      WHERE tribe_member_subscriptions.tribe_id = tribe_members.tribe_id
        AND tribe_member_subscriptions.user_id = tribe_members.user_id
        AND tribe_member_subscriptions.product_key = 'membership'
        AND tribe_member_subscriptions.status IN (
          'active', 'pending', 'grace_period', 'past_due', 'payment_blocked', 'paused'
        )
      ORDER BY tribe_member_subscriptions.updated_at DESC
      LIMIT 1
    ) AS live_subscription ON true
    WHERE tribe_members.tribe_id = (SELECT id FROM target_tribe)
  ),
  classified AS (
    SELECT
      member_rows.*,
      CASE
        WHEN member_rows.status NOT IN ('active', 'muted') THEN 'excluded'
        WHEN member_rows.role IN ('leader', 'guardian') THEN 'staff'
        WHEN member_rows.subscription_status = 'active' AND member_rows.has_provider_link
          THEN 'paid_subscription'
        WHEN member_rows.subscription_status IS NOT NULL THEN 'ambiguous_payment'
        ELSE 'free_member'
      END AS classification
    FROM member_rows
  )
  SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM target_tribe) THEN
    jsonb_build_object('status', 'not_found')
  ELSE jsonb_build_object(
    'status', 'ok',
    'tribeSlug', (SELECT slug FROM target_tribe),
    'accessModel', coalesce((SELECT access_model FROM settings), 'legacy'),
    'expectedConfigVersion', coalesce((SELECT config_version FROM settings), 0),
    'activationManifestId', (SELECT activation_manifest_id FROM settings),
    'fingerprint', md5(coalesce((
      SELECT string_agg(
        concat_ws('|', user_id, role, status, status_reason, coalesce(subscription_status, '-')),
        ';' ORDER BY user_id
      )
      FROM classified
    ), '')),
    'members', jsonb_build_object(
      'byStatus', coalesce((
        SELECT jsonb_object_agg(status, total)
        FROM (SELECT status, count(*) AS total FROM member_rows GROUP BY status) AS counts
      ), '{}'::jsonb),
      'byClassification', coalesce((
        SELECT jsonb_object_agg(classification, total)
        FROM (SELECT classification, count(*) AS total FROM classified GROUP BY classification) AS counts
      ), '{}'::jsonb)
    ),
    'decisionsRequired', coalesce((
      SELECT jsonb_agg(
        jsonb_build_object(
          'userId', user_id,
          'classification', classification,
          'joinedVia', joined_via,
          'memberSince', created_at,
          'subscriptionStatus', subscription_status,
          'subscriptionPriceId', subscription_price_id,
          'currentPeriodEnd', current_period_end
        )
        ORDER BY classification, user_id
      )
      FROM classified
      WHERE classification IN ('paid_subscription', 'ambiguous_payment', 'free_member')
    ), '[]'::jsonb),
    'blockers', coalesce((
      SELECT jsonb_agg(jsonb_build_object('userId', user_id, 'reason', 'ambiguous_payment_data'))
      FROM classified
      WHERE classification = 'ambiguous_payment'
    ), '[]'::jsonb),
    'prices', coalesce((
      SELECT jsonb_agg(
        jsonb_build_object(
          'priceId', tribe_subscription_prices.id,
          'productKey', tribe_subscription_prices.product_key,
          'status', tribe_subscription_prices.status,
          'isCurrent', tribe_subscription_prices.is_current,
          'hasProviderPlan', tribe_subscription_prices.mercado_pago_preapproval_plan_id IS NOT NULL
        )
      )
      FROM public.tribe_subscription_prices
      WHERE tribe_subscription_prices.tribe_id = (SELECT id FROM target_tribe)
        AND tribe_subscription_prices.status IN ('active', 'paused')
    ), '[]'::jsonb),
    'paymentIntegrations', (
      SELECT count(*) FROM public.tribe_payment_integrations
      WHERE tribe_payment_integrations.tribe_id = (SELECT id FROM target_tribe)
    ),
    'activeInvitations', coalesce((
      SELECT jsonb_object_agg(subscription_association_type, total)
      FROM (
        SELECT subscription_association_type, count(*) AS total
        FROM public.tribe_invitations
        WHERE tribe_invitations.tribe_id = (SELECT id FROM target_tribe)
          AND tribe_invitations.status = 'active'
        GROUP BY subscription_association_type
      ) AS counts
    ), '{}'::jsonb),
    'courses', coalesce((
      SELECT jsonb_agg(
        jsonb_build_object(
          'courseId', courses.id,
          'title', courses.title,
          'accessRequirement', courses.access_requirement,
          'isActive', courses.is_active,
          'dripModules', (
            SELECT count(*) FROM public.course_modules
            WHERE course_modules.course_id = courses.id
              AND course_modules.unlock_after_days IS NOT NULL
          )
        )
        ORDER BY courses.sort_order
      )
      FROM public.courses
      WHERE courses.tribe_id = (SELECT id FROM target_tribe)
    ), '[]'::jsonb),
    'privateContent', jsonb_build_object(
      'messages', (SELECT count(*) FROM public.messages WHERE messages.tribe_id = (SELECT id FROM target_tribe)),
      'channels', (SELECT count(*) FROM public.tribe_channels WHERE tribe_channels.tribe_id = (SELECT id FROM target_tribe)),
      'events', (SELECT count(*) FROM public.events WHERE events.tribe_id = (SELECT id FROM target_tribe))
    ),
    'existingGrants', (
      SELECT count(*) FROM public.member_access_grants
      WHERE member_access_grants.tribe_id = (SELECT id FROM target_tribe)
    )
  ) END;
$$;

CREATE OR REPLACE FUNCTION public.academy_apply_cutover(
  target_tribe_slug text,
  manifest jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_tribe_id uuid;
  current_settings public.tribe_academy_settings%ROWTYPE;
  manifest_id text := nullif(btrim(manifest->>'manifestId'), '');
  expected_version integer := (manifest->>'expectedConfigVersion')::integer;
  expected_fingerprint text := manifest->>'fingerprint';
  default_free_decision text := coalesce(manifest->>'defaultFreeMemberDecision', '');
  report jsonb;
  member_record record;
  decision jsonb;
  decision_kind text;
  decision_ends_at timestamptz;
  granted_count integer := 0;
  reclassified_subscriptions integer := 0;
  academy_courses integer := 0;
  reclassified_prices integer := 0;
BEGIN
  IF manifest_id IS NULL OR expected_version IS NULL OR expected_fingerprint IS NULL THEN
    RAISE EXCEPTION 'academy cutover: manifest requires manifestId, expectedConfigVersion and fingerprint'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT tribes.id INTO target_tribe_id
  FROM public.tribes
  WHERE tribes.slug = lower(btrim(target_tribe_slug))
  FOR UPDATE;

  IF target_tribe_id IS NULL THEN
    RAISE EXCEPTION 'academy cutover: tribe not found' USING ERRCODE = 'no_data_found';
  END IF;

  SELECT * INTO current_settings
  FROM public.tribe_academy_settings
  WHERE tribe_academy_settings.tribe_id = target_tribe_id
  FOR UPDATE;

  IF current_settings.access_model = 'academy' THEN
    IF current_settings.activation_manifest_id = manifest_id THEN
      RETURN jsonb_build_object('status', 'already_applied', 'manifestId', manifest_id);
    END IF;

    RAISE EXCEPTION 'academy cutover: tribe already runs in academy mode with another manifest'
      USING ERRCODE = 'check_violation';
  END IF;

  IF coalesce(current_settings.config_version, 0) <> expected_version THEN
    RAISE EXCEPTION 'academy cutover: configuration changed since the preflight'
      USING ERRCODE = 'serialization_failure';
  END IF;

  -- Freeze existing memberships for the rest of the transaction so a
  -- concurrent change cannot slip between this check and the writes.
  PERFORM 1
  FROM public.tribe_members
  WHERE tribe_members.tribe_id = target_tribe_id
  FOR SHARE;

  report := public.academy_preflight(target_tribe_slug);

  IF report->>'fingerprint' IS DISTINCT FROM expected_fingerprint THEN
    RAISE EXCEPTION 'academy cutover: members or payments changed since the preflight'
      USING ERRCODE = 'serialization_failure';
  END IF;

  -- Validate every decision before writing anything.
  FOR member_record IN
    SELECT * FROM jsonb_to_recordset(report->'decisionsRequired')
      AS required(
        "userId" text,
        classification text,
        "subscriptionPriceId" uuid,
        "currentPeriodEnd" timestamptz
      )
  LOOP
    SELECT value INTO decision
    FROM jsonb_array_elements(coalesce(manifest->'members', '[]'::jsonb))
    WHERE value->>'userId' = member_record."userId"
    LIMIT 1;

    decision_kind := coalesce(
      decision->>'decision',
      CASE WHEN member_record.classification = 'free_member' THEN nullif(default_free_decision, '') END
    );

    IF decision_kind IS NULL THEN
      RAISE EXCEPTION 'academy cutover: missing decision for a % member', member_record.classification
        USING ERRCODE = 'check_violation';
    END IF;

    IF decision_kind NOT IN (
      'basic_only', 'preserve_unbounded', 'preserve_until', 'reclassify_subscription', 'approved_exception'
    ) THEN
      RAISE EXCEPTION 'academy cutover: unknown decision %', decision_kind
        USING ERRCODE = 'check_violation';
    END IF;

    IF member_record.classification = 'ambiguous_payment'
      AND decision_kind NOT IN ('approved_exception', 'basic_only') THEN
      RAISE EXCEPTION 'academy cutover: ambiguous payment data needs an approved exception'
        USING ERRCODE = 'check_violation';
    END IF;

    IF decision_kind = 'approved_exception'
      AND char_length(btrim(coalesce(decision->>'note', ''))) < 3 THEN
      RAISE EXCEPTION 'academy cutover: an approved exception requires a documented note'
        USING ERRCODE = 'check_violation';
    END IF;

    IF decision_kind = 'preserve_unbounded' AND member_record.classification <> 'free_member' THEN
      RAISE EXCEPTION 'academy cutover: only proven free historical rights can be unbounded'
        USING ERRCODE = 'check_violation';
    END IF;

    IF decision_kind IN ('preserve_until', 'approved_exception')
      AND ((decision->>'endsAt') IS NULL OR (decision->>'endsAt')::timestamptz <= now()) THEN
      RAISE EXCEPTION 'academy cutover: a bounded right needs a future endsAt'
        USING ERRCODE = 'check_violation';
    END IF;

    IF decision_kind = 'reclassify_subscription' AND (
      member_record.classification <> 'paid_subscription'
      OR (
        member_record."subscriptionPriceId" IS NOT NULL
        AND NOT coalesce(manifest->'academyPriceIds', '[]'::jsonb) ? member_record."subscriptionPriceId"::text
      )
    ) THEN
      RAISE EXCEPTION 'academy cutover: a reclassified subscription needs its price reclassified too'
        USING ERRCODE = 'check_violation';
    END IF;
  END LOOP;

  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements_text(coalesce(manifest->'academyCourseIds', '[]'::jsonb)) AS course_id
    WHERE NOT EXISTS (
      SELECT 1 FROM public.courses
      WHERE courses.id::text = course_id AND courses.tribe_id = target_tribe_id
    )
  ) THEN
    RAISE EXCEPTION 'academy cutover: a course does not belong to the tribe'
      USING ERRCODE = 'check_violation';
  END IF;

  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements_text(coalesce(manifest->'academyPriceIds', '[]'::jsonb)) AS price_id
    WHERE NOT EXISTS (
      SELECT 1 FROM public.tribe_subscription_prices
      WHERE tribe_subscription_prices.id::text = price_id
        AND tribe_subscription_prices.tribe_id = target_tribe_id
        AND tribe_subscription_prices.product_key = 'membership'
    )
  ) THEN
    RAISE EXCEPTION 'academy cutover: a price does not belong to the tribe or is not a membership price'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Writes (all or nothing).
  UPDATE public.courses
  SET access_requirement = 'academy', updated_at = timezone('utc', now())
  WHERE courses.tribe_id = target_tribe_id
    AND courses.id::text IN (
      SELECT jsonb_array_elements_text(coalesce(manifest->'academyCourseIds', '[]'::jsonb))
    );
  GET DIAGNOSTICS academy_courses = ROW_COUNT;

  -- A reclassified price must not remain "current" for the other product.
  UPDATE public.tribe_subscription_prices
  SET product_key = 'academy', is_current = false
  WHERE tribe_subscription_prices.tribe_id = target_tribe_id
    AND tribe_subscription_prices.id::text IN (
      SELECT jsonb_array_elements_text(coalesce(manifest->'academyPriceIds', '[]'::jsonb))
    );
  GET DIAGNOSTICS reclassified_prices = ROW_COUNT;

  FOR member_record IN
    SELECT * FROM jsonb_to_recordset(report->'decisionsRequired')
      AS required("userId" text, classification text, "currentPeriodEnd" timestamptz)
  LOOP
    SELECT value INTO decision
    FROM jsonb_array_elements(coalesce(manifest->'members', '[]'::jsonb))
    WHERE value->>'userId' = member_record."userId"
    LIMIT 1;

    decision_kind := coalesce(decision->>'decision', nullif(default_free_decision, ''));
    decision_ends_at := nullif(decision->>'endsAt', '')::timestamptz;

    IF decision_kind = 'reclassify_subscription' THEN
      -- The remote contract is kept (same provider id, integration and
      -- snapshot); paid coverage is rebuilt later from verified invoices.
      UPDATE public.tribe_member_subscriptions
      SET
        product_key = 'academy',
        price_snapshot_amount_cents = coalesce(
          tribe_member_subscriptions.price_snapshot_amount_cents,
          (SELECT amount_cents FROM public.tribe_subscription_prices WHERE id = tribe_member_subscriptions.price_id)
        ),
        price_snapshot_currency = coalesce(
          tribe_member_subscriptions.price_snapshot_currency,
          (SELECT currency FROM public.tribe_subscription_prices WHERE id = tribe_member_subscriptions.price_id)
        ),
        price_snapshot_frequency = coalesce(
          tribe_member_subscriptions.price_snapshot_frequency,
          (SELECT frequency FROM public.tribe_subscription_prices WHERE id = tribe_member_subscriptions.price_id)
        ),
        terms_accepted_at = coalesce(tribe_member_subscriptions.terms_accepted_at, tribe_member_subscriptions.created_at),
        offer_version_snapshot = coalesce(tribe_member_subscriptions.offer_version_snapshot, 1),
        updated_at = timezone('utc', now())
      WHERE tribe_member_subscriptions.tribe_id = target_tribe_id
        AND tribe_member_subscriptions.user_id = member_record."userId"
        AND tribe_member_subscriptions.product_key = 'membership'
        AND tribe_member_subscriptions.status = 'active';
      reclassified_subscriptions := reclassified_subscriptions + 1;

      -- Optional bridge until the verified invoices are reconciled.
      IF decision_ends_at IS NOT NULL AND decision_ends_at > now() THEN
        INSERT INTO public.member_access_grants (
          tribe_id, user_id, product_key, source_type, source_key, starts_at, ends_at
        )
        VALUES (
          target_tribe_id, member_record."userId", 'academy', 'legacy',
          'migration:' || manifest_id || ':' || member_record."userId", now(), decision_ends_at
        )
        ON CONFLICT (tribe_id, product_key, source_type, source_key) DO NOTHING;
        granted_count := granted_count + 1;
      END IF;
    ELSIF decision_kind IN ('preserve_unbounded', 'preserve_until', 'approved_exception') THEN
      INSERT INTO public.member_access_grants (
        tribe_id, user_id, product_key, source_type, source_key, starts_at, ends_at
      )
      VALUES (
        target_tribe_id,
        member_record."userId",
        'academy',
        'legacy',
        'migration:' || manifest_id || ':' || member_record."userId",
        now(),
        CASE WHEN decision_kind = 'preserve_unbounded' THEN NULL ELSE decision_ends_at END
      )
      ON CONFLICT (tribe_id, product_key, source_type, source_key) DO NOTHING;
      granted_count := granted_count + 1;
    END IF;

    IF decision_kind <> 'basic_only' THEN
      -- Preserve the drip origin the member already enjoyed.
      INSERT INTO public.member_product_enrollments (
        tribe_id, user_id, product_key, first_activated_at, activation_origin
      )
      SELECT target_tribe_id, member_record."userId", 'academy', tribe_members.created_at, 'migration_preserved'
      FROM public.tribe_members
      WHERE tribe_members.tribe_id = target_tribe_id
        AND tribe_members.user_id = member_record."userId"
      ON CONFLICT (tribe_id, user_id, product_key) DO NOTHING;
    END IF;

    INSERT INTO public.academy_audit_events (
      tribe_id, actor_user_id, subject_user_id, action, entity_type, entity_id, from_state, to_state, reason, correlation_id
    )
    VALUES (
      target_tribe_id, NULL, member_record."userId", 'academy_cutover_member_decision', 'tribe_member',
      member_record."userId", member_record.classification, decision_kind,
      left(decision->>'note', 500), manifest_id
    );
  END LOOP;

  INSERT INTO public.tribe_academy_settings (
    tribe_id, access_model, admission_enabled, sales_enabled, activated_at, activation_manifest_id, config_version
  )
  VALUES (target_tribe_id, 'academy', false, false, now(), manifest_id, 1)
  ON CONFLICT (tribe_id) DO UPDATE
  SET
    access_model = 'academy',
    admission_enabled = false,
    sales_enabled = false,
    activated_at = now(),
    activation_manifest_id = manifest_id,
    config_version = tribe_academy_settings.config_version + 1,
    updated_at = timezone('utc', now());

  INSERT INTO public.academy_audit_events (
    tribe_id, action, entity_type, entity_id, from_state, to_state, correlation_id
  )
  VALUES (
    target_tribe_id, 'academy_cutover_applied', 'tribe_academy_settings', target_tribe_id::text,
    'legacy', 'academy', manifest_id
  );

  RETURN jsonb_build_object(
    'status', 'applied',
    'manifestId', manifest_id,
    'academyCourses', academy_courses,
    'reclassifiedPrices', reclassified_prices,
    'reclassifiedSubscriptions', reclassified_subscriptions,
    'legacyGrants', granted_count
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.academy_preflight(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.academy_apply_cutover(text, jsonb) FROM PUBLIC;

-- Academy access model (expand only, nothing is activated).
--
-- - tribe_academy_settings: optional per-tribe academy mode. A tribe without a
--   row, or with access_model = 'legacy', keeps its current behavior.
-- - member_access_grants: sources of academy access (paid period, leader bonus,
--   preserved legacy right). Access exists while at least one non-revoked grant
--   covers now() with half-open [starts_at, ends_at) intervals.
-- - member_product_enrollments: first real academy activation per member and
--   product; it is the drip origin of academy courses and never resets.
-- - academy_audit_events: bounded audit trail of verification decisions,
--   grants, checkouts and configuration changes.
-- - Community boundary (RF-09): in academy mode the pre-existing private
--   community content (feed, channels, events, directory, notifications,
--   calendar feeds) requires academy access on top of the current membership
--   rules. Active leaders and guardians keep it to moderate.
--
-- Request roles only read their own rows; every write goes through the
-- repositories (runtime owner) that apply the business rules atomically, and
-- the owner exception keeps those writes working under FORCE RLS.

-- 1. Per-tribe academy configuration.
CREATE TABLE IF NOT EXISTS public.tribe_academy_settings (
  tribe_id uuid PRIMARY KEY REFERENCES public.tribes(id) ON DELETE CASCADE,
  access_model text NOT NULL DEFAULT 'legacy',
  admission_enabled boolean NOT NULL DEFAULT false,
  sales_enabled boolean NOT NULL DEFAULT false,
  title text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  benefits jsonb NOT NULL DEFAULT '[]'::jsonb,
  offer_version integer NOT NULL DEFAULT 1,
  config_version integer NOT NULL DEFAULT 1,
  activated_at timestamptz,
  updated_by text REFERENCES public."user"(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT tribe_academy_settings_access_model_check
    CHECK (access_model IN ('legacy', 'academy')),
  CONSTRAINT tribe_academy_settings_benefits_check
    CHECK (jsonb_typeof(benefits) = 'array' AND jsonb_array_length(benefits) <= 8),
  CONSTRAINT tribe_academy_settings_title_length_check
    CHECK (char_length(title) <= 120),
  CONSTRAINT tribe_academy_settings_description_length_check
    CHECK (char_length(description) <= 2000),
  CONSTRAINT tribe_academy_settings_versions_check
    CHECK (offer_version >= 1 AND config_version >= 1),
  -- Admissions and sales only make sense once the tribe runs in academy mode.
  CONSTRAINT tribe_academy_settings_legacy_closed_check
    CHECK (access_model = 'academy' OR (admission_enabled = false AND sales_enabled = false))
);

-- 2. Access grants. Bonus and revocation reasons are private leader notes, so
-- they live in academy_audit_events (leader-only) and never in the grant row
-- that the member can read.
CREATE TABLE IF NOT EXISTS public.member_access_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tribe_id uuid NOT NULL REFERENCES public.tribes(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES public."user"(id) ON DELETE CASCADE,
  product_key text NOT NULL,
  source_type text NOT NULL,
  source_key text NOT NULL,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz,
  revoked_at timestamptz,
  revoked_by text REFERENCES public."user"(id) ON DELETE SET NULL,
  created_by text REFERENCES public."user"(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT member_access_grants_product_key_check
    CHECK (product_key IN ('academy')),
  CONSTRAINT member_access_grants_source_type_check
    CHECK (source_type IN ('subscription_payment', 'manual_bonus', 'legacy')),
  CONSTRAINT member_access_grants_source_key_check
    CHECK (char_length(btrim(source_key)) BETWEEN 1 AND 200),
  CONSTRAINT member_access_grants_interval_check
    CHECK (ends_at IS NULL OR ends_at > starts_at),
  -- Only preserved legacy rights may be unbounded.
  CONSTRAINT member_access_grants_unbounded_legacy_check
    CHECK (ends_at IS NOT NULL OR source_type = 'legacy'),
  CONSTRAINT member_access_grants_revocation_check
    CHECK (revoked_at IS NULL OR revoked_at >= created_at)
);

-- One grant per business source: retries and concurrent deliveries collapse.
CREATE UNIQUE INDEX IF NOT EXISTS member_access_grants_source_key
ON public.member_access_grants(tribe_id, product_key, source_type, source_key);

CREATE INDEX IF NOT EXISTS idx_member_access_grants_member_product
ON public.member_access_grants(tribe_id, user_id, product_key);

-- 3. Enrollment: first real academy activation (drip origin).
CREATE TABLE IF NOT EXISTS public.member_product_enrollments (
  tribe_id uuid NOT NULL REFERENCES public.tribes(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES public."user"(id) ON DELETE CASCADE,
  product_key text NOT NULL,
  first_activated_at timestamptz NOT NULL,
  activation_origin text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  PRIMARY KEY (tribe_id, user_id, product_key),
  CONSTRAINT member_product_enrollments_product_key_check
    CHECK (product_key IN ('academy')),
  CONSTRAINT member_product_enrollments_origin_check
    CHECK (activation_origin IN ('first_grant', 'migration_preserved'))
);

-- 4. Bounded audit trail. It stores ids and transitions, not personal data.
CREATE TABLE IF NOT EXISTS public.academy_audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tribe_id uuid NOT NULL REFERENCES public.tribes(id) ON DELETE CASCADE,
  actor_user_id text REFERENCES public."user"(id) ON DELETE SET NULL,
  subject_user_id text REFERENCES public."user"(id) ON DELETE SET NULL,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id text NOT NULL,
  from_state text,
  to_state text,
  reason text,
  correlation_id text,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT academy_audit_events_action_length_check
    CHECK (char_length(action) BETWEEN 1 AND 80),
  CONSTRAINT academy_audit_events_reason_length_check
    CHECK (reason IS NULL OR char_length(reason) <= 500)
);

CREATE INDEX IF NOT EXISTS idx_academy_audit_events_tribe_created
ON public.academy_audit_events(tribe_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_academy_audit_events_entity
ON public.academy_audit_events(entity_type, entity_id);

-- 5. Access helpers. SECURITY DEFINER so policies can call them without
-- recursion; they only answer for the given tribe and user.
CREATE OR REPLACE FUNCTION public.tribe_uses_academy_access(target_tribe_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.tribe_academy_settings
    WHERE tribe_academy_settings.tribe_id = target_tribe_id
      AND tribe_academy_settings.access_model = 'academy'
  );
$$;

-- Whether a user holds a grant covering now(). Owner-only: it reveals another
-- user's access; request code uses has_current_user_product_access.
CREATE OR REPLACE FUNCTION public.has_active_product_grant(
  target_tribe_id uuid,
  target_user_id text,
  target_product_key text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.member_access_grants
    WHERE member_access_grants.tribe_id = target_tribe_id
      AND member_access_grants.user_id = target_user_id
      AND member_access_grants.product_key = target_product_key
      AND member_access_grants.revoked_at IS NULL
      AND member_access_grants.starts_at <= now()
      AND (member_access_grants.ends_at IS NULL OR now() < member_access_grants.ends_at)
  );
$$;

CREATE OR REPLACE FUNCTION public.has_current_user_product_access(
  target_tribe_id uuid,
  target_product_key text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.current_app_user_id() IS NOT NULL
    AND public.has_active_product_grant(
      target_tribe_id,
      public.current_app_user_id(),
      target_product_key
    );
$$;

-- Community boundary for any user (used by notification producers).
CREATE OR REPLACE FUNCTION public.can_user_access_tribe_community(
  target_tribe_id uuid,
  target_user_id text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    NOT public.tribe_uses_academy_access(target_tribe_id)
    OR EXISTS (
      SELECT 1
      FROM public.tribe_members
      WHERE tribe_members.tribe_id = target_tribe_id
        AND tribe_members.user_id = target_user_id
        AND tribe_members.status = 'active'
        AND tribe_members.role IN ('leader', 'guardian')
    )
    OR public.has_active_product_grant(target_tribe_id, target_user_id, 'academy');
$$;

CREATE OR REPLACE FUNCTION public.can_access_tribe_community(target_tribe_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.current_app_user_id() IS NOT NULL
    AND public.can_user_access_tribe_community(
      target_tribe_id,
      public.current_app_user_id()
    );
$$;

-- Membership-only check for surfaces that stay in the free allowlist (basic
-- course comments). It is the previous is_active_tribe_member rule.
CREATE OR REPLACE FUNCTION public.has_active_tribe_membership(target_tribe_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.tribe_members
    WHERE tribe_members.tribe_id = target_tribe_id
      AND tribe_members.user_id = public.current_app_user_id()
      AND tribe_members.status = 'active'
  );
$$;

-- The community predicates now add the academy boundary. Legacy tribes keep
-- exactly the previous result because tribe_uses_academy_access is false.
CREATE OR REPLACE FUNCTION public.can_read_tribe_content(target_tribe_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.tribe_members
    WHERE tribe_members.tribe_id = target_tribe_id
      AND tribe_members.user_id = public.current_app_user_id()
      AND tribe_members.status IN ('active', 'muted')
  )
  AND public.can_access_tribe_community(target_tribe_id);
$$;

CREATE OR REPLACE FUNCTION public.is_active_tribe_member(target_tribe_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.tribe_members
    WHERE tribe_members.tribe_id = target_tribe_id
      AND tribe_members.user_id = public.current_app_user_id()
      AND tribe_members.status = 'active'
  )
  AND public.can_access_tribe_community(target_tribe_id);
$$;

CREATE OR REPLACE FUNCTION public.can_receive_tribe_notifications(
  target_tribe_id uuid,
  target_user_id text
)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.tribe_members
    WHERE tribe_members.tribe_id = target_tribe_id
      AND tribe_members.user_id = target_user_id
      AND tribe_members.status IN ('active', 'muted')
  )
  AND public.can_user_access_tribe_community(target_tribe_id, target_user_id);
$$;

-- Member directory: same contract, gated by the community boundary.
CREATE OR REPLACE FUNCTION public.list_visible_tribe_members_by_slug(
  target_slug text
)
RETURNS TABLE (
  member_id text,
  role text,
  name text,
  email text,
  image text,
  joined_free boolean
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH viewer AS (
    SELECT
      viewer_membership.tribe_id,
      viewer_membership.role,
      viewer_membership.status
    FROM public.tribes AS viewer_tribe
    INNER JOIN public.tribe_members AS viewer_membership
      ON viewer_membership.tribe_id = viewer_tribe.id
    WHERE viewer_tribe.slug = lower(trim(target_slug))
      AND viewer_membership.user_id = public.current_app_user_id()
      AND viewer_membership.status IN ('active', 'muted')
      AND public.can_access_tribe_community(viewer_tribe.id)
    LIMIT 1
  )
  SELECT
    tribe_members.user_id AS member_id,
    tribe_members.role,
    "user".name,
    CASE
      WHEN (SELECT viewer.role FROM viewer) IN ('leader', 'guardian')
        AND (SELECT viewer.status FROM viewer) = 'active'
        THEN "user".email
      ELSE NULL
    END AS email,
    "user".image,
    CASE
      WHEN (SELECT viewer.role FROM viewer) = 'leader'
        AND (SELECT viewer.status FROM viewer) = 'active'
        THEN tribe_members.joined_via = 'free_invitation'
      ELSE FALSE
    END AS joined_free
  FROM public.tribes
  INNER JOIN public.tribe_members
    ON tribe_members.tribe_id = tribes.id
  INNER JOIN public."user"
    ON "user".id = tribe_members.user_id
  WHERE tribes.slug = lower(trim(target_slug))
    AND tribe_members.status IN ('active', 'muted')
    AND EXISTS (SELECT 1 FROM viewer)
  ORDER BY
    CASE tribe_members.role
      WHEN 'leader' THEN 1
      WHEN 'guardian' THEN 2
      ELSE 3
    END,
    "user".name ASC;
$$;

-- 6. RLS. Request roles read their own rows; leaders read their tribe rows.
ALTER TABLE public.tribe_academy_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tribe_academy_settings FORCE ROW LEVEL SECURITY;
ALTER TABLE public.member_access_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.member_access_grants FORCE ROW LEVEL SECURITY;
ALTER TABLE public.member_product_enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.member_product_enrollments FORCE ROW LEVEL SECURITY;
ALTER TABLE public.academy_audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.academy_audit_events FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members read academy settings" ON public.tribe_academy_settings;
CREATE POLICY "Members read academy settings"
ON public.tribe_academy_settings
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.tribe_members
    WHERE tribe_members.tribe_id = tribe_academy_settings.tribe_id
      AND tribe_members.user_id = public.current_app_user_id()
      AND tribe_members.status IN ('active', 'muted')
  )
);

DROP POLICY IF EXISTS "Members read own access grants" ON public.member_access_grants;
CREATE POLICY "Members read own access grants"
ON public.member_access_grants
FOR SELECT
USING (user_id = public.current_app_user_id());

DROP POLICY IF EXISTS "Leaders read tribe access grants" ON public.member_access_grants;
CREATE POLICY "Leaders read tribe access grants"
ON public.member_access_grants
FOR SELECT
USING (public.can_manage_tribe_settings(tribe_id));

DROP POLICY IF EXISTS "Members read own enrollments" ON public.member_product_enrollments;
CREATE POLICY "Members read own enrollments"
ON public.member_product_enrollments
FOR SELECT
USING (user_id = public.current_app_user_id());

DROP POLICY IF EXISTS "Leaders read academy audit events" ON public.academy_audit_events;
CREATE POLICY "Leaders read academy audit events"
ON public.academy_audit_events
FOR SELECT
USING (public.can_manage_tribe_settings(tribe_id));

-- Owner exception: the runtime owner is the only writer, also without BYPASSRLS.
DO $$
DECLARE
  target_table text;
BEGIN
  FOREACH target_table IN ARRAY ARRAY[
    'tribe_academy_settings',
    'member_access_grants',
    'member_product_enrollments',
    'academy_audit_events'
  ]
  LOOP
    EXECUTE format(
      'DROP POLICY IF EXISTS "Table owner manages %1$s" ON public.%1$I',
      target_table
    );
    EXECUTE format(
      'CREATE POLICY "Table owner manages %1$s" ON public.%1$I FOR ALL
       USING (current_user = (SELECT pg_get_userbyid(pg_class.relowner) FROM pg_class WHERE pg_class.oid = %2$L::regclass))
       WITH CHECK (current_user = (SELECT pg_get_userbyid(pg_class.relowner) FROM pg_class WHERE pg_class.oid = %2$L::regclass))',
      target_table,
      'public.' || target_table
    );
  END LOOP;
END $$;

REVOKE EXECUTE ON FUNCTION public.has_active_product_grant(uuid, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.can_user_access_tribe_community(uuid, text) FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE INSERT, UPDATE, DELETE ON public.tribe_academy_settings FROM authenticated;
    REVOKE INSERT, UPDATE, DELETE ON public.member_access_grants FROM authenticated;
    REVOKE INSERT, UPDATE, DELETE ON public.member_product_enrollments FROM authenticated;
    REVOKE INSERT, UPDATE, DELETE ON public.academy_audit_events FROM authenticated;
    GRANT SELECT ON public.tribe_academy_settings TO authenticated;
    GRANT SELECT ON public.member_access_grants TO authenticated;
    GRANT SELECT ON public.member_product_enrollments TO authenticated;
    GRANT SELECT ON public.academy_audit_events TO authenticated;
    GRANT EXECUTE ON FUNCTION public.tribe_uses_academy_access(uuid) TO authenticated;
    GRANT EXECUTE ON FUNCTION public.has_current_user_product_access(uuid, text) TO authenticated;
    GRANT EXECUTE ON FUNCTION public.can_access_tribe_community(uuid) TO authenticated;
    GRANT EXECUTE ON FUNCTION public.has_active_tribe_membership(uuid) TO authenticated;
  END IF;
END $$;

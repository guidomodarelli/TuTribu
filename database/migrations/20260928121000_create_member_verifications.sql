-- Member verifications: manual accreditation that a member holds a relation
-- with a provider configured by the tribe leader (for example a broker). The
-- provider names and instructions are leader configuration, never constants of
-- the permission engine. No credentials, balances or identity documents are
-- stored: only an optional declared email when the provider needs it.
--
-- Status machine: pending -> verified | rejected; verified -> revoked;
-- rejected | revoked -> pending. `version` is the compare-and-swap token for
-- concurrent reviewers. Decisions are also written to academy_audit_events.

CREATE TABLE IF NOT EXISTS public.verification_providers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tribe_id uuid NOT NULL REFERENCES public.tribes(id) ON DELETE CASCADE,
  key text NOT NULL,
  display_name text NOT NULL,
  instructions text NOT NULL DEFAULT '',
  link_url text,
  is_active boolean NOT NULL DEFAULT true,
  created_by text REFERENCES public."user"(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT verification_providers_key_check
    CHECK (key ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND char_length(key) <= 40),
  CONSTRAINT verification_providers_display_name_check
    CHECK (char_length(btrim(display_name)) BETWEEN 1 AND 80),
  CONSTRAINT verification_providers_instructions_check
    CHECK (char_length(instructions) <= 1000),
  CONSTRAINT verification_providers_link_url_check
    CHECK (link_url IS NULL OR (link_url ~ '^https://' AND char_length(link_url) <= 2048))
);

CREATE UNIQUE INDEX IF NOT EXISTS verification_providers_tribe_key
ON public.verification_providers(tribe_id, key);

CREATE UNIQUE INDEX IF NOT EXISTS verification_providers_id_tribe_key
ON public.verification_providers(id, tribe_id);

CREATE TABLE IF NOT EXISTS public.member_verifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tribe_id uuid NOT NULL REFERENCES public.tribes(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES public."user"(id) ON DELETE CASCADE,
  provider_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  declared_email text,
  decision_reason text,
  version integer NOT NULL DEFAULT 1,
  reviewed_by text REFERENCES public."user"(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  -- Same-tribe provider: an id of another tribe can never be referenced.
  CONSTRAINT member_verifications_provider_tribe_fkey
    FOREIGN KEY (provider_id, tribe_id)
    REFERENCES public.verification_providers(id, tribe_id)
    ON DELETE CASCADE,
  CONSTRAINT member_verifications_status_check
    CHECK (status IN ('pending', 'verified', 'rejected', 'revoked')),
  CONSTRAINT member_verifications_version_check CHECK (version >= 1),
  CONSTRAINT member_verifications_declared_email_check
    CHECK (declared_email IS NULL OR (char_length(declared_email) <= 254 AND declared_email ~ '^[^@\s]+@[^@\s]+$')),
  CONSTRAINT member_verifications_reason_check
    CHECK (decision_reason IS NULL OR char_length(decision_reason) <= 500),
  -- Rejections and revocations always explain why.
  CONSTRAINT member_verifications_negative_reason_check
    CHECK (status NOT IN ('rejected', 'revoked') OR char_length(btrim(coalesce(decision_reason, ''))) >= 3)
);

CREATE UNIQUE INDEX IF NOT EXISTS member_verifications_member_provider_key
ON public.member_verifications(tribe_id, user_id, provider_id);

CREATE INDEX IF NOT EXISTS idx_member_verifications_queue
ON public.member_verifications(tribe_id, status, created_at);

CREATE OR REPLACE FUNCTION public.can_review_member_verifications(target_tribe_id uuid)
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

-- Owner-only: whether a user holds at least one verified relation.
CREATE OR REPLACE FUNCTION public.is_member_verified_for_academy(
  target_tribe_id uuid,
  target_user_id text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.member_verifications
    WHERE member_verifications.tribe_id = target_tribe_id
      AND member_verifications.user_id = target_user_id
      AND member_verifications.status = 'verified'
  );
$$;

ALTER TABLE public.verification_providers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.verification_providers FORCE ROW LEVEL SECURITY;
ALTER TABLE public.member_verifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.member_verifications FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members read tribe verification providers"
ON public.verification_providers;
CREATE POLICY "Members read tribe verification providers"
ON public.verification_providers
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.tribe_members
    WHERE tribe_members.tribe_id = verification_providers.tribe_id
      AND tribe_members.user_id = public.current_app_user_id()
      AND tribe_members.status IN ('active', 'muted')
  )
);

-- The linked data is visible only to its owner and to active reviewers.
DROP POLICY IF EXISTS "Members read own verifications" ON public.member_verifications;
CREATE POLICY "Members read own verifications"
ON public.member_verifications
FOR SELECT
USING (user_id = public.current_app_user_id());

DROP POLICY IF EXISTS "Reviewers read tribe verifications" ON public.member_verifications;
CREATE POLICY "Reviewers read tribe verifications"
ON public.member_verifications
FOR SELECT
USING (public.can_review_member_verifications(tribe_id));

DO $$
DECLARE
  target_table text;
BEGIN
  FOREACH target_table IN ARRAY ARRAY['verification_providers', 'member_verifications']
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

REVOKE EXECUTE ON FUNCTION public.is_member_verified_for_academy(uuid, text) FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE INSERT, UPDATE, DELETE ON public.verification_providers FROM authenticated;
    REVOKE INSERT, UPDATE, DELETE ON public.member_verifications FROM authenticated;
    GRANT SELECT ON public.verification_providers TO authenticated;
    GRANT SELECT ON public.member_verifications TO authenticated;
    GRANT EXECUTE ON FUNCTION public.can_review_member_verifications(uuid) TO authenticated;
  END IF;
END $$;

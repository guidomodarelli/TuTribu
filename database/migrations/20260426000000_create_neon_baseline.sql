CREATE TABLE IF NOT EXISTS public."user" (
  id text PRIMARY KEY,
  name text NOT NULL,
  email text NOT NULL UNIQUE,
  "emailVerified" boolean NOT NULL DEFAULT false,
  image text,
  "createdAt" timestamptz NOT NULL,
  "updatedAt" timestamptz NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS user_email_key
ON public."user"(email);

CREATE TABLE IF NOT EXISTS public.session (
  id text PRIMARY KEY,
  "expiresAt" timestamptz NOT NULL,
  token text NOT NULL UNIQUE,
  "createdAt" timestamptz NOT NULL,
  "updatedAt" timestamptz NOT NULL,
  "ipAddress" text,
  "userAgent" text,
  "userId" text NOT NULL REFERENCES public."user"(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS session_token_key
ON public.session(token);

CREATE INDEX IF NOT EXISTS idx_session_user_id
ON public.session("userId");

CREATE TABLE IF NOT EXISTS public.account (
  id text PRIMARY KEY,
  "accountId" text NOT NULL,
  "providerId" text NOT NULL,
  "userId" text NOT NULL REFERENCES public."user"(id) ON DELETE CASCADE,
  "accessToken" text,
  "refreshToken" text,
  "idToken" text,
  "accessTokenExpiresAt" timestamptz,
  "refreshTokenExpiresAt" timestamptz,
  scope text,
  password text,
  "createdAt" timestamptz NOT NULL,
  "updatedAt" timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_account_user_id
ON public.account("userId");

CREATE TABLE IF NOT EXISTS public.verification (
  id text PRIMARY KEY,
  identifier text NOT NULL,
  value text NOT NULL,
  "expiresAt" timestamptz NOT NULL,
  "createdAt" timestamptz NOT NULL,
  "updatedAt" timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_verification_identifier
ON public.verification(identifier);

CREATE TABLE IF NOT EXISTS public.tribe_creator_whitelist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  notes text,
  created_by text REFERENCES public."user"(id),
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE TABLE IF NOT EXISTS public.tribes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  visibility text NOT NULL DEFAULT 'private',
  created_by text NOT NULL REFERENCES public."user"(id),
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE TABLE IF NOT EXISTS public.tribe_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tribe_id uuid NOT NULL REFERENCES public.tribes(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES public."user"(id) ON DELETE CASCADE,
  role text NOT NULL,
  status text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  UNIQUE (tribe_id, user_id)
);

ALTER TABLE public.tribe_creator_whitelist
DROP CONSTRAINT IF EXISTS tribe_creator_whitelist_created_by_fkey;

ALTER TABLE public.tribes
DROP CONSTRAINT IF EXISTS tribes_created_by_fkey;

ALTER TABLE public.tribe_members
DROP CONSTRAINT IF EXISTS tribe_members_user_id_fkey;

ALTER TABLE public.tribe_creator_whitelist
ALTER COLUMN created_by TYPE text USING created_by::text;

ALTER TABLE public.tribes
ALTER COLUMN created_by TYPE text USING created_by::text;

ALTER TABLE public.tribe_members
ALTER COLUMN user_id TYPE text USING user_id::text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'tribe_creator_whitelist_created_by_fkey'
  ) THEN
    ALTER TABLE public.tribe_creator_whitelist
    ADD CONSTRAINT tribe_creator_whitelist_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES public."user"(id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'tribes_created_by_fkey'
  ) THEN
    ALTER TABLE public.tribes
    ADD CONSTRAINT tribes_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES public."user"(id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'tribe_members_user_id_fkey'
  ) THEN
    ALTER TABLE public.tribe_members
    ADD CONSTRAINT tribe_members_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES public."user"(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'tribe_members_tribe_id_fkey'
  ) THEN
    ALTER TABLE public.tribe_members
    ADD CONSTRAINT tribe_members_tribe_id_fkey
    FOREIGN KEY (tribe_id) REFERENCES public.tribes(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'tribe_creator_whitelist_email_normalized_check'
  ) THEN
    ALTER TABLE public.tribe_creator_whitelist
    ADD CONSTRAINT tribe_creator_whitelist_email_normalized_check
    CHECK (email = lower(trim(email)));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'tribes_name_not_blank_check'
  ) THEN
    ALTER TABLE public.tribes
    ADD CONSTRAINT tribes_name_not_blank_check
    CHECK (char_length(trim(name)) > 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'tribes_slug_lowercase_check'
  ) THEN
    ALTER TABLE public.tribes
    ADD CONSTRAINT tribes_slug_lowercase_check
    CHECK (slug = lower(slug));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'tribes_slug_single_segment_check'
  ) THEN
    ALTER TABLE public.tribes
    ADD CONSTRAINT tribes_slug_single_segment_check
    CHECK (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'tribes_visibility_private_check'
  ) THEN
    ALTER TABLE public.tribes
    ADD CONSTRAINT tribes_visibility_private_check
    CHECK (visibility IN ('private'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'tribe_members_role_check'
  ) THEN
    ALTER TABLE public.tribe_members
    ADD CONSTRAINT tribe_members_role_check
    CHECK (role IN ('owner', 'admin', 'member'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'tribe_members_status_check'
  ) THEN
    ALTER TABLE public.tribe_members
    ADD CONSTRAINT tribe_members_status_check
    CHECK (status IN ('active', 'muted', 'blocked'));
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS tribe_creator_whitelist_email_key
ON public.tribe_creator_whitelist(email);

CREATE UNIQUE INDEX IF NOT EXISTS tribes_slug_key
ON public.tribes(slug);

CREATE UNIQUE INDEX IF NOT EXISTS tribe_members_tribe_id_user_id_key
ON public.tribe_members(tribe_id, user_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_tribe_members_owner_per_tribe
ON public.tribe_members(tribe_id)
WHERE role = 'owner';

CREATE OR REPLACE FUNCTION public.current_app_user_id()
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT nullif(current_setting('app.current_user_id', true), '');
$$;

CREATE OR REPLACE FUNCTION public.current_app_user_email()
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT lower(trim(coalesce(nullif(current_setting('app.current_user_email', true), ''), '')));
$$;

ALTER TABLE public.tribe_creator_whitelist ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tribe_creator_whitelist FORCE ROW LEVEL SECURITY;

ALTER TABLE public.tribes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tribes FORCE ROW LEVEL SECURITY;

ALTER TABLE public.tribe_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tribe_members FORCE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_tribe_creator(target_tribe_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.tribes
    WHERE tribes.id = target_tribe_id
      AND tribes.created_by = public.current_app_user_id()
  );
$$;

DROP POLICY IF EXISTS "Users can read own creator whitelist entry"
ON public.tribe_creator_whitelist;

DROP POLICY IF EXISTS "Members can read own tribes"
ON public.tribes;

DROP POLICY IF EXISTS "Whitelisted users can create private tribes"
ON public.tribes;

DROP POLICY IF EXISTS "Members can read own membership rows"
ON public.tribe_members;

DROP POLICY IF EXISTS "Creators can create their initial owner membership"
ON public.tribe_members;

CREATE POLICY "Users can read own creator whitelist entry"
ON public.tribe_creator_whitelist
FOR SELECT
USING (
  email = public.current_app_user_email()
);

CREATE POLICY "Members can read own tribes"
ON public.tribes
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.tribe_members
    WHERE tribe_members.tribe_id = tribes.id
      AND tribe_members.user_id = public.current_app_user_id()
      AND tribe_members.status <> 'blocked'
  )
);

CREATE POLICY "Whitelisted users can create private tribes"
ON public.tribes
FOR INSERT
WITH CHECK (
  created_by = public.current_app_user_id()
  AND visibility = 'private'
  AND EXISTS (
    SELECT 1
    FROM public.tribe_creator_whitelist
    WHERE tribe_creator_whitelist.email = public.current_app_user_email()
  )
);

CREATE POLICY "Members can read own membership rows"
ON public.tribe_members
FOR SELECT
USING (user_id = public.current_app_user_id());

CREATE POLICY "Creators can create their initial owner membership"
ON public.tribe_members
FOR INSERT
WITH CHECK (
  user_id = public.current_app_user_id()
  AND role = 'owner'
  AND status = 'active'
  AND public.is_tribe_creator(tribe_id)
);

CREATE OR REPLACE FUNCTION public.get_current_tribe_membership_status_by_slug(
  target_slug text
)
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT tribe_members.status
  FROM public.tribe_members
  INNER JOIN public.tribes
    ON tribes.id = tribe_members.tribe_id
  WHERE tribes.slug = lower(trim(target_slug))
    AND tribe_members.user_id = public.current_app_user_id()
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_current_tribe_membership_status_by_slug(text)
TO public;

CREATE OR REPLACE FUNCTION public.is_tribe_slug_taken(target_slug text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    EXISTS (
      SELECT 1
      FROM public.tribe_creator_whitelist
      WHERE tribe_creator_whitelist.email = public.current_app_user_email()
    )
    AND EXISTS (
      SELECT 1
      FROM public.tribes
      WHERE tribes.slug = lower(trim(target_slug))
    );
$$;

GRANT EXECUTE ON FUNCTION public.is_tribe_slug_taken(text)
TO public;

DROP FUNCTION IF EXISTS public.create_private_tribe_with_owner_membership(
  text,
  text,
  uuid
);

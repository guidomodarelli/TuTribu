-- Tribe events phase 4: personal calendar feed (webcal) tokens.
--
-- Each member may subscribe their calendar app to a tribe calendar with a
-- personal link. The link carries a 256-bit random token; only its SHA-256
-- hex digest is stored here. Regenerating revokes the previous token (one
-- active token per member and tribe), and "Desactivar suscripción" revokes it
-- without a replacement. Rows are kept after revocation for auditing.
--
-- The feed request has no session: the app resolves the token with the
-- SECURITY DEFINER function below and then reads the calendar inside a
-- request context whose app.current_user_id is the token owner, so the
-- owner's current membership (can_read_tribe_content) is checked on every
-- request.

CREATE TABLE IF NOT EXISTS public.event_calendar_feed_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL REFERENCES public."user"(id) ON DELETE CASCADE,
  tribe_id uuid NOT NULL REFERENCES public.tribes(id) ON DELETE CASCADE,
  token_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  -- Refreshed at most once per hour by the feed (not on every poll).
  last_used_at timestamptz,
  revoked_at timestamptz,
  CONSTRAINT event_calendar_feed_tokens_valid_token_hash CHECK (
    token_hash ~ '^[0-9a-f]{64}$'
  ),
  CONSTRAINT event_calendar_feed_tokens_revoked_after_created CHECK (
    revoked_at IS NULL OR revoked_at >= created_at
  )
);

-- Lookup of a feed request by the digest of its token.
CREATE UNIQUE INDEX IF NOT EXISTS event_calendar_feed_tokens_token_hash_key
ON public.event_calendar_feed_tokens(token_hash);

-- At most one active token per member and tribe, even under concurrent
-- regenerations (the app also serializes them with an advisory lock).
CREATE UNIQUE INDEX IF NOT EXISTS event_calendar_feed_tokens_active_member_key
ON public.event_calendar_feed_tokens(user_id, tribe_id)
WHERE revoked_at IS NULL;

-- Cascade from a deleted tribe.
CREATE INDEX IF NOT EXISTS idx_event_calendar_feed_tokens_tribe_id
ON public.event_calendar_feed_tokens(tribe_id);

ALTER TABLE public.event_calendar_feed_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_calendar_feed_tokens FORCE ROW LEVEL SECURITY;

-- Every member manages only their own tokens.
DROP POLICY IF EXISTS "Members read their own calendar feed tokens"
ON public.event_calendar_feed_tokens;
CREATE POLICY "Members read their own calendar feed tokens"
ON public.event_calendar_feed_tokens
FOR SELECT
USING (user_id = public.current_app_user_id());

DROP POLICY IF EXISTS "Members create their own calendar feed tokens"
ON public.event_calendar_feed_tokens;
CREATE POLICY "Members create their own calendar feed tokens"
ON public.event_calendar_feed_tokens
FOR INSERT
WITH CHECK (
  user_id = public.current_app_user_id()
  AND public.can_read_tribe_content(tribe_id)
  AND revoked_at IS NULL
  AND last_used_at IS NULL
);

-- Revoking (revoked_at) and the throttled last_used_at refresh of the feed.
DROP POLICY IF EXISTS "Members update their own calendar feed tokens"
ON public.event_calendar_feed_tokens;
CREATE POLICY "Members update their own calendar feed tokens"
ON public.event_calendar_feed_tokens
FOR UPDATE
USING (user_id = public.current_app_user_id())
WITH CHECK (user_id = public.current_app_user_id());

-- Owner exception: lets the SECURITY DEFINER resolver below (which runs as
-- the table owner with no app user) read tokens even where the owner does
-- not bypass RLS. Where the owner already bypasses RLS this is a no-op.
DROP POLICY IF EXISTS "Table owner resolves calendar feed tokens"
ON public.event_calendar_feed_tokens;
CREATE POLICY "Table owner resolves calendar feed tokens"
ON public.event_calendar_feed_tokens
FOR SELECT
USING (
  current_user = (
    SELECT pg_get_userbyid(pg_class.relowner)
    FROM pg_class
    WHERE pg_class.oid = 'public.event_calendar_feed_tokens'::regclass
  )
);

-- Resolves an active token by its digest. The feed has no session, so this
-- is the only way to learn who the token belongs to; the caller then reads
-- the calendar as that user. Knowing a digest is equivalent to holding the
-- token (256-bit), so the function only answers exact matches and returns
-- nothing about other rows.
CREATE OR REPLACE FUNCTION public.resolve_event_calendar_feed_token(
  target_token_hash text
)
RETURNS TABLE (
  token_id uuid,
  user_id text,
  tribe_id uuid,
  token_hash text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    event_calendar_feed_tokens.id,
    event_calendar_feed_tokens.user_id,
    event_calendar_feed_tokens.tribe_id,
    event_calendar_feed_tokens.token_hash
  FROM public.event_calendar_feed_tokens
  WHERE event_calendar_feed_tokens.token_hash = target_token_hash
    AND event_calendar_feed_tokens.revoked_at IS NULL
  LIMIT 1;
$$;

REVOKE EXECUTE ON FUNCTION public.resolve_event_calendar_feed_token(text)
FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    GRANT SELECT, INSERT, UPDATE ON public.event_calendar_feed_tokens TO authenticated;
    GRANT EXECUTE ON FUNCTION public.resolve_event_calendar_feed_token(text)
    TO authenticated;
  END IF;
END $$;

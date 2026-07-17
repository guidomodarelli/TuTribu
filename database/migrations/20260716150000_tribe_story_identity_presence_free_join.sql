-- Tribe story "About" v3: tribe visual identity (logo/cover), uploaded gallery
-- images, member presence (online count), and tokenless free open join.
--
-- - logo_url / cover_url live in tribe_story_settings (About-scoped identity).
-- - tribe_story_images tracks Cloudflare direct uploads reserved by the leader
--   (draft) and referenced by the saved story (attached).
-- - tribe_members.last_seen_at powers the online counter; members refresh it
--   through the SECURITY DEFINER touch function so no broad UPDATE grant on
--   tribe_members is required.
-- - tribes.open_free_join_enabled is an explicit leader opt-in: a free tribe is
--   NOT joinable without invitation unless the leader turns this on. The toggle
--   is applied through a SECURITY DEFINER setter because tribes has no leader
--   UPDATE policy.
-- - The about read predicate now also covers free open join visitors, and the
--   definer read functions expose the new fields.

-- 1. Visual identity on the story settings.
ALTER TABLE public.tribe_story_settings
  ADD COLUMN IF NOT EXISTS logo_url text,
  ADD COLUMN IF NOT EXISTS cover_url text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'tribe_story_settings_logo_url_check'
  ) THEN
    ALTER TABLE public.tribe_story_settings
      ADD CONSTRAINT tribe_story_settings_logo_url_check
      CHECK (logo_url IS NULL OR logo_url ~ '^https?://');
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'tribe_story_settings_cover_url_check'
  ) THEN
    ALTER TABLE public.tribe_story_settings
      ADD CONSTRAINT tribe_story_settings_cover_url_check
      CHECK (cover_url IS NULL OR cover_url ~ '^https?://');
  END IF;
END $$;

-- 2. Uploaded story images (Cloudflare direct uploads reserved by the leader).
CREATE TABLE IF NOT EXISTS public.tribe_story_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tribe_id uuid NOT NULL REFERENCES public.tribes(id) ON DELETE CASCADE,
  cloudflare_image_id text NOT NULL,
  delivery_url text NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT tribe_story_images_status_check
    CHECK (status IN ('draft', 'attached')),
  CONSTRAINT tribe_story_images_delivery_url_check
    CHECK (delivery_url ~ '^https?://')
);

CREATE UNIQUE INDEX IF NOT EXISTS tribe_story_images_cloudflare_key
ON public.tribe_story_images(cloudflare_image_id);

CREATE INDEX IF NOT EXISTS idx_tribe_story_images_tribe_status
ON public.tribe_story_images(tribe_id, status);

ALTER TABLE public.tribe_story_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tribe_story_images FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Leaders can manage tribe story images"
ON public.tribe_story_images;
CREATE POLICY "Leaders can manage tribe story images"
ON public.tribe_story_images
FOR ALL
USING (public.can_manage_tribe_story(tribe_id))
WITH CHECK (public.can_manage_tribe_story(tribe_id));

-- 3. Presence: last seen timestamp refreshed through a definer touch.
ALTER TABLE public.tribe_members
  ADD COLUMN IF NOT EXISTS last_seen_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_tribe_members_last_seen
ON public.tribe_members(tribe_id, last_seen_at);

CREATE OR REPLACE FUNCTION public.touch_tribe_member_presence(target_tribe_slug text)
RETURNS boolean
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH touched AS (
    UPDATE public.tribe_members
    SET last_seen_at = timezone('utc', now())
    FROM public.tribes
    WHERE tribes.slug = target_tribe_slug
      AND tribe_members.tribe_id = tribes.id
      AND tribe_members.user_id = public.current_app_user_id()
      AND tribe_members.status IN ('active', 'muted')
    RETURNING tribe_members.id
  )
  SELECT EXISTS (SELECT 1 FROM touched);
$$;

-- 4. Free open join: explicit leader opt-in.
ALTER TABLE public.tribes
  ADD COLUMN IF NOT EXISTS open_free_join_enabled boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.can_open_join_tribe_free(target_tribe_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    EXISTS (
      SELECT 1
      FROM public.tribes
      WHERE tribes.id = target_tribe_id
        AND tribes.free_join_is_current = true
        AND tribes.open_free_join_enabled = true
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.tribe_members
      WHERE tribe_members.tribe_id = target_tribe_id
        AND tribe_members.user_id = public.current_app_user_id()
        AND tribe_members.status = 'blocked'
        AND tribe_members.status_reason = 'conduct_blocked'
    );
$$;

DROP POLICY IF EXISTS "Authenticated users can open join free tribes"
ON public.tribe_members;
CREATE POLICY "Authenticated users can open join free tribes"
ON public.tribe_members
FOR INSERT
WITH CHECK (
  user_id = public.current_app_user_id()
  AND role = 'tribemate'
  AND status = 'active'
  AND joined_via = 'free_open_join'
  AND joined_via_invitation_id IS NULL
  AND public.can_open_join_tribe_free(tribe_id)
);

-- Resolve the tribe id for a tokenless free join (mirrors
-- tribe_open_join_id_by_slug, which is paid-only): the tribes SELECT policies
-- hide the row from a non-member, so the join INSERT needs a definer resolver.
CREATE OR REPLACE FUNCTION public.tribe_free_open_join_id_by_slug(
  target_tribe_slug text
)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT tribes.id
  FROM public.tribes
  WHERE tribes.slug = target_tribe_slug
    AND public.can_open_join_tribe_free(tribes.id)
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.set_tribe_open_free_join(
  target_tribe_slug text,
  enabled boolean
)
RETURNS boolean
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH updated_tribe AS (
    UPDATE public.tribes
    SET open_free_join_enabled = enabled
    WHERE tribes.slug = target_tribe_slug
      AND public.can_manage_tribe_story(tribes.id)
    RETURNING tribes.id
  )
  SELECT EXISTS (SELECT 1 FROM updated_tribe);
$$;

-- 5. About read predicate now includes free open join visitors.
CREATE OR REPLACE FUNCTION public.can_read_tribe_story_about(target_tribe_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.can_read_tribe_story(target_tribe_id)
    OR public.can_open_join_tribe_paid_plan(target_tribe_id)
    OR public.can_open_join_tribe_free(target_tribe_id);
$$;

-- 6. Extended definer reads (return shapes change, so drop first).
DROP FUNCTION IF EXISTS public.tribe_story_about(text);
CREATE FUNCTION public.tribe_story_about(target_tribe_slug text)
RETURNS TABLE (
  content text,
  website_url text,
  logo_url text,
  cover_url text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    tribe_story_settings.content,
    tribe_story_settings.website_url,
    tribe_story_settings.logo_url,
    tribe_story_settings.cover_url
  FROM public.tribes
  INNER JOIN public.tribe_story_settings
    ON tribe_story_settings.tribe_id = tribes.id
  WHERE tribes.slug = target_tribe_slug
    AND public.can_read_tribe_story_about(tribes.id)
  LIMIT 1;
$$;

DROP FUNCTION IF EXISTS public.tribe_story_about_stats(text);
CREATE FUNCTION public.tribe_story_about_stats(target_tribe_slug text)
RETURNS TABLE (
  name text,
  member_count bigint,
  admin_count bigint,
  online_count bigint,
  created_at timestamptz,
  open_free_join_available boolean,
  open_free_join_enabled boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    tribes.name,
    (
      SELECT count(*)
      FROM public.tribe_members
      WHERE tribe_members.tribe_id = tribes.id
        AND tribe_members.status IN ('active', 'muted')
    ) AS member_count,
    (
      SELECT count(*)
      FROM public.tribe_members
      WHERE tribe_members.tribe_id = tribes.id
        AND tribe_members.status = 'active'
        AND tribe_members.role IN ('leader', 'guardian')
    ) AS admin_count,
    (
      SELECT count(*)
      FROM public.tribe_members
      WHERE tribe_members.tribe_id = tribes.id
        AND tribe_members.status IN ('active', 'muted')
        AND tribe_members.last_seen_at > timezone('utc', now()) - interval '5 minutes'
    ) AS online_count,
    tribes.created_at,
    public.can_open_join_tribe_free(tribes.id) AS open_free_join_available,
    tribes.open_free_join_enabled
  FROM public.tribes
  WHERE tribes.slug = target_tribe_slug
    AND public.can_read_tribe_story_about(tribes.id)
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.touch_tribe_member_presence(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_open_join_tribe_free(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.tribe_free_open_join_id_by_slug(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_tribe_open_free_join(text, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_read_tribe_story_about(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.tribe_story_about(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.tribe_story_about_stats(text) FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.tribe_story_images TO authenticated;
    GRANT EXECUTE ON FUNCTION public.touch_tribe_member_presence(text) TO authenticated;
    GRANT EXECUTE ON FUNCTION public.can_open_join_tribe_free(uuid) TO authenticated;
    GRANT EXECUTE ON FUNCTION public.tribe_free_open_join_id_by_slug(text) TO authenticated;
    GRANT EXECUTE ON FUNCTION public.set_tribe_open_free_join(text, boolean) TO authenticated;
    GRANT EXECUTE ON FUNCTION public.can_read_tribe_story_about(uuid) TO authenticated;
    GRANT EXECUTE ON FUNCTION public.tribe_story_about(text) TO authenticated;
    GRANT EXECUTE ON FUNCTION public.tribe_story_about_stats(text) TO authenticated;
  END IF;
END $$;

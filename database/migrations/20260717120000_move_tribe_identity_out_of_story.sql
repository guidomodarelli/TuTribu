-- Tribe identity lives on the tribe, not on its story.
--
-- 20260716150000 put logo_url and cover_url on tribe_story_settings because the
-- story editor was the only leader-facing management surface at the time. They
-- are tribe identity, not story content: the logo already renders in the app
-- sidebar, and both feed the Open Graph card. Keeping them under the story made
-- the only way to change a tribe logo "edit the story".
--
-- This migration:
--   1. moves logo_url/cover_url to public.tribes (with backfill),
--   2. adds can_manage_tribe_settings + set_tribe_identity so a leader can write
--      them through a definer (public.tribes has no leader UPDATE policy),
--   3. renames tribe_story_images to tribe_images, because the same reserved
--      uploads now back the gallery AND the tribe identity,
--   4. adds refresh_tribe_image_attachments, the single place that decides which
--      reserved uploads are still referenced. Without it the story save (which
--      no longer knows about the logo) would demote the identity uploads back to
--      draft and the orphan sweep would delete them a day later.

-- 1. Identity columns on the tribe.
ALTER TABLE public.tribes
  ADD COLUMN IF NOT EXISTS logo_url text,
  ADD COLUMN IF NOT EXISTS cover_url text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'tribes_logo_url_check'
  ) THEN
    ALTER TABLE public.tribes
      ADD CONSTRAINT tribes_logo_url_check
      CHECK (logo_url IS NULL OR logo_url ~ '^https?://');
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'tribes_cover_url_check'
  ) THEN
    ALTER TABLE public.tribes
      ADD CONSTRAINT tribes_cover_url_check
      CHECK (cover_url IS NULL OR cover_url ~ '^https?://');
  END IF;
END $$;

UPDATE public.tribes
SET
  logo_url = tribe_story_settings.logo_url,
  cover_url = tribe_story_settings.cover_url
FROM public.tribe_story_settings
WHERE tribe_story_settings.tribe_id = tribes.id
  AND (
    tribe_story_settings.logo_url IS NOT NULL
    OR tribe_story_settings.cover_url IS NOT NULL
  );

ALTER TABLE public.tribe_story_settings
  DROP COLUMN IF EXISTS logo_url,
  DROP COLUMN IF EXISTS cover_url;

-- 2. Leader-only settings crossing for the tribe row.
CREATE OR REPLACE FUNCTION public.can_manage_tribe_settings(target_tribe_id uuid)
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
      AND tribe_members.role = 'leader'
  );
$$;

CREATE OR REPLACE FUNCTION public.set_tribe_identity(
  target_tribe_slug text,
  new_logo_url text,
  new_cover_url text
)
RETURNS boolean
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH updated_tribe AS (
    UPDATE public.tribes
    SET
      logo_url = new_logo_url,
      cover_url = new_cover_url
    WHERE tribes.slug = target_tribe_slug
      AND public.can_manage_tribe_settings(tribes.id)
    RETURNING tribes.id
  )
  SELECT EXISTS (SELECT 1 FROM updated_tribe);
$$;

-- The open free join toggle moved to the prices screen; keep the same leader
-- guarantee but express it through the settings predicate.
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
      AND public.can_manage_tribe_settings(tribes.id)
    RETURNING tribes.id
  )
  SELECT EXISTS (SELECT 1 FROM updated_tribe);
$$;

-- 3. The reserved uploads back both the story gallery and the tribe identity.
ALTER TABLE public.tribe_story_images RENAME TO tribe_images;

ALTER INDEX IF EXISTS tribe_story_images_cloudflare_key
  RENAME TO tribe_images_cloudflare_key;
ALTER INDEX IF EXISTS idx_tribe_story_images_tribe_status
  RENAME TO idx_tribe_images_tribe_status;

DROP POLICY IF EXISTS "Leaders can manage tribe story images" ON public.tribe_images;
DROP POLICY IF EXISTS "Owner maintenance can read tribe story images" ON public.tribe_images;
DROP POLICY IF EXISTS "Owner maintenance can delete tribe story images" ON public.tribe_images;

CREATE POLICY "Leaders can manage tribe images"
ON public.tribe_images
FOR ALL
USING (public.can_manage_tribe_settings(tribe_id))
WITH CHECK (public.can_manage_tribe_settings(tribe_id));

CREATE POLICY "Owner maintenance can read tribe images"
ON public.tribe_images
FOR SELECT
USING (
  current_user = (
    SELECT pg_get_userbyid(pg_class.relowner)
    FROM pg_class
    WHERE pg_class.oid = 'public.tribe_images'::regclass
  )
);

CREATE POLICY "Owner maintenance can delete tribe images"
ON public.tribe_images
FOR DELETE
USING (
  current_user = (
    SELECT pg_get_userbyid(pg_class.relowner)
    FROM pg_class
    WHERE pg_class.oid = 'public.tribe_images'::regclass
  )
);

DROP FUNCTION IF EXISTS public.reclaim_abandoned_tribe_story_images(integer);
CREATE FUNCTION public.reclaim_abandoned_tribe_images(max_batch integer)
RETURNS TABLE (
  id uuid,
  cloudflare_image_id text
)
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM public.tribe_images
  WHERE tribe_images.id IN (
    SELECT abandoned_images.id
    FROM public.tribe_images AS abandoned_images
    WHERE abandoned_images.status = 'draft'
      AND abandoned_images.updated_at < timezone('utc', now()) - interval '24 hours'
    ORDER BY abandoned_images.updated_at ASC
    LIMIT max_batch
  )
  RETURNING tribe_images.id, tribe_images.cloudflare_image_id;
$$;

-- 4. Single source of truth for which reserved uploads are still referenced.
-- Runs as the caller: the leader may update its own tribe images through the
-- policy above and read the story media and tribe rows it already owns.
CREATE OR REPLACE FUNCTION public.refresh_tribe_image_attachments(
  target_tribe_id uuid
)
RETURNS void
LANGUAGE sql
VOLATILE
AS $$
  UPDATE public.tribe_images
  SET
    status = CASE
      WHEN tribe_images.delivery_url IN (
        SELECT tribe_story_media.url
        FROM public.tribe_story_media
        WHERE tribe_story_media.tribe_id = target_tribe_id
          AND tribe_story_media.url IS NOT NULL
        UNION
        SELECT tribes.logo_url FROM public.tribes
        WHERE tribes.id = target_tribe_id AND tribes.logo_url IS NOT NULL
        UNION
        SELECT tribes.cover_url FROM public.tribes
        WHERE tribes.id = target_tribe_id AND tribes.cover_url IS NOT NULL
      ) THEN 'attached'
      ELSE 'draft'
    END,
    updated_at = timezone('utc', now())
  WHERE tribe_images.tribe_id = target_tribe_id;
$$;

-- 5. About definers: the story returns content, the stats carry tribe identity.
DROP FUNCTION IF EXISTS public.tribe_story_about(text);
CREATE FUNCTION public.tribe_story_about(target_tribe_slug text)
RETURNS TABLE (
  content text,
  website_url text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    tribe_story_settings.content,
    tribe_story_settings.website_url
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
  logo_url text,
  cover_url text,
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
    tribes.logo_url,
    tribes.cover_url,
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

REVOKE ALL ON FUNCTION public.can_manage_tribe_settings(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_tribe_identity(text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_tribe_open_free_join(text, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reclaim_abandoned_tribe_images(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.refresh_tribe_image_attachments(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.tribe_story_about(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.tribe_story_about_stats(text) FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.tribe_images TO authenticated;
    GRANT EXECUTE ON FUNCTION public.can_manage_tribe_settings(uuid) TO authenticated;
    GRANT EXECUTE ON FUNCTION public.set_tribe_identity(text, text, text) TO authenticated;
    GRANT EXECUTE ON FUNCTION public.set_tribe_open_free_join(text, boolean) TO authenticated;
    GRANT EXECUTE ON FUNCTION public.refresh_tribe_image_attachments(uuid) TO authenticated;
    GRANT EXECUTE ON FUNCTION public.tribe_story_about(text) TO authenticated;
    GRANT EXECUTE ON FUNCTION public.tribe_story_about_stats(text) TO authenticated;
  END IF;
END $$;

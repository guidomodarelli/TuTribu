-- Tribe story "About" extension: media gallery, external website link, and
-- open-join public read so a non-member visitor can see the story page the way
-- Skool exposes a community About page.
--
-- Reads for non-members go through SECURITY DEFINER functions by slug (same
-- pattern as tribe_open_join_current_paid_offer) because the tribes SELECT
-- policies hide the tribe row from an authenticated non-member. The functions
-- only return rows when can_read_tribe_story_about allows it: active/muted
-- members always, and non-members only while the tribe exposes a live open-join
-- paid offer.

ALTER TABLE public.tribe_story_settings
  ADD COLUMN IF NOT EXISTS website_url text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'tribe_story_settings_website_url_check'
  ) THEN
    ALTER TABLE public.tribe_story_settings
      ADD CONSTRAINT tribe_story_settings_website_url_check
      CHECK (website_url IS NULL OR website_url ~ '^https?://');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.tribe_story_media (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tribe_id uuid NOT NULL REFERENCES public.tribes(id) ON DELETE CASCADE,
  media_type text NOT NULL,
  url text,
  video_provider text,
  external_video_id text,
  sort_order integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT tribe_story_media_type_check
    CHECK (media_type IN ('image', 'video')),
  CONSTRAINT tribe_story_media_image_shape_check
    CHECK (
      media_type <> 'image'
      OR (
        url IS NOT NULL
        AND btrim(url) <> ''
        AND video_provider IS NULL
        AND external_video_id IS NULL
      )
    ),
  CONSTRAINT tribe_story_media_video_shape_check
    CHECK (
      media_type <> 'video'
      OR (
        video_provider IS NOT NULL
        AND btrim(video_provider) <> ''
        AND external_video_id IS NOT NULL
        AND btrim(external_video_id) <> ''
      )
    ),
  CONSTRAINT tribe_story_media_image_url_protocol_check
    CHECK (url IS NULL OR url ~ '^https?://')
);

CREATE INDEX IF NOT EXISTS idx_tribe_story_media_tribe_sort
ON public.tribe_story_media(tribe_id, sort_order);

ALTER TABLE public.tribe_story_media ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tribe_story_media FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can read tribe story media"
ON public.tribe_story_media;
CREATE POLICY "Members can read tribe story media"
ON public.tribe_story_media
FOR SELECT
USING (public.can_read_tribe_story(tribe_id));

DROP POLICY IF EXISTS "Leaders can manage tribe story media"
ON public.tribe_story_media;
CREATE POLICY "Leaders can manage tribe story media"
ON public.tribe_story_media
FOR ALL
USING (public.can_manage_tribe_story(tribe_id))
WITH CHECK (public.can_manage_tribe_story(tribe_id));

-- Members read the story as before; non-members can read it only while the
-- tribe has a live open-join paid offer (mirrors the public join page rules,
-- including the conduct-blocked exclusion inside can_open_join_tribe_paid_plan).
CREATE OR REPLACE FUNCTION public.can_read_tribe_story_about(target_tribe_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.can_read_tribe_story(target_tribe_id)
    OR public.can_open_join_tribe_paid_plan(target_tribe_id);
$$;

CREATE OR REPLACE FUNCTION public.tribe_story_about(target_tribe_slug text)
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

CREATE OR REPLACE FUNCTION public.tribe_story_about_media(target_tribe_slug text)
RETURNS TABLE (
  id uuid,
  media_type text,
  url text,
  video_provider text,
  external_video_id text,
  sort_order integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    tribe_story_media.id,
    tribe_story_media.media_type,
    tribe_story_media.url,
    tribe_story_media.video_provider,
    tribe_story_media.external_video_id,
    tribe_story_media.sort_order
  FROM public.tribes
  INNER JOIN public.tribe_story_media
    ON tribe_story_media.tribe_id = tribes.id
  WHERE tribes.slug = target_tribe_slug
    AND public.can_read_tribe_story_about(tribes.id)
  ORDER BY tribe_story_media.sort_order ASC;
$$;

CREATE OR REPLACE FUNCTION public.tribe_story_about_stats(target_tribe_slug text)
RETURNS TABLE (
  name text,
  member_count bigint,
  admin_count bigint,
  created_at timestamptz
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
    tribes.created_at
  FROM public.tribes
  WHERE tribes.slug = target_tribe_slug
    AND public.can_read_tribe_story_about(tribes.id)
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.can_read_tribe_story_about(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.tribe_story_about(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.tribe_story_about_media(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.tribe_story_about_stats(text) FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.tribe_story_media TO authenticated;
    GRANT EXECUTE ON FUNCTION public.can_read_tribe_story_about(uuid) TO authenticated;
    GRANT EXECUTE ON FUNCTION public.tribe_story_about(text) TO authenticated;
    GRANT EXECUTE ON FUNCTION public.tribe_story_about_media(text) TO authenticated;
    GRANT EXECUTE ON FUNCTION public.tribe_story_about_stats(text) TO authenticated;
  END IF;
END $$;

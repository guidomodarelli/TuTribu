-- Add a persisted preview/thumbnail for external message videos so the feed and
-- the message modal can show the video poster while keeping playback exclusive
-- to the carousel.
--
-- Thumbnails are resolved lazily through each provider's oEmbed endpoint (Vimeo,
-- Wistia, Loom; YouTube is derived deterministically in the app and never stored
-- here). `thumbnail_resolved_at` marks that a resolution was attempted, so a
-- video without an available thumbnail (private, deleted, or oEmbed down) is not
-- re-fetched on every server render.

ALTER TABLE public.message_videos
  ADD COLUMN "thumbnail_url" text,
  ADD COLUMN "thumbnail_resolved_at" timestamptz;

-- A non-author tribemate is the one who usually triggers the lazy backfill while
-- viewing the round, but the per-row UPDATE policy only lets the message author
-- mutate the row. This SECURITY DEFINER function lets any member who can read the
-- tribe content persist the resolved thumbnail, while still reading the caller
-- from the session GUC (current_app_user_id) so authorization is not bypassed.
--
-- The update is idempotent: it only writes when no resolution was attempted yet,
-- so concurrent first renders of the same video collapse to a single effective
-- write and an already-resolved (or already-attempted) thumbnail is never
-- overwritten.
CREATE OR REPLACE FUNCTION public.set_message_video_thumbnail(
  target_video_id uuid,
  resolved_thumbnail_url text
)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  updated_count integer;
BEGIN
  UPDATE public.message_videos
  SET
    thumbnail_url = resolved_thumbnail_url,
    thumbnail_resolved_at = timezone('utc', now()),
    updated_at = timezone('utc', now())
  WHERE message_videos.id = target_video_id
    AND message_videos.thumbnail_resolved_at IS NULL
    AND public.can_read_tribe_content(message_videos.tribe_id);

  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RETURN updated_count > 0;
END;
$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    GRANT EXECUTE ON FUNCTION public.set_message_video_thumbnail(uuid, text)
      TO authenticated;
  END IF;
END;
$$;

-- Make the lazy oEmbed thumbnail backfill retry transient failures instead of
-- giving up forever on the first miss.
--
-- The original design persisted `thumbnail_resolved_at` on every attempt (even
-- when oEmbed returned nothing), so a video that failed once -- because the
-- provider was momentarily down, the media was still processing, or the request
-- timed out -- was never re-fetched and stayed without a preview permanently.
--
-- New semantics:
--   * `thumbnail_resolved_at IS NOT NULL` now marks a *terminal* state: either a
--     thumbnail was found, or the attempt cap was reached. The application keeps
--     reading it as "done, do not re-fetch".
--   * `thumbnail_attempts` counts how many resolution attempts ran.
--   * `thumbnail_last_attempt_at` records when the last attempt ran, so the
--     candidate query can enforce a cooldown between retries and avoid a
--     per-render fetch storm.
--
-- A failed attempt below the cap leaves `thumbnail_resolved_at` NULL, so the
-- video stays a candidate and is retried on a later render once the cooldown has
-- elapsed; the application owns the cap and cooldown values and passes them in.

ALTER TABLE public.message_videos
  ADD COLUMN "thumbnail_attempts" integer NOT NULL DEFAULT 0,
  ADD COLUMN "thumbnail_last_attempt_at" timestamptz;

-- Replace the 2-argument resolver with one that takes the attempt cap, so a
-- failed attempt only becomes terminal once the cap is reached. The previous
-- overload is dropped to avoid ambiguity.
DROP FUNCTION IF EXISTS public.set_message_video_thumbnail(uuid, text);

-- Persists a resolution attempt for a single video, idempotently and under RLS.
--
-- SECURITY DEFINER so any member who can read the tribe content (not only the
-- message author) can backfill while viewing the round; the caller is still
-- authorized through `can_read_tribe_content`, which reads the session GUC.
--
-- Each call records one attempt. The row becomes terminal
-- (`thumbnail_resolved_at` set) when a thumbnail is found, or when the attempt
-- count reaches `max_attempts`; otherwise it stays retryable. The guard
-- `thumbnail_resolved_at IS NULL` keeps an already-terminal row immutable and
-- collapses concurrent renders that race on the same not-yet-terminal video.
CREATE OR REPLACE FUNCTION public.set_message_video_thumbnail(
  target_video_id uuid,
  resolved_thumbnail_url text,
  max_attempts integer
)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  updated_count integer;
  now_utc timestamptz := timezone('utc', now());
BEGIN
  UPDATE public.message_videos
  SET
    thumbnail_url = resolved_thumbnail_url,
    thumbnail_attempts = message_videos.thumbnail_attempts + 1,
    thumbnail_last_attempt_at = now_utc,
    thumbnail_resolved_at = CASE
      WHEN resolved_thumbnail_url IS NOT NULL THEN now_utc
      WHEN message_videos.thumbnail_attempts + 1 >= max_attempts THEN now_utc
      ELSE NULL
    END,
    updated_at = now_utc
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
    GRANT EXECUTE ON FUNCTION public.set_message_video_thumbnail(uuid, text, integer)
      TO authenticated;
  END IF;
END;
$$;

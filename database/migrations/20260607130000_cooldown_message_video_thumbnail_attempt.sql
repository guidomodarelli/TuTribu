-- Make the lazy oEmbed thumbnail backfill count at most one *miss* per cooldown
-- window, so a transient provider outage cannot burn the whole attempt cap at
-- once and mark a recoverable video terminal.
--
-- The cooldown between attempts was enforced only in the candidate read query
-- (`listUnresolvedVideos`). When two or more renders scheduled the same
-- not-yet-terminal video before either persisted, they all passed that read
-- gate and then each ran the write, incrementing `thumbnail_attempts` once per
-- racing render -- because the write guard only checked `thumbnail_resolved_at
-- IS NULL`, which a miss leaves NULL. Three simultaneous transient misses could
-- therefore reach `max_attempts` in a single window and set
-- `thumbnail_resolved_at`, instead of spacing the attempts across cooldown
-- windows and recovering once the provider came back.
--
-- New write semantics:
--   * A successful attempt (a thumbnail was found) always persists while the row
--     is not yet terminal -- it is never blocked by the cooldown, so a racing
--     miss that just touched `thumbnail_last_attempt_at` can never drop a found
--     thumbnail.
--   * A miss only counts as a new attempt when `retry_cooldown_minutes` have
--     elapsed since `thumbnail_last_attempt_at` (or there was no prior attempt).
--     Under READ COMMITTED, concurrent misses serialize on the row lock and the
--     waiting statements re-evaluate this guard against the just-committed row,
--     so they collapse to a single counted attempt per window. The application
--     owns the cooldown value and passes it in, matching the read query.
--
-- Replace the 3-argument resolver with a 4-argument one that takes the cooldown.
-- The previous overload is dropped to avoid ambiguity.
DROP FUNCTION IF EXISTS public.set_message_video_thumbnail(uuid, text, integer);

CREATE OR REPLACE FUNCTION public.set_message_video_thumbnail(
  target_video_id uuid,
  resolved_thumbnail_url text,
  max_attempts integer,
  retry_cooldown_minutes integer
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
    AND public.can_read_tribe_content(message_videos.tribe_id)
    AND (
      resolved_thumbnail_url IS NOT NULL
      OR message_videos.thumbnail_last_attempt_at IS NULL
      OR message_videos.thumbnail_last_attempt_at
        < now_utc - make_interval(mins => retry_cooldown_minutes)
    );

  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RETURN updated_count > 0;
END;
$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    GRANT EXECUTE ON FUNCTION public.set_message_video_thumbnail(uuid, text, integer, integer)
      TO authenticated;
  END IF;
END;
$$;

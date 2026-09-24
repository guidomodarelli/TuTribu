-- Tribe events phase 3: attendance answers follow the occurrence exceptions.
--
-- respond_to_tribe_event_occurrence (phase 2, 20260923120000) refuses answers
-- once the occurrence ended, computing the end from the original start. With
-- per-date exceptions the occurrence keeps its stable key
-- (eventId@original_starts_at) but may be shown at another time:
--   * a moved date ends at its new time (new_ends_at, or new_starts_at plus
--     the series duration / 60 minutes), so "ended" uses that effective end
--     (a date moved later stays open, a date moved earlier closes earlier);
--   * a cancelled date takes no new answers (outcome 'cancelled'); clearing
--     an existing answer is still allowed.
-- Everything else is exactly the phase 2 function (FIFO promotion, active
-- members only through count_tribe_event_occupied_seats, advisory lock per
-- original start), so the promoted_at contract that later phases read is
-- unchanged. refill_tribe_event_waitlists keeps receiving original starts;
-- the application excludes cancelled dates and decides "ended" with the
-- effective times before calling it.

CREATE OR REPLACE FUNCTION public.respond_to_tribe_event_occurrence(
  target_slug text,
  target_event_id uuid,
  target_occurrence_starts_at timestamptz,
  requested_status text
)
RETURNS TABLE (
  outcome text,
  attendance_status text,
  promoted_count integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  viewer_id text := public.current_app_user_id();
  target_tribe_id uuid;
  event_capacity integer;
  event_duration interval;
  exception_kind text;
  effective_starts_at timestamptz;
  effective_ends_at timestamptz;
  previous_status text;
  resolved_status text;
  going_total integer;
  promoted_total integer := 0;
BEGIN
  IF viewer_id IS NULL THEN
    RETURN QUERY SELECT 'forbidden'::text, NULL::text, 0;
    RETURN;
  END IF;

  IF requested_status IS NOT NULL
    AND requested_status NOT IN ('going', 'maybe', 'not_going') THEN
    RETURN QUERY SELECT 'invalid'::text, NULL::text, 0;
    RETURN;
  END IF;

  SELECT
    events.tribe_id,
    events.capacity,
    -- Implicit duration without ends_at: TRIBE_EVENT_DEFAULT_DURATION_MINUTES.
    coalesce(events.ends_at - events.starts_at, interval '60 minutes')
  INTO target_tribe_id, event_capacity, event_duration
  FROM public.events
  INNER JOIN public.tribes
    ON tribes.id = events.tribe_id
  WHERE events.id = target_event_id
    AND tribes.slug = lower(trim(target_slug))
  FOR SHARE OF events;

  IF NOT FOUND THEN
    RETURN QUERY SELECT 'not_found'::text, NULL::text, 0;
    RETURN;
  END IF;

  IF NOT public.is_active_tribe_member(target_tribe_id) THEN
    RETURN QUERY SELECT 'forbidden'::text, NULL::text, 0;
    RETURN;
  END IF;

  -- The occurrence keeps its original start as key; a moved date is shown
  -- (and ends) at its new time, a cancelled date takes no new answers.
  SELECT
    event_occurrence_exceptions.kind,
    event_occurrence_exceptions.new_starts_at,
    event_occurrence_exceptions.new_ends_at
  INTO exception_kind, effective_starts_at, effective_ends_at
  FROM public.event_occurrence_exceptions
  WHERE event_occurrence_exceptions.event_id = target_event_id
    AND event_occurrence_exceptions.original_starts_at = target_occurrence_starts_at;

  IF exception_kind = 'cancelled' AND requested_status IS NOT NULL THEN
    RETURN QUERY SELECT 'cancelled'::text, NULL::text, 0;
    RETURN;
  END IF;

  IF exception_kind IS DISTINCT FROM 'moved' OR effective_starts_at IS NULL THEN
    effective_starts_at := target_occurrence_starts_at;
    effective_ends_at := NULL;
  END IF;

  effective_ends_at := coalesce(effective_ends_at, effective_starts_at + event_duration);

  -- Defense in depth behind the use case: answers of an occurrence are
  -- frozen once its effective end passed (in progress is still open).
  -- clock_timestamp() because the FOR SHARE above may have waited.
  IF effective_ends_at <= clock_timestamp() THEN
    RETURN QUERY SELECT 'ended'::text, NULL::text, 0;
    RETURN;
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended(
      'tribe_event_occurrence:' || target_event_id::text || '@'
        || extract(epoch FROM target_occurrence_starts_at)::text,
      0
    )
  );

  SELECT event_attendances.status
  INTO previous_status
  FROM public.event_attendances
  WHERE event_attendances.event_id = target_event_id
    AND event_attendances.occurrence_starts_at = target_occurrence_starts_at
    AND event_attendances.user_id = viewer_id
  FOR UPDATE;

  IF requested_status IS NULL THEN
    DELETE FROM public.event_attendances
    WHERE event_attendances.event_id = target_event_id
      AND event_attendances.occurrence_starts_at = target_occurrence_starts_at
      AND event_attendances.user_id = viewer_id;

    resolved_status := NULL;
  ELSIF requested_status = 'going'
    AND previous_status IN ('going', 'waitlisted') THEN
    resolved_status := previous_status;
  ELSIF requested_status = 'going' THEN
    -- FIFO: people already waiting take the free seats before a new
    -- "going" is counted, so a newcomer can never jump the line.
    promoted_total := public.promote_tribe_event_waitlist(
      target_event_id,
      target_occurrence_starts_at
    );

    going_total := public.count_tribe_event_occupied_seats(
      target_event_id,
      target_occurrence_starts_at
    );

    resolved_status := CASE
      WHEN event_capacity IS NULL OR going_total < event_capacity THEN 'going'
      ELSE 'waitlisted'
    END;
  ELSE
    resolved_status := requested_status;
  END IF;

  IF requested_status IS NOT NULL
    AND resolved_status IS DISTINCT FROM previous_status THEN
    INSERT INTO public.event_attendances AS event_attendances (
      event_id,
      tribe_id,
      occurrence_starts_at,
      user_id,
      status,
      created_at,
      updated_at,
      responded_at,
      promoted_at
    )
    VALUES (
      target_event_id,
      target_tribe_id,
      target_occurrence_starts_at,
      viewer_id,
      resolved_status,
      now(),
      now(),
      now(),
      NULL
    )
    ON CONFLICT (event_id, occurrence_starts_at, user_id)
    DO UPDATE SET
      status = excluded.status,
      updated_at = excluded.updated_at,
      responded_at = excluded.responded_at,
      promoted_at = NULL;
  END IF;

  -- Always try to fill free seats: covers a released seat and heals a
  -- waitlist left behind by an earlier capacity increase.
  promoted_total := promoted_total + public.promote_tribe_event_waitlist(
    target_event_id,
    target_occurrence_starts_at
  );

  IF requested_status IS NOT NULL THEN
    SELECT event_attendances.status
    INTO resolved_status
    FROM public.event_attendances
    WHERE event_attendances.event_id = target_event_id
      AND event_attendances.occurrence_starts_at = target_occurrence_starts_at
      AND event_attendances.user_id = viewer_id;
  END IF;

  RETURN QUERY SELECT
    CASE WHEN requested_status IS NULL THEN 'cleared' ELSE 'saved' END,
    resolved_status,
    promoted_total;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.respond_to_tribe_event_occurrence(text, uuid, timestamptz, text)
FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    GRANT EXECUTE ON FUNCTION public.respond_to_tribe_event_occurrence(text, uuid, timestamptz, text)
      TO authenticated;
  END IF;
END $$;

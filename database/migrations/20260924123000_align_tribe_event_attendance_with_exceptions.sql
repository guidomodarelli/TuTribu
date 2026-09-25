-- Tribe events phase 3: attendance, waitlists, and summaries follow the
-- per-date exceptions (event_occurrence_exceptions, 20260924121000).
--
-- An occurrence keeps its stable key (eventId@original_starts_at) after an
-- exception, but it may be shown at another time:
--   * a moved date ends at its new time (new_ends_at, or new_starts_at plus
--     the series duration / 60 minutes), so every "ended" rule uses that
--     effective end (a date moved later stays open, a date moved earlier
--     closes earlier);
--   * a cancelled date takes no new answers (outcome 'cancelled') and its
--     waitlist is never promoted; clearing an existing answer stays allowed.
--
-- Every function below is the phase 2 version (20260923120000) plus only the
-- exception rules: the global lock order (membership row -> event row ->
-- occurrence advisory lock), the end re-check with clock_timestamp() after
-- each lock, the active-membership re-check, the schedule_changed guard, FIFO
-- promotion of active members only (count_tribe_event_occupied_seats and
-- promote_tribe_event_waitlist, unchanged), and the promoted_at contract that
-- later phases hook into are all preserved.

-- 1. Owner exception on event_occurrence_exceptions. The SECURITY DEFINER
-- functions below run as the table owner and read the exceptions of any
-- tribe, also from the membership trigger, where no request user may be set
-- (webhooks, maintenance). Under FORCE RLS an owner without BYPASSRLS would
-- see no exception and treat a cancelled date as a normal one. That read is
-- covered by "Table owner manages event occurrence exceptions" (FOR ALL,
-- created with the table in 20260924121000), which authorizes only the
-- owner; request roles keep the tribemate read policy. The narrower
-- SELECT-only owner policy is dropped so a single owner policy remains.
DROP POLICY IF EXISTS "Table owner reads event occurrence exceptions"
ON public.event_occurrence_exceptions;

-- 2. Internal helper: state of one occurrence (identified by its original
-- start) under its exception. is_cancelled tells whether the date was
-- cancelled; effective_ends_at is the end of the date as it is held: the new
-- end of a moved date (new_ends_at, or new_starts_at plus the series
-- duration, or 60 minutes without ends_at, the same rule as the domain
-- resolveTribeEventOccurrenceException), otherwise
-- tribe_event_occurrence_ends_at of the original slot. Always returns one
-- row. STABLE because it reads the exceptions table; not SECURITY DEFINER and
-- owner-only: only the definer functions of this migration call it.
CREATE OR REPLACE FUNCTION public.resolve_tribe_event_occurrence_exception(
  target_event_id uuid,
  occurrence_starts_at timestamptz,
  event_starts_at timestamptz,
  event_ends_at timestamptz
)
RETURNS TABLE (
  is_cancelled boolean,
  effective_ends_at timestamptz
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT
    coalesce(occurrence_exception.kind = 'cancelled', false),
    CASE
      WHEN occurrence_exception.kind = 'moved'
        AND occurrence_exception.new_starts_at IS NOT NULL THEN
        coalesce(
          occurrence_exception.new_ends_at,
          occurrence_exception.new_starts_at
            + coalesce(event_ends_at - event_starts_at, interval '60 minutes')
        )
      ELSE public.tribe_event_occurrence_ends_at(
        occurrence_starts_at,
        event_starts_at,
        event_ends_at
      )
    END
  FROM (SELECT 1) AS anchor
  LEFT JOIN public.event_occurrence_exceptions AS occurrence_exception
    ON occurrence_exception.event_id = target_event_id
    AND occurrence_exception.original_starts_at = occurrence_starts_at;
$$;

REVOKE EXECUTE ON FUNCTION public.resolve_tribe_event_occurrence_exception(
  uuid, timestamptz, timestamptz, timestamptz
)
FROM PUBLIC;

-- 3. respond_to_tribe_event_occurrence: phase 2 contract (see 20260923120000,
-- section 6) plus the exceptions. The exception is read after the event row
-- lock: saving or restoring an exception locks the same event row FOR UPDATE
-- (PostgresTribeEventOccurrenceExceptionRepository), so it waits for in-flight
-- answers and answers that start later see the committed exception. A
-- cancelled date refuses new answers with 'cancelled' and is never promoted;
-- clearing an answer of a cancelled date is still allowed. "Ended" uses the
-- effective end (moved dates end at their new time), checked before and
-- again after the occurrence advisory lock with clock_timestamp().
CREATE OR REPLACE FUNCTION public.respond_to_tribe_event_occurrence(
  target_slug text,
  target_event_id uuid,
  target_occurrence_starts_at timestamptz,
  requested_status text,
  expected_starts_at timestamptz,
  expected_ends_at timestamptz,
  expected_recurrence_frequency text,
  expected_recurrence_until timestamptz
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
  event_starts_at timestamptz;
  event_ends_at timestamptz;
  occurrence_cancelled boolean;
  occurrence_ends_at timestamptz;
  schedule_changed boolean;
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

  -- Unlocked lookup of the tribe, only to know which membership row to lock
  -- first; the locked read of the event below re-checks it.
  SELECT events.tribe_id
  INTO target_tribe_id
  FROM public.events
  INNER JOIN public.tribes
    ON tribes.id = events.tribe_id
  WHERE events.id = target_event_id
    AND tribes.slug = lower(trim(target_slug));

  IF NOT FOUND THEN
    RETURN QUERY SELECT 'not_found'::text, NULL::text, 0;
    RETURN;
  END IF;

  -- Global lock order, step 1: the caller's membership row (see phase 2).
  PERFORM 1
  FROM public.tribe_members
  WHERE tribe_members.tribe_id = target_tribe_id
    AND tribe_members.user_id = viewer_id
    AND tribe_members.status = 'active'
  FOR SHARE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT 'forbidden'::text, NULL::text, 0;
    RETURN;
  END IF;

  -- Global lock order, step 2: the event row.
  SELECT
    events.capacity,
    events.starts_at,
    events.ends_at,
    -- Milliseconds: the application parses the schedule with JS dates.
    (
      date_trunc('milliseconds', events.starts_at),
      date_trunc('milliseconds', events.ends_at),
      events.recurrence_frequency,
      date_trunc('milliseconds', events.recurrence_until)
    ) IS DISTINCT FROM (
      expected_starts_at,
      expected_ends_at,
      expected_recurrence_frequency,
      expected_recurrence_until
    )
  INTO event_capacity, event_starts_at, event_ends_at, schedule_changed
  FROM public.events
  INNER JOIN public.tribes
    ON tribes.id = events.tribe_id
  WHERE events.id = target_event_id
    AND events.tribe_id = target_tribe_id
    AND tribes.slug = lower(trim(target_slug))
  FOR SHARE OF events;

  IF NOT FOUND THEN
    RETURN QUERY SELECT 'not_found'::text, NULL::text, 0;
    RETURN;
  END IF;

  -- The occurrence was validated against the schedule read before this
  -- lock; under the lock the schedule can no longer change, so an equal
  -- schedule proves the occurrence is still a slot of the series.
  IF schedule_changed THEN
    RETURN QUERY SELECT 'schedule_changed'::text, NULL::text, 0;
    RETURN;
  END IF;

  -- Exception of this date, read under the event row lock (exception writes
  -- lock the same row FOR UPDATE, so it cannot change until commit).
  SELECT occurrence_state.is_cancelled, occurrence_state.effective_ends_at
  INTO occurrence_cancelled, occurrence_ends_at
  FROM public.resolve_tribe_event_occurrence_exception(
    target_event_id,
    target_occurrence_starts_at,
    event_starts_at,
    event_ends_at
  ) AS occurrence_state;

  IF occurrence_cancelled AND requested_status IS NOT NULL THEN
    RETURN QUERY SELECT 'cancelled'::text, NULL::text, 0;
    RETURN;
  END IF;

  -- Answers are frozen once the effective end passed (in progress is still
  -- open). clock_timestamp() because the locks above may have waited.
  IF occurrence_ends_at <= clock_timestamp() THEN
    RETURN QUERY SELECT 'ended'::text, NULL::text, 0;
    RETURN;
  END IF;

  -- Global lock order, step 3: the occurrence advisory lock (original start).
  PERFORM pg_advisory_xact_lock(
    hashtextextended(
      'tribe_event_occurrence:' || target_event_id::text || '@'
        || extract(epoch FROM target_occurrence_starts_at)::text,
      0
    )
  );

  -- Same check again: this call may have waited on the advisory lock behind
  -- another answer until after the effective end.
  IF occurrence_ends_at <= clock_timestamp() THEN
    RETURN QUERY SELECT 'ended'::text, NULL::text, 0;
    RETURN;
  END IF;

  -- Authoritative re-check after the advisory lock, with this statement's
  -- fresh READ COMMITTED snapshot (see phase 2).
  IF NOT EXISTS (
    SELECT 1
    FROM public.tribe_members
    WHERE tribe_members.tribe_id = target_tribe_id
      AND tribe_members.user_id = viewer_id
      AND tribe_members.status = 'active'
  ) THEN
    RETURN QUERY SELECT 'forbidden'::text, NULL::text, 0;
    RETURN;
  END IF;

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
  -- waitlist left behind by an earlier capacity increase. A cancelled date
  -- (only reachable here when clearing an answer) takes nobody from its
  -- waitlist.
  IF NOT occurrence_cancelled THEN
    promoted_total := promoted_total + public.promote_tribe_event_waitlist(
      target_event_id,
      target_occurrence_starts_at
    );
  END IF;

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

REVOKE EXECUTE ON FUNCTION public.respond_to_tribe_event_occurrence(
  text, uuid, timestamptz, text, timestamptz, timestamptz, text, timestamptz
)
FROM PUBLIC;

-- 4. refill_tribe_event_waitlists: phase 2 contract (section 7) plus the
-- exceptions. The application still sends the original starts that are
-- slots of the UPDATED schedule and not cancelled (selectRefillable...
-- WaitlistOccurrenceStarts); under each occurrence lock the function skips a
-- date that is cancelled or whose EFFECTIVE end already passed, so a date
-- moved later is refilled while it is ahead and a date moved earlier stays
-- frozen once it ended at its new time.
CREATE OR REPLACE FUNCTION public.refill_tribe_event_waitlists(
  target_event_id uuid,
  valid_occurrence_starts timestamptz[]
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_tribe_id uuid;
  event_starts_at timestamptz;
  event_ends_at timestamptz;
  waitlisted_occurrence timestamptz;
  occurrence_cancelled boolean;
  occurrence_ends_at timestamptz;
  promoted_total integer := 0;
BEGIN
  IF public.current_app_user_id() IS NULL THEN
    RETURN 0;
  END IF;

  SELECT events.tribe_id, events.starts_at, events.ends_at
  INTO target_tribe_id, event_starts_at, event_ends_at
  FROM public.events
  WHERE events.id = target_event_id
  FOR UPDATE;

  IF NOT FOUND OR NOT public.can_manage_tribe_events(target_tribe_id) THEN
    RETURN 0;
  END IF;

  FOR waitlisted_occurrence IN
    SELECT DISTINCT event_attendances.occurrence_starts_at
    FROM public.event_attendances
    WHERE event_attendances.event_id = target_event_id
      AND event_attendances.status = 'waitlisted'
      AND event_attendances.occurrence_starts_at = ANY(
        coalesce(valid_occurrence_starts, ARRAY[]::timestamptz[])
      )
    ORDER BY event_attendances.occurrence_starts_at ASC
  LOOP
    PERFORM pg_advisory_xact_lock(
      hashtextextended(
        'tribe_event_occurrence:' || target_event_id::text || '@'
          || extract(epoch FROM waitlisted_occurrence)::text,
        0
      )
    );

    SELECT occurrence_state.is_cancelled, occurrence_state.effective_ends_at
    INTO occurrence_cancelled, occurrence_ends_at
    FROM public.resolve_tribe_event_occurrence_exception(
      target_event_id,
      waitlisted_occurrence,
      event_starts_at,
      event_ends_at
    ) AS occurrence_state;

    -- This call may have waited on the advisory lock until after the end.
    IF occurrence_cancelled OR occurrence_ends_at <= clock_timestamp() THEN
      CONTINUE;
    END IF;

    promoted_total := promoted_total + public.promote_tribe_event_waitlist(
      target_event_id,
      waitlisted_occurrence
    );
  END LOOP;

  RETURN promoted_total;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.refill_tribe_event_waitlists(uuid, timestamptz[])
FROM PUBLIC;

-- 5. Membership trigger function: phase 2 contract (section 7c) plus the
-- exceptions. Occurrences are still identified by their original start (the
-- attendance key and the advisory lock), is_tribe_event_series_occurrence
-- still checks that original start against the current schedule, and both
-- the pre-lock scan and the post-lock re-check use the effective end of moved
-- dates. Only the post-lock re-check skips cancelled dates: the pre-lock scan
-- keeps them because a concurrent restore may be deleting the exception (see
-- the comment in the scan). The lock order (membership row, event row
-- FOR SHARE, occurrence advisory locks in ascending order) is unchanged.
CREATE OR REPLACE FUNCTION public.promote_tribe_event_waitlists_after_membership_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  affected_tribe_id uuid;
  affected_user_id text;
  scanned_attendance_statuses text[];
  promotes_every_tribe_waitlist boolean := false;
  affected_occurrence record;
  locked_starts_at timestamptz;
  locked_ends_at timestamptz;
  locked_recurrence_frequency text;
  locked_recurrence_until timestamptz;
  occurrence_cancelled boolean;
  occurrence_ends_at timestamptz;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status IS DISTINCT FROM 'active' THEN
      RETURN NULL;
    END IF;

    affected_tribe_id := OLD.tribe_id;
    affected_user_id := OLD.user_id;
    promotes_every_tribe_waitlist := true;
  ELSE
    IF (OLD.status = 'active') IS NOT DISTINCT FROM (NEW.status = 'active') THEN
      RETURN NULL;
    END IF;

    affected_tribe_id := NEW.tribe_id;
    affected_user_id := NEW.user_id;
    scanned_attendance_statuses := CASE
      WHEN NEW.status = 'active' THEN ARRAY['waitlisted']
      ELSE ARRAY['going', 'waitlisted']
    END;
  END IF;

  FOR affected_occurrence IN
    SELECT DISTINCT
      event_attendances.event_id,
      event_attendances.occurrence_starts_at
    FROM public.event_attendances
    INNER JOIN public.events
      ON events.id = event_attendances.event_id
    CROSS JOIN LATERAL public.resolve_tribe_event_occurrence_exception(
      event_attendances.event_id,
      event_attendances.occurrence_starts_at,
      events.starts_at,
      events.ends_at
    ) AS occurrence_state
    WHERE event_attendances.tribe_id = affected_tribe_id
      AND CASE
        WHEN promotes_every_tribe_waitlist THEN
          event_attendances.status = 'waitlisted'
        ELSE
          event_attendances.user_id = affected_user_id
          AND event_attendances.status = ANY(scanned_attendance_statuses)
      END
      -- No cancellation filter here: this scan takes no lock, so a restore
      -- (or a move of a cancelled date) still in flight shows the old
      -- 'cancelled' exception, while that restore refills against a snapshot
      -- where this membership is still active. Keeping cancelled candidates
      -- makes this trigger wait on the event row and re-check the exception
      -- under the locks below. The end filter stays: restoring or moving a
      -- date is refused once its current effective end passed.
      AND occurrence_state.effective_ends_at > clock_timestamp()
    ORDER BY event_attendances.event_id ASC, event_attendances.occurrence_starts_at ASC
  LOOP
    SELECT
      events.starts_at,
      events.ends_at,
      events.recurrence_frequency,
      events.recurrence_until
    INTO
      locked_starts_at,
      locked_ends_at,
      locked_recurrence_frequency,
      locked_recurrence_until
    FROM public.events
    WHERE events.id = affected_occurrence.event_id
    FOR SHARE;

    IF NOT FOUND THEN
      CONTINUE;
    END IF;

    PERFORM pg_advisory_xact_lock(
      hashtextextended(
        'tribe_event_occurrence:' || affected_occurrence.event_id::text || '@'
          || extract(epoch FROM affected_occurrence.occurrence_starts_at)::text,
        0
      )
    );

    SELECT occurrence_state.is_cancelled, occurrence_state.effective_ends_at
    INTO occurrence_cancelled, occurrence_ends_at
    FROM public.resolve_tribe_event_occurrence_exception(
      affected_occurrence.event_id,
      affected_occurrence.occurrence_starts_at,
      locked_starts_at,
      locked_ends_at
    ) AS occurrence_state;

    IF NOT public.is_tribe_event_series_occurrence(
      affected_occurrence.occurrence_starts_at,
      locked_starts_at,
      locked_recurrence_frequency,
      locked_recurrence_until
    ) OR occurrence_cancelled OR occurrence_ends_at <= clock_timestamp() THEN
      CONTINUE;
    END IF;

    PERFORM public.promote_tribe_event_waitlist(
      affected_occurrence.event_id,
      affected_occurrence.occurrence_starts_at
    );
  END LOOP;

  RETURN NULL;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.promote_tribe_event_waitlists_after_membership_change()
FROM PUBLIC;

-- 6. summarize_tribe_event_attendances: phase 2 contract (section 8) plus
-- include_moved_in. Answers keep the original start as key, so a month that
-- shows a date moved in from another month also needs the summary of that
-- original start: with include_moved_in = true, a row also matches when its
-- date has a moved exception whose new interval overlaps the range
-- (match_overlapping) or whose new start falls inside it. The extra argument
-- changes the signature, so the phase 2 overload is dropped first; callers
-- with six arguments keep working through the default.
DROP FUNCTION IF EXISTS public.summarize_tribe_event_attendances(
  text, timestamptz, timestamptz, boolean, integer, uuid
);

CREATE OR REPLACE FUNCTION public.summarize_tribe_event_attendances(
  target_slug text,
  range_start timestamptz,
  range_end timestamptz,
  match_overlapping boolean,
  preview_limit integer,
  target_event_id uuid DEFAULT NULL,
  include_moved_in boolean DEFAULT false
)
RETURNS TABLE (
  event_id uuid,
  occurrence_starts_at timestamptz,
  going_count integer,
  maybe_count integer,
  waitlisted_count integer,
  viewer_status text,
  viewer_waitlist_position integer,
  going_preview jsonb
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH target_tribe AS (
    SELECT tribes.id
    FROM public.tribes
    WHERE tribes.slug = lower(trim(target_slug))
    LIMIT 1
  ),
  readable_attendances AS (
    SELECT
      event_attendances.id,
      event_attendances.event_id,
      event_attendances.occurrence_starts_at,
      event_attendances.user_id,
      event_attendances.status,
      event_attendances.responded_at,
      coalesce(tribe_members.status = 'active', false) AS is_active_member
    FROM public.event_attendances
    INNER JOIN target_tribe
      ON target_tribe.id = event_attendances.tribe_id
    INNER JOIN public.events
      ON events.id = event_attendances.event_id
    LEFT JOIN public.tribe_members
      ON tribe_members.tribe_id = event_attendances.tribe_id
      AND tribe_members.user_id = event_attendances.user_id
    WHERE public.current_app_user_id() IS NOT NULL
      AND public.can_read_tribe_content(target_tribe.id)
      AND (target_event_id IS NULL OR event_attendances.event_id = target_event_id)
      AND (
        (
          event_attendances.occurrence_starts_at < range_end
          AND CASE
            WHEN match_overlapping THEN
              public.tribe_event_occurrence_ends_at(
                event_attendances.occurrence_starts_at,
                events.starts_at,
                events.ends_at
              ) > range_start
            ELSE event_attendances.occurrence_starts_at >= range_start
          END
        )
        OR (
          include_moved_in
          AND EXISTS (
            SELECT 1
            FROM public.event_occurrence_exceptions AS moved_exception
            WHERE moved_exception.event_id = event_attendances.event_id
              AND moved_exception.original_starts_at = event_attendances.occurrence_starts_at
              AND moved_exception.kind = 'moved'
              AND moved_exception.new_starts_at < range_end
              AND CASE
                WHEN match_overlapping THEN
                  coalesce(
                    moved_exception.new_ends_at,
                    moved_exception.new_starts_at
                      + coalesce(events.ends_at - events.starts_at, interval '60 minutes')
                  ) > range_start
                ELSE moved_exception.new_starts_at >= range_start
              END
          )
        )
      )
  ),
  ranked_attendances AS (
    SELECT
      readable_attendances.*,
      -- Ranked per membership state, so positions of active members ignore
      -- inactive ones; only active ranks are read below.
      row_number() OVER (
        PARTITION BY
          readable_attendances.event_id,
          readable_attendances.occurrence_starts_at,
          readable_attendances.status,
          readable_attendances.is_active_member
        ORDER BY readable_attendances.responded_at ASC, readable_attendances.id ASC
      ) AS status_rank
    FROM readable_attendances
  )
  SELECT
    ranked_attendances.event_id,
    ranked_attendances.occurrence_starts_at,
    (count(*) FILTER (
      WHERE ranked_attendances.is_active_member AND ranked_attendances.status = 'going'
    ))::integer,
    (count(*) FILTER (
      WHERE ranked_attendances.is_active_member AND ranked_attendances.status = 'maybe'
    ))::integer,
    (count(*) FILTER (
      WHERE ranked_attendances.is_active_member AND ranked_attendances.status = 'waitlisted'
    ))::integer,
    max(ranked_attendances.status) FILTER (
      WHERE ranked_attendances.user_id = public.current_app_user_id()
    ),
    (max(ranked_attendances.status_rank) FILTER (
      WHERE ranked_attendances.user_id = public.current_app_user_id()
        AND ranked_attendances.is_active_member
        AND ranked_attendances.status = 'waitlisted'
    ))::integer,
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', preview_users.id,
          'name', preview_users.name,
          'image', preview_users.image
        )
        ORDER BY ranked_attendances.status_rank
      ) FILTER (WHERE preview_users.id IS NOT NULL),
      '[]'::jsonb
    )
  FROM ranked_attendances
  LEFT JOIN public."user" preview_users
    ON preview_users.id = ranked_attendances.user_id
    AND ranked_attendances.is_active_member
    AND ranked_attendances.status = 'going'
    AND ranked_attendances.status_rank <= preview_limit
  GROUP BY ranked_attendances.event_id, ranked_attendances.occurrence_starts_at;
$$;

REVOKE EXECUTE ON FUNCTION public.summarize_tribe_event_attendances(
  text, timestamptz, timestamptz, boolean, integer, uuid, boolean
)
FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    GRANT EXECUTE ON FUNCTION public.respond_to_tribe_event_occurrence(
      text, uuid, timestamptz, text, timestamptz, timestamptz, text, timestamptz
    ) TO authenticated;
    GRANT EXECUTE ON FUNCTION public.summarize_tribe_event_attendances(
      text, timestamptz, timestamptz, boolean, integer, uuid, boolean
    ) TO authenticated;
    GRANT EXECUTE ON FUNCTION public.refill_tribe_event_waitlists(uuid, timestamptz[])
      TO authenticated;
  END IF;
END $$;

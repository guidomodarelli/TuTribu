-- Tribe events phase 2: "maybe" answers, optional capacity with a FIFO
-- waitlist, and the bookkeeping needed to notify promotions later.
--
-- Writes to event_attendances move behind SECURITY DEFINER functions: the
-- seat assignment (going vs waitlisted) and the promotion of the next person
-- in line must be atomic and may touch another member's row, which a
-- row-owner RLS policy can never allow.

-- 1. Optional capacity per series (NULL = unlimited). Lowering it below the
-- people already going never removes anyone; it only stops new seats.
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS capacity integer;

ALTER TABLE public.events
  DROP CONSTRAINT IF EXISTS events_valid_capacity;

ALTER TABLE public.events
  ADD CONSTRAINT events_valid_capacity CHECK (capacity IS NULL OR capacity > 0);

-- 2. Attendance statuses, response time, and promotion time.
ALTER TABLE public.event_attendances
  ADD COLUMN IF NOT EXISTS responded_at timestamptz;

UPDATE public.event_attendances
SET responded_at = updated_at
WHERE responded_at IS NULL;

ALTER TABLE public.event_attendances
  ALTER COLUMN responded_at SET DEFAULT timezone('utc', now());

ALTER TABLE public.event_attendances
  ALTER COLUMN responded_at SET NOT NULL;

ALTER TABLE public.event_attendances
  ADD COLUMN IF NOT EXISTS promoted_at timestamptz;

ALTER TABLE public.event_attendances
  DROP CONSTRAINT IF EXISTS event_attendances_valid_status;

ALTER TABLE public.event_attendances
  ADD CONSTRAINT event_attendances_valid_status CHECK (
    status IN ('going', 'maybe', 'not_going', 'waitlisted')
  );

ALTER TABLE public.event_attendances
  DROP CONSTRAINT IF EXISTS event_attendances_promoted_only_going;

ALTER TABLE public.event_attendances
  ADD CONSTRAINT event_attendances_promoted_only_going CHECK (
    promoted_at IS NULL OR status = 'going'
  );

-- 3. Indexes for the range summary, the viewer streak, the FIFO waitlist,
-- the going preview, and the future promotion notifications.
CREATE INDEX IF NOT EXISTS idx_event_attendances_tribe_occurrence
ON public.event_attendances(tribe_id, occurrence_starts_at);

CREATE INDEX IF NOT EXISTS idx_event_attendances_tribe_user_occurrence
ON public.event_attendances(tribe_id, user_id, occurrence_starts_at);

DROP INDEX IF EXISTS public.idx_event_attendances_tribe_user;

CREATE INDEX IF NOT EXISTS idx_event_attendances_waitlist_queue
ON public.event_attendances(event_id, occurrence_starts_at, responded_at, id)
WHERE status = 'waitlisted';

CREATE INDEX IF NOT EXISTS idx_event_attendances_going_preview
ON public.event_attendances(event_id, occurrence_starts_at, responded_at, id)
WHERE status = 'going';

CREATE INDEX IF NOT EXISTS idx_event_attendances_promoted_at
ON public.event_attendances(promoted_at)
WHERE promoted_at IS NOT NULL;

-- 4. RLS: members keep reading attendance of tribes they can read; direct
-- writes are removed so every write goes through the functions below.
DROP POLICY IF EXISTS "Active members can record own event attendance"
ON public.event_attendances;

DROP POLICY IF EXISTS "Active members can update own event attendance"
ON public.event_attendances;

DROP POLICY IF EXISTS "Active members can remove own event attendance"
ON public.event_attendances;

-- Owner exception: lets the SECURITY DEFINER functions (which run as the
-- table owner) write under FORCE RLS even where the owner has no BYPASSRLS.
-- It authorizes only the owner; every request role stays denied.
DROP POLICY IF EXISTS "Table owner manages event attendances"
ON public.event_attendances;
CREATE POLICY "Table owner manages event attendances"
ON public.event_attendances
FOR ALL
USING (
  current_user = (
    SELECT pg_get_userbyid(pg_class.relowner)
    FROM pg_class
    WHERE pg_class.oid = 'public.event_attendances'::regclass
  )
)
WITH CHECK (
  current_user = (
    SELECT pg_get_userbyid(pg_class.relowner)
    FROM pg_class
    WHERE pg_class.oid = 'public.event_attendances'::regclass
  )
);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE INSERT, UPDATE, DELETE ON public.event_attendances FROM authenticated;
    GRANT SELECT ON public.event_attendances TO authenticated;
  END IF;
END $$;

-- Owner exception on tribe_members (SELECT only): the seat accounting below
-- reads the membership of every attendee, and tribe_members only lets a
-- request role read its own rows. Without it an owner without BYPASSRLS
-- would count only the caller as active. Request roles stay unaffected.
DROP POLICY IF EXISTS "Table owner reads tribe memberships"
ON public.tribe_members;
CREATE POLICY "Table owner reads tribe memberships"
ON public.tribe_members
FOR SELECT
USING (
  current_user = (
    SELECT pg_get_userbyid(pg_class.relowner)
    FROM pg_class
    WHERE pg_class.oid = 'public.tribe_members'::regclass
  )
);

-- 5a. Internal helper: seats taken in one occurrence. Only answers of active
-- tribe members count, so a member blocked or removed after answering never
-- holds a seat. Their row is kept: if they become active again, a "going"
-- counts again (possibly above capacity; like lowering the capacity, nobody
-- is removed) and a "waitlisted" answer keeps its original FIFO position.
-- Owner-only: it performs no authorization.
CREATE OR REPLACE FUNCTION public.count_tribe_event_occupied_seats(
  target_event_id uuid,
  target_occurrence_starts_at timestamptz
)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT count(*)::integer
  FROM public.event_attendances
  INNER JOIN public.tribe_members
    ON tribe_members.tribe_id = event_attendances.tribe_id
    AND tribe_members.user_id = event_attendances.user_id
  WHERE event_attendances.event_id = target_event_id
    AND event_attendances.occurrence_starts_at = target_occurrence_starts_at
    AND event_attendances.status = 'going'
    AND tribe_members.status = 'active';
$$;

REVOKE EXECUTE ON FUNCTION public.count_tribe_event_occupied_seats(uuid, timestamptz)
FROM PUBLIC;

-- 5b. Internal helper: promotes the oldest waitlisted answers (FIFO by
-- responded_at, then id) of active tribe members while the occurrence has
-- free seats. Waitlisted answers of inactive members are skipped (never
-- promoted, never marked with promoted_at). With no capacity every eligible
-- waitlisted answer is promoted. Callers must hold the occurrence advisory
-- lock. Owner-only: it performs no authorization.
CREATE OR REPLACE FUNCTION public.promote_tribe_event_waitlist(
  target_event_id uuid,
  target_occurrence_starts_at timestamptz
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  event_capacity integer;
  going_total integer;
  promoted_total integer;
BEGIN
  SELECT events.capacity
  INTO event_capacity
  FROM public.events
  WHERE events.id = target_event_id;

  going_total := public.count_tribe_event_occupied_seats(
    target_event_id,
    target_occurrence_starts_at
  );

  WITH next_in_line AS (
    SELECT event_attendances.id
    FROM public.event_attendances
    WHERE event_attendances.event_id = target_event_id
      AND event_attendances.occurrence_starts_at = target_occurrence_starts_at
      AND event_attendances.status = 'waitlisted'
      AND EXISTS (
        SELECT 1
        FROM public.tribe_members
        WHERE tribe_members.tribe_id = event_attendances.tribe_id
          AND tribe_members.user_id = event_attendances.user_id
          AND tribe_members.status = 'active'
      )
    ORDER BY event_attendances.responded_at ASC, event_attendances.id ASC
    -- LIMIT NULL means "no limit" (unlimited capacity).
    LIMIT CASE
      WHEN event_capacity IS NULL THEN NULL
      ELSE greatest(event_capacity - going_total, 0)
    END
    FOR UPDATE OF event_attendances
  )
  UPDATE public.event_attendances
  SET
    status = 'going',
    promoted_at = now(),
    updated_at = now()
  FROM next_in_line
  WHERE event_attendances.id = next_in_line.id;

  GET DIAGNOSTICS promoted_total = ROW_COUNT;

  RETURN promoted_total;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.promote_tribe_event_waitlist(uuid, timestamptz)
FROM PUBLIC;

-- 6. Records, changes, or clears (requested_status NULL) the caller's answer
-- for one occurrence. Refuses with outcome 'ended' once the occurrence's
-- effective end (its own ends_at offset, or 60 minutes) passed. Concurrency
-- contract:
--   * the event row is locked FOR SHARE first, so a capacity edit waits for
--     in-flight answers and answers see the committed capacity;
--   * then a transaction advisory lock per occurrence serializes seat
--     assignment and promotion, so two members can never both take the last
--     seat;
--   * repeating the same answer is a no-op (keeps the seat or the waitlist
--     position), so client retries are idempotent;
--   * a new "going" first promotes whoever is already waiting (FIFO), and
--     only then takes a free seat or joins the end of the waitlist.
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

  -- Defense in depth behind the use case: answers of an occurrence are
  -- frozen once its effective end passed (in progress is still open).
  -- clock_timestamp() because the FOR SHARE above may have waited.
  IF target_occurrence_starts_at + event_duration <= clock_timestamp() THEN
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

-- 7. After an edit (capacity raised or removed), promotes the waitlists of
-- the series occurrences listed in valid_occurrence_starts. The application
-- computes that list with the domain series expansion of the UPDATED
-- schedule and keeps only occurrences that have not ended yet (in progress
-- included, with the implicit duration when there is no ends_at), so:
--   * attendance rows of dates that no longer exist after a schedule edit
--     are never promoted nor marked with promoted_at (they stay as history,
--     they are not deleted);
--   * an occurrence in progress is refilled, keeping FIFO before new answers.
-- The recurrence rules (Buenos Aires wall clock, skipped monthly days) live
-- only in the domain, so SQL does not duplicate them; it only intersects the
-- list with the rows that are actually waitlisted.
-- Runs in the same transaction as the event UPDATE, which already holds the
-- event row lock; advisory locks are then taken in ascending date order
-- (same lock order as 6, so no deadlocks).
DROP FUNCTION IF EXISTS public.refill_tribe_event_waitlists(uuid);

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
  waitlisted_occurrence timestamptz;
  promoted_total integer := 0;
BEGIN
  IF public.current_app_user_id() IS NULL THEN
    RETURN 0;
  END IF;

  SELECT events.tribe_id
  INTO target_tribe_id
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

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    GRANT EXECUTE ON FUNCTION public.respond_to_tribe_event_occurrence(text, uuid, timestamptz, text)
      TO authenticated;
    GRANT EXECUTE ON FUNCTION public.refill_tribe_event_waitlists(uuid, timestamptz[])
      TO authenticated;
  END IF;
END $$;

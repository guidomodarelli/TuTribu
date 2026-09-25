-- Phase 5: in-app notifications.
--
-- A generic inbox: one row per (recipient, notification). The payload holds
-- only ids and instants typed per notification type; the UI builds the copy.
-- UNIQUE (recipient_user_id, dedupe_key) makes every producer idempotent:
-- cron retries, parallel cron runs, and repeated mutations never duplicate a
-- notification (producers insert with ON CONFLICT DO NOTHING).
--
-- Producers:
--   * event reminders (24 h / 15 min): the maintenance cron enqueues them
--     through owner-only SECURITY DEFINER functions (section 8), so a
--     dedicated maintenance role with only EXECUTE on them works as well as
--     the owner, see
--     src/modules/events/application/use-cases/send-tribe-event-reminders-use-case.ts;
--   * waitlist promotion, proposal review, and occurrence cancel/move: AFTER
--     triggers (SECURITY DEFINER, owner-only) on the source tables, so the
--     notification is written in the SAME transaction as the change that
--     causes it; a rollback of the change leaves no notification.
--
-- Recipients only ever read and mark as read their own rows. Inserts and the
-- retention purge belong to the table owner (triggers and the section 8
-- maintenance functions, which run with the owner's rights).

-- 1. Table.
CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_user_id text NOT NULL REFERENCES public."user"(id) ON DELETE CASCADE,
  tribe_id uuid NOT NULL REFERENCES public.tribes(id) ON DELETE CASCADE,
  type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  dedupe_key text NOT NULL,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT notifications_valid_type CHECK (
    type IN (
      'event_reminder_24h',
      'event_reminder_15m',
      'event_waitlist_promoted',
      'event_proposal_reviewed',
      'event_occurrence_cancelled',
      'event_occurrence_moved'
    )
  ),
  CONSTRAINT notifications_payload_is_object CHECK (jsonb_typeof(payload) = 'object'),
  CONSTRAINT notifications_valid_dedupe_key CHECK (length(dedupe_key) BETWEEN 1 AND 300),
  CONSTRAINT notifications_recipient_dedupe_key UNIQUE (recipient_user_id, dedupe_key)
);

-- Inbox (newest first) and the unread badge.
CREATE INDEX IF NOT EXISTS idx_notifications_recipient_created
ON public.notifications(recipient_user_id, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_recipient_unread
ON public.notifications(recipient_user_id)
WHERE read_at IS NULL;

-- Retention purge of read notifications.
CREATE INDEX IF NOT EXISTS idx_notifications_read_at
ON public.notifications(read_at)
WHERE read_at IS NOT NULL;

-- 2. RLS: recipients read and mark their own rows; the owner produces and
-- purges. No user INSERT or DELETE policy exists.
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Recipients can read own notifications" ON public.notifications;
CREATE POLICY "Recipients can read own notifications"
ON public.notifications
FOR SELECT
USING (recipient_user_id = public.current_app_user_id());

DROP POLICY IF EXISTS "Recipients can mark own notifications as read" ON public.notifications;
CREATE POLICY "Recipients can mark own notifications as read"
ON public.notifications
FOR UPDATE
USING (recipient_user_id = public.current_app_user_id())
WITH CHECK (recipient_user_id = public.current_app_user_id());

-- Owner exception: producers (owner-only SECURITY DEFINER triggers and the
-- maintenance cron) insert and purge under FORCE RLS even where the owner has
-- no BYPASSRLS. Only the owner matches; every request role stays denied.
DROP POLICY IF EXISTS "Table owner manages notifications" ON public.notifications;
CREATE POLICY "Table owner manages notifications"
ON public.notifications
FOR ALL
USING (
  current_user = (
    SELECT pg_get_userbyid(pg_class.relowner)
    FROM pg_class
    WHERE pg_class.oid = 'public.notifications'::regclass
  )
)
WITH CHECK (
  current_user = (
    SELECT pg_get_userbyid(pg_class.relowner)
    FROM pg_class
    WHERE pg_class.oid = 'public.notifications'::regclass
  )
);

-- A recipient may only set read_at (once); every other column is immutable
-- for them. Defense in depth next to the column grant below, because the
-- request role's table grants are provisioned outside the migrations.
CREATE OR REPLACE FUNCTION public.guard_notification_recipient_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF current_user = (
    SELECT pg_get_userbyid(pg_class.relowner)
    FROM pg_class
    WHERE pg_class.oid = 'public.notifications'::regclass
  ) THEN
    RETURN NEW;
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id
    OR NEW.recipient_user_id IS DISTINCT FROM OLD.recipient_user_id
    OR NEW.tribe_id IS DISTINCT FROM OLD.tribe_id
    OR NEW.type IS DISTINCT FROM OLD.type
    OR NEW.payload IS DISTINCT FROM OLD.payload
    OR NEW.dedupe_key IS DISTINCT FROM OLD.dedupe_key
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
    OR (OLD.read_at IS NOT NULL AND NEW.read_at IS DISTINCT FROM OLD.read_at) THEN
    RAISE EXCEPTION 'notifications: recipients may only mark a notification as read'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.guard_notification_recipient_update() FROM PUBLIC;

DROP TRIGGER IF EXISTS guard_notification_recipient_update ON public.notifications;
CREATE TRIGGER guard_notification_recipient_update
BEFORE UPDATE ON public.notifications
FOR EACH ROW
EXECUTE FUNCTION public.guard_notification_recipient_update();

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON public.notifications FROM authenticated;
    GRANT SELECT ON public.notifications TO authenticated;
    GRANT UPDATE (read_at) ON public.notifications TO authenticated;
  END IF;
END $$;

-- 3. Owner exception (SELECT) on the tables the producers read. The
-- reminder cron runs without an app user and the triggers read other
-- members' rows; on a deployment whose owner has no BYPASSRLS, FORCE RLS
-- would otherwise hide every row from them. event_attendances already has
-- an owner FOR ALL policy (20260923120000).
DROP POLICY IF EXISTS "Table owner reads events" ON public.events;
CREATE POLICY "Table owner reads events"
ON public.events
FOR SELECT
USING (
  current_user = (
    SELECT pg_get_userbyid(pg_class.relowner)
    FROM pg_class
    WHERE pg_class.oid = 'public.events'::regclass
  )
);

-- The reminder enqueue (section 8) locks the event rows FOR SHARE, which
-- under FORCE RLS also needs an UPDATE policy that lets the owner see them.
DROP POLICY IF EXISTS "Table owner locks events" ON public.events;
CREATE POLICY "Table owner locks events"
ON public.events
FOR UPDATE
USING (
  current_user = (
    SELECT pg_get_userbyid(pg_class.relowner)
    FROM pg_class
    WHERE pg_class.oid = 'public.events'::regclass
  )
)
WITH CHECK (
  current_user = (
    SELECT pg_get_userbyid(pg_class.relowner)
    FROM pg_class
    WHERE pg_class.oid = 'public.events'::regclass
  )
);

DROP POLICY IF EXISTS "Table owner reads event occurrence exceptions"
ON public.event_occurrence_exceptions;
CREATE POLICY "Table owner reads event occurrence exceptions"
ON public.event_occurrence_exceptions
FOR SELECT
USING (
  current_user = (
    SELECT pg_get_userbyid(pg_class.relowner)
    FROM pg_class
    WHERE pg_class.oid = 'public.event_occurrence_exceptions'::regclass
  )
);

DROP POLICY IF EXISTS "Table owner reads tribe members" ON public.tribe_members;
CREATE POLICY "Table owner reads tribe members"
ON public.tribe_members
FOR SELECT
USING (
  current_user = (
    SELECT pg_get_userbyid(pg_class.relowner)
    FROM pg_class
    WHERE pg_class.oid = 'public.tribe_members'::regclass
  )
);

-- 4. Owner-only helpers shared by the producers.

-- Whether a user may still receive notifications of a tribe: the same rule
-- as can_read_tribe_content (active or muted), evaluated for any user.
-- Owner-only: it reveals another user's membership.
CREATE OR REPLACE FUNCTION public.can_receive_tribe_notifications(
  target_tribe_id uuid,
  target_user_id text
)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.tribe_members
    WHERE tribe_members.tribe_id = target_tribe_id
      AND tribe_members.user_id = target_user_id
      AND tribe_members.status IN ('active', 'muted')
  );
$$;

REVOKE EXECUTE ON FUNCTION public.can_receive_tribe_notifications(uuid, text) FROM PUBLIC;

-- Canonical ISO 8601 UTC with milliseconds, identical to JavaScript's
-- Date.prototype.toISOString(): payload instants and occurrence keys
-- (eventId@originalStartsAt) match the ones the app builds.
CREATE OR REPLACE FUNCTION public.format_notification_instant(value timestamptz)
RETURNS text
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT to_char(value AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
$$;

REVOKE EXECUTE ON FUNCTION public.format_notification_instant(timestamptz) FROM PUBLIC;

-- Microseconds since epoch: the version suffix of state-change dedupe keys,
-- so a retry of the same change collides and a new change does not.
CREATE OR REPLACE FUNCTION public.format_notification_version(value timestamptz)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT floor(extract(epoch FROM value) * 1000000)::bigint::text;
$$;

REVOKE EXECUTE ON FUNCTION public.format_notification_version(timestamptz) FROM PUBLIC;

-- 5. Producer: waitlist promotion. promote_tribe_event_waitlist (called by
-- respond_to_tribe_event_occurrence, refill_tribe_event_waitlists, and the
-- tribe_members trigger promote_tribe_event_waitlists_after_membership_change,
-- always under the occurrence advisory lock) sets promoted_at; this trigger
-- enqueues the notification in that same transaction. The phase 2 functions are not
-- modified, so their behavior and lock order stay exactly the same.
-- Dedupe: one notification per real promotion (promoted_at version).
CREATE OR REPLACE FUNCTION public.enqueue_event_waitlist_promoted_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.can_receive_tribe_notifications(NEW.tribe_id, NEW.user_id) THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.notifications (
    recipient_user_id,
    tribe_id,
    type,
    payload,
    dedupe_key
  )
  VALUES (
    NEW.user_id,
    NEW.tribe_id,
    'event_waitlist_promoted',
    jsonb_build_object(
      'eventId', NEW.event_id,
      'occurrenceStartsAt', public.format_notification_instant(NEW.occurrence_starts_at)
    ),
    'event_waitlist_promoted:' || NEW.event_id::text || '@'
      || public.format_notification_instant(NEW.occurrence_starts_at)
      || ':' || public.format_notification_version(NEW.promoted_at)
  )
  ON CONFLICT (recipient_user_id, dedupe_key) DO NOTHING;

  RETURN NULL;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.enqueue_event_waitlist_promoted_notification() FROM PUBLIC;

DROP TRIGGER IF EXISTS enqueue_event_waitlist_promoted_notification
ON public.event_attendances;
CREATE TRIGGER enqueue_event_waitlist_promoted_notification
AFTER UPDATE OF promoted_at ON public.event_attendances
FOR EACH ROW
WHEN (
  NEW.promoted_at IS NOT NULL
  AND NEW.promoted_at IS DISTINCT FROM OLD.promoted_at
  AND NEW.status = 'going'
)
EXECUTE FUNCTION public.enqueue_event_waitlist_promoted_notification();

-- 6. Producer: proposal reviewed (approved or rejected) -> its author, in
-- the review transaction. Withdrawals notify nobody; a self-review (author
-- who later became a manager) is skipped. A proposal is reviewed once.
CREATE OR REPLACE FUNCTION public.enqueue_event_proposal_reviewed_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.reviewed_by IS NOT DISTINCT FROM NEW.proposed_by
    OR NOT public.can_receive_tribe_notifications(NEW.tribe_id, NEW.proposed_by) THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.notifications (
    recipient_user_id,
    tribe_id,
    type,
    payload,
    dedupe_key
  )
  VALUES (
    NEW.proposed_by,
    NEW.tribe_id,
    'event_proposal_reviewed',
    jsonb_build_object(
      'decision', NEW.status,
      'eventId', NEW.event_id,
      'proposalId', NEW.id
    ),
    'event_proposal_reviewed:' || NEW.id::text
  )
  ON CONFLICT (recipient_user_id, dedupe_key) DO NOTHING;

  RETURN NULL;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.enqueue_event_proposal_reviewed_notification() FROM PUBLIC;

DROP TRIGGER IF EXISTS enqueue_event_proposal_reviewed_notification
ON public.event_proposals;
CREATE TRIGGER enqueue_event_proposal_reviewed_notification
AFTER UPDATE OF status ON public.event_proposals
FOR EACH ROW
WHEN (
  OLD.status = 'pending'
  AND NEW.status IN ('approved', 'rejected')
)
EXECUTE FUNCTION public.enqueue_event_proposal_reviewed_notification();

-- 7. Producer: one date of a series cancelled or moved -> everyone who
-- answered going, maybe, or waitlisted for that date (except whoever made
-- the change), in the transaction that saves the exception. An UPDATE that
-- does not change the schedule (retry, double click, reason edit) enqueues
-- nothing; a real change gets a new version (updated_at) in its key. Restoring
-- a date notifies nobody.
--
-- A change is skipped only when it rewrites a date that is entirely over:
-- the occurrence as it was held BEFORE the change (the previous move of the
-- row, otherwise the original slot) and, for a move, the occurrence after it
-- have both ended against clock_timestamp() (the write path re-checks the end
-- with the same clock and permits changes until the occurrence ends). The
-- start is not enough: a date cancelled while it is in progress still
-- notifies, and so does a past original slot that had been moved into the
-- future (cancelling it clears NEW.new_starts_at, so only OLD knows that the
-- held date is still ahead).
CREATE OR REPLACE FUNCTION public.enqueue_event_occurrence_change_notifications()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor_id text := public.current_app_user_id();
  event_duration interval;
  held_ends_at timestamptz;
  moved_ends_at timestamptz;
  notification_type text;
  occurrence_instant text := public.format_notification_instant(NEW.original_starts_at);
BEGIN
  IF TG_OP = 'UPDATE'
    AND NEW.kind IS NOT DISTINCT FROM OLD.kind
    AND NEW.new_starts_at IS NOT DISTINCT FROM OLD.new_starts_at
    AND NEW.new_ends_at IS NOT DISTINCT FROM OLD.new_ends_at THEN
    RETURN NULL;
  END IF;

  -- Duration of the series (60 minutes without ends_at), the same rule as
  -- tribe_event_occurrence_ends_at and resolve_tribe_event_occurrence_exception.
  SELECT coalesce(events.ends_at - events.starts_at, interval '60 minutes')
  INTO event_duration
  FROM public.events
  WHERE events.id = NEW.event_id;

  held_ends_at := CASE
    WHEN TG_OP = 'UPDATE' AND OLD.kind = 'moved' AND OLD.new_starts_at IS NOT NULL THEN
      coalesce(OLD.new_ends_at, OLD.new_starts_at + event_duration)
    ELSE NEW.original_starts_at + event_duration
  END;
  moved_ends_at := CASE
    WHEN NEW.kind = 'moved' AND NEW.new_starts_at IS NOT NULL THEN
      coalesce(NEW.new_ends_at, NEW.new_starts_at + event_duration)
    ELSE NULL
  END;

  IF coalesce(greatest(held_ends_at, moved_ends_at), '-infinity'::timestamptz)
    <= clock_timestamp() THEN
    RETURN NULL;
  END IF;

  notification_type := CASE NEW.kind
    WHEN 'cancelled' THEN 'event_occurrence_cancelled'
    ELSE 'event_occurrence_moved'
  END;

  INSERT INTO public.notifications (
    recipient_user_id,
    tribe_id,
    type,
    payload,
    dedupe_key
  )
  SELECT
    event_attendances.user_id,
    NEW.tribe_id,
    notification_type,
    jsonb_strip_nulls(
      jsonb_build_object(
        'eventId', NEW.event_id,
        'occurrenceStartsAt', occurrence_instant,
        'startsAt', CASE
          WHEN NEW.new_starts_at IS NULL THEN NULL
          ELSE public.format_notification_instant(NEW.new_starts_at)
        END
      )
    ),
    notification_type || ':' || NEW.event_id::text || '@' || occurrence_instant
      || ':' || public.format_notification_version(NEW.updated_at)
  FROM public.event_attendances
  WHERE event_attendances.event_id = NEW.event_id
    AND event_attendances.occurrence_starts_at = NEW.original_starts_at
    AND event_attendances.status IN ('going', 'maybe', 'waitlisted')
    AND event_attendances.user_id IS DISTINCT FROM actor_id
    AND public.can_receive_tribe_notifications(NEW.tribe_id, event_attendances.user_id)
  ON CONFLICT (recipient_user_id, dedupe_key) DO NOTHING;

  RETURN NULL;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.enqueue_event_occurrence_change_notifications() FROM PUBLIC;

DROP TRIGGER IF EXISTS enqueue_event_occurrence_change_notifications
ON public.event_occurrence_exceptions;
CREATE TRIGGER enqueue_event_occurrence_change_notifications
AFTER INSERT OR UPDATE ON public.event_occurrence_exceptions
FOR EACH ROW
EXECUTE FUNCTION public.enqueue_event_occurrence_change_notifications();

-- 8. Maintenance entrypoints of the reminder cron and the retention purge.
--
-- The cron (GET /api/maintenance/event-reminders) composes with the
-- maintenance connection (DATABASE_MAINTENANCE_URL -> DATABASE_MIGRATION_URL
-- -> DATABASE_URL). That connection may be the table owner or a DEDICATED
-- maintenance role holding only EXECUTE on these functions (the contract
-- documented for the message-image sweep in docs/architecture/message-images.htm):
-- such a role has no table grants and matches none of the owner policies, so
-- direct statements on events, event_occurrence_exceptions, event_attendances,
-- or notifications would fail with "permission denied". Every table access of
-- the cron therefore runs inside these SECURITY DEFINER functions, with the
-- owner's rights (the owner policies above cover a NOBYPASSRLS owner).
--
-- Like the image-sweep primitives they are owner-only: REVOKE EXECUTE FROM
-- PUBLIC and no grant to the shared request role (`authenticated`), because
-- that role never sets app.current_user_id and would satisfy the maintenance
-- guard. A dedicated maintenance role receives EXECUTE out of band. As
-- defense in depth each function does nothing inside an app user context.

-- 8a. One keyset page (by id) of the series that can have a date in
-- [range_start, range_end): the SQL mirror of buildSeriesInRangePredicate
-- (src/modules/events/infrastructure/repositories/tribe-event-sql.ts).
-- Schedule bounds (start to effective end, 60 minutes without ends_at) or a
-- date moved into the range whose original start is still a slot of the
-- series. It is a superset: the application expands each series with its
-- exceptions and keeps only the due dates. Both must change together.
CREATE OR REPLACE FUNCTION public.list_tribe_event_reminder_series(
  range_start timestamptz,
  range_end timestamptz,
  after_event_id uuid,
  batch_limit integer
)
RETURNS SETOF public.events
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT events.*
  FROM public.events
  WHERE nullif(current_setting('app.current_user_id', true), '') IS NULL
    AND (after_event_id IS NULL OR events.id > after_event_id)
    AND (
      (
        events.starts_at < range_end
        AND (
          (
            events.recurrence_frequency = 'none'
            AND events.starts_at
              + coalesce(events.ends_at - events.starts_at, interval '60 minutes')
              > range_start
          )
          OR (
            events.recurrence_frequency <> 'none'
            AND (
              events.recurrence_until IS NULL
              OR events.recurrence_until
                + coalesce(events.ends_at - events.starts_at, interval '60 minutes')
                > range_start
            )
          )
        )
      )
      OR EXISTS (
        SELECT 1
        FROM public.event_occurrence_exceptions AS moved_exceptions
        WHERE moved_exceptions.event_id = events.id
          AND moved_exceptions.kind = 'moved'
          AND moved_exceptions.new_starts_at < range_end
          AND coalesce(
            moved_exceptions.new_ends_at,
            moved_exceptions.new_starts_at
              + coalesce(events.ends_at - events.starts_at, interval '60 minutes')
          ) > range_start
          AND public.is_tribe_event_series_occurrence(
            moved_exceptions.original_starts_at,
            events.starts_at,
            events.recurrence_frequency,
            events.recurrence_until
          )
      )
    )
  ORDER BY events.id ASC
  LIMIT batch_limit;
$$;

REVOKE EXECUTE ON FUNCTION public.list_tribe_event_reminder_series(
  timestamptz, timestamptz, uuid, integer
)
FROM PUBLIC;

-- 8b. The exceptions of one page of series (one query per page, no N+1).
CREATE OR REPLACE FUNCTION public.list_tribe_event_reminder_exceptions(
  target_event_ids uuid[]
)
RETURNS SETOF public.event_occurrence_exceptions
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT event_occurrence_exceptions.*
  FROM public.event_occurrence_exceptions
  WHERE nullif(current_setting('app.current_user_id', true), '') IS NULL
    AND event_occurrence_exceptions.event_id = ANY(target_event_ids);
$$;

REVOKE EXECUTE ON FUNCTION public.list_tribe_event_reminder_exceptions(uuid[])
FROM PUBLIC;

-- 8c. Enqueues due reminders. reminder_candidates is a JSON array of
-- {dedupe_key, event_id, occurrence_starts_at, payload, statuses, tribe_id,
-- type}; each candidate fans out to the members whose answer for that date
-- is in statuses and who can still read the tribe, with ON CONFLICT DO
-- NOTHING on (recipient, dedupe_key), so reruns and parallel runs insert
-- each reminder once.
--
-- The candidates were computed from a listing that already committed, so a
-- manager may have cancelled or moved the date, or edited the schedule,
-- since then. The date is revalidated here against the CURRENT state:
--   * the event rows are locked FOR SHARE first, in their own statement.
--     Every manager write (saving or clearing an exception, editing or
--     deleting the series) locks the same row FOR UPDATE, so it waits for
--     this transaction, and one that committed while the lock waited is
--     visible to the INSERT below (fresh READ COMMITTED snapshot). Attendance
--     answers take the row FOR SHARE, which does not conflict;
--   * the window cutoff is rechecked once the locks are held: the current
--     effective start must still be later than clock_timestamp() plus the
--     candidate's minimum_lead_minutes (0 for the 15-minute reminder, 60 for
--     the day-before one). The candidate was selected with the clock of the
--     listing, and the lock may have waited behind a manager transaction, so
--     without it a late candidate could be enqueued after the occurrence
--     started (or after the day-before cutoff). A candidate without the
--     field enqueues nothing;
--   * the event must still exist in the candidate's tribe, the original
--     start must still be a slot of its schedule
--     (is_tribe_event_series_occurrence), the date must not be cancelled,
--     and its current effective start (the new start of a moved date,
--     otherwise the original one) must equal payload.startsAt. A stale
--     candidate enqueues nothing; the next run computes the date again with
--     its current schedule, so a moved date is reminded with its new start
--     under the same permanent dedupe key.
CREATE OR REPLACE FUNCTION public.enqueue_tribe_event_reminders(
  reminder_candidates jsonb
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  created_count integer;
  locked_at timestamptz;
BEGIN
  IF nullif(current_setting('app.current_user_id', true), '') IS NOT NULL
    OR jsonb_typeof(reminder_candidates) IS DISTINCT FROM 'array' THEN
    RETURN 0;
  END IF;

  PERFORM 1
  FROM public.events
  WHERE events.id IN (
    SELECT (candidate ->> 'event_id')::uuid
    FROM jsonb_array_elements(reminder_candidates) AS candidate
  )
  ORDER BY events.id
  FOR SHARE OF events;

  -- clock_timestamp(), not now(): the lock above may have waited.
  locked_at := clock_timestamp();

  WITH candidates AS (
    SELECT *
    FROM jsonb_to_recordset(reminder_candidates) AS candidate(
      dedupe_key text,
      event_id uuid,
      minimum_lead_minutes integer,
      occurrence_starts_at timestamptz,
      payload jsonb,
      statuses jsonb,
      tribe_id uuid,
      type text
    )
  ),
  inserted_notifications AS (
    INSERT INTO public.notifications (
      recipient_user_id,
      tribe_id,
      type,
      payload,
      dedupe_key
    )
    SELECT
      event_attendances.user_id,
      event_attendances.tribe_id,
      candidates.type,
      candidates.payload,
      candidates.dedupe_key
    FROM candidates
    INNER JOIN public.events
      ON events.id = candidates.event_id
      AND events.tribe_id = candidates.tribe_id
    LEFT JOIN public.event_occurrence_exceptions AS occurrence_exception
      ON occurrence_exception.event_id = candidates.event_id
      AND occurrence_exception.original_starts_at = candidates.occurrence_starts_at
    CROSS JOIN LATERAL (
      SELECT CASE
        WHEN occurrence_exception.kind = 'moved' THEN occurrence_exception.new_starts_at
        ELSE candidates.occurrence_starts_at
      END AS starts_at
    ) AS effective_occurrence
    INNER JOIN public.event_attendances
      ON event_attendances.event_id = candidates.event_id
      AND event_attendances.tribe_id = candidates.tribe_id
      AND event_attendances.occurrence_starts_at = candidates.occurrence_starts_at
    WHERE public.is_tribe_event_series_occurrence(
        candidates.occurrence_starts_at,
        events.starts_at,
        events.recurrence_frequency,
        events.recurrence_until
      )
      AND occurrence_exception.kind IS DISTINCT FROM 'cancelled'
      AND effective_occurrence.starts_at = (candidates.payload ->> 'startsAt')::timestamptz
      AND effective_occurrence.starts_at
        > locked_at + make_interval(mins => candidates.minimum_lead_minutes)
      AND event_attendances.status IN (
        SELECT jsonb_array_elements_text(candidates.statuses)
      )
      AND public.can_receive_tribe_notifications(
        event_attendances.tribe_id,
        event_attendances.user_id
      )
    ON CONFLICT (recipient_user_id, dedupe_key) DO NOTHING
    RETURNING notifications.id
  )
  SELECT count(*)::integer
  INTO created_count
  FROM inserted_notifications;

  RETURN created_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.enqueue_tribe_event_reminders(jsonb) FROM PUBLIC;

-- 8d. Retention purge: deletes one bounded batch of notifications read
-- before read_before. SKIP LOCKED lets two overlapping runs split the work.
CREATE OR REPLACE FUNCTION public.purge_read_notifications(
  batch_limit integer,
  read_before timestamptz
)
RETURNS integer
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH expired_notifications AS (
    SELECT notifications.id
    FROM public.notifications
    WHERE nullif(current_setting('app.current_user_id', true), '') IS NULL
      AND notifications.read_at IS NOT NULL
      AND notifications.read_at < read_before
    ORDER BY notifications.read_at ASC
    LIMIT batch_limit
    FOR UPDATE SKIP LOCKED
  ),
  deleted_notifications AS (
    DELETE FROM public.notifications
    USING expired_notifications
    WHERE notifications.id = expired_notifications.id
    RETURNING notifications.id
  )
  SELECT count(*)::integer
  FROM deleted_notifications;
$$;

REVOKE EXECUTE ON FUNCTION public.purge_read_notifications(integer, timestamptz) FROM PUBLIC;

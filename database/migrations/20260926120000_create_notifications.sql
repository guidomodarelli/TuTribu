-- Phase 5: in-app notifications.
--
-- A generic inbox: one row per (recipient, notification). The payload holds
-- only ids and instants typed per notification type; the UI builds the copy.
-- UNIQUE (recipient_user_id, dedupe_key) makes every producer idempotent:
-- cron retries, parallel cron runs, and repeated mutations never duplicate a
-- notification (producers insert with ON CONFLICT DO NOTHING).
--
-- Producers:
--   * event reminders (24 h / 15 min): the maintenance cron inserts them as
--     the table owner (maintenance connection), see
--     src/modules/events/application/use-cases/send-tribe-event-reminders-use-case.ts;
--   * waitlist promotion, proposal review, and occurrence cancel/move: AFTER
--     triggers (SECURITY DEFINER, owner-only) on the source tables, so the
--     notification is written in the SAME transaction as the change that
--     causes it; a rollback of the change leaves no notification.
--
-- Recipients only ever read and mark as read their own rows. Inserts and the
-- retention purge belong to the table owner.

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
-- nothing; a real change gets a new version (updated_at) in its key. Dates
-- entirely in the past are skipped. Restoring a date notifies nobody.
CREATE OR REPLACE FUNCTION public.enqueue_event_occurrence_change_notifications()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor_id text := public.current_app_user_id();
  notification_type text;
  occurrence_instant text := public.format_notification_instant(NEW.original_starts_at);
BEGIN
  IF TG_OP = 'UPDATE'
    AND NEW.kind IS NOT DISTINCT FROM OLD.kind
    AND NEW.new_starts_at IS NOT DISTINCT FROM OLD.new_starts_at
    AND NEW.new_ends_at IS NOT DISTINCT FROM OLD.new_ends_at THEN
    RETURN NULL;
  END IF;

  IF greatest(NEW.original_starts_at, coalesce(NEW.new_starts_at, NEW.original_starts_at))
    < now() THEN
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

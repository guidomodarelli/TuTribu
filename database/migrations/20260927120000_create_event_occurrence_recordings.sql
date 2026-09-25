-- Tribe events phase 6: post-event resources of one occurrence.
--
-- An occurrence is still identified by its series slot (event_id,
-- original_starts_at), the same stable key attendance, exceptions, deep links,
-- and notifications use, so a moved date keeps its recording.
--
-- Two tables instead of one generic "assets" row:
--   * event_occurrence_recordings: at most ONE recording per occurrence
--     (UNIQUE key). Its INSERT is the "recording available" fact that
--     notifies attendees; replacing the link is an UPDATE and notifies nobody.
--   * event_occurrence_materials: N ordered links per occurrence (slides,
--     documents, repos). Replaced as a whole list by the managers' form.
-- Keeping them apart gives each a precise CHECK set and keeps the notifying
-- trigger on a single-row-per-occurrence table.
--
-- The recording reuses the external video model of course lessons and
-- message videos (provider + external id parsed by the app from a
-- YouTube/Vimeo/Wistia/Loom URL), so it can be embedded with the same player
-- builder and turned into a course lesson without re-parsing.

-- 1. Recordings.
CREATE TABLE IF NOT EXISTS public.event_occurrence_recordings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL,
  tribe_id uuid NOT NULL REFERENCES public.tribes(id) ON DELETE CASCADE,
  original_starts_at timestamptz NOT NULL,
  video_provider text NOT NULL,
  external_video_id text NOT NULL,
  source_url text NOT NULL,
  created_by text REFERENCES public."user"(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT event_occurrence_recordings_valid_provider CHECK (
    video_provider IN ('loom', 'vimeo', 'wistia', 'youtube')
  ),
  CONSTRAINT event_occurrence_recordings_valid_external_id CHECK (
    length(external_video_id) BETWEEN 1 AND 200
  ),
  CONSTRAINT event_occurrence_recordings_valid_source_url CHECK (
    source_url ~* '^https?://' AND length(source_url) <= 2048
  ),
  CONSTRAINT event_occurrence_recordings_event_occurrence_key
    UNIQUE (event_id, original_starts_at),
  CONSTRAINT event_occurrence_recordings_event_tribe_fkey
    FOREIGN KEY (event_id, tribe_id)
    REFERENCES public.events(id, tribe_id)
    ON DELETE CASCADE
);

-- Month listing: which occurrences of the visible range have a recording
-- ("Grabación disponible" in the agenda).
CREATE INDEX IF NOT EXISTS idx_event_occurrence_recordings_tribe_original
ON public.event_occurrence_recordings(tribe_id, original_starts_at);

-- 2. Materials.
CREATE TABLE IF NOT EXISTS public.event_occurrence_materials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL,
  tribe_id uuid NOT NULL REFERENCES public.tribes(id) ON DELETE CASCADE,
  original_starts_at timestamptz NOT NULL,
  title text NOT NULL,
  url text NOT NULL,
  sort_order integer NOT NULL,
  created_by text REFERENCES public."user"(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT event_occurrence_materials_valid_title CHECK (
    length(btrim(title)) BETWEEN 1 AND 120
  ),
  CONSTRAINT event_occurrence_materials_valid_url CHECK (
    url ~* '^https?://' AND length(url) <= 2048
  ),
  CONSTRAINT event_occurrence_materials_valid_sort_order CHECK (sort_order >= 0),
  CONSTRAINT event_occurrence_materials_occurrence_sort_key
    UNIQUE (event_id, original_starts_at, sort_order),
  CONSTRAINT event_occurrence_materials_event_tribe_fkey
    FOREIGN KEY (event_id, tribe_id)
    REFERENCES public.events(id, tribe_id)
    ON DELETE CASCADE
);

-- 3. RLS: tribemates read; event managers write. The repository repeats
-- both guards in SQL because the runtime role bypasses RLS.
ALTER TABLE public.event_occurrence_recordings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_occurrence_recordings FORCE ROW LEVEL SECURITY;
ALTER TABLE public.event_occurrence_materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_occurrence_materials FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tribemates can read event occurrence recordings"
ON public.event_occurrence_recordings;
CREATE POLICY "Tribemates can read event occurrence recordings"
ON public.event_occurrence_recordings
FOR SELECT
USING (public.can_read_tribe_content(tribe_id));

DROP POLICY IF EXISTS "Event managers can create occurrence recordings"
ON public.event_occurrence_recordings;
CREATE POLICY "Event managers can create occurrence recordings"
ON public.event_occurrence_recordings
FOR INSERT
WITH CHECK (
  public.can_manage_tribe_events(tribe_id)
  AND created_by = public.current_app_user_id()
);

DROP POLICY IF EXISTS "Event managers can update occurrence recordings"
ON public.event_occurrence_recordings;
CREATE POLICY "Event managers can update occurrence recordings"
ON public.event_occurrence_recordings
FOR UPDATE
USING (public.can_manage_tribe_events(tribe_id))
WITH CHECK (public.can_manage_tribe_events(tribe_id));

DROP POLICY IF EXISTS "Event managers can delete occurrence recordings"
ON public.event_occurrence_recordings;
CREATE POLICY "Event managers can delete occurrence recordings"
ON public.event_occurrence_recordings
FOR DELETE
USING (public.can_manage_tribe_events(tribe_id));

DROP POLICY IF EXISTS "Tribemates can read event occurrence materials"
ON public.event_occurrence_materials;
CREATE POLICY "Tribemates can read event occurrence materials"
ON public.event_occurrence_materials
FOR SELECT
USING (public.can_read_tribe_content(tribe_id));

DROP POLICY IF EXISTS "Event managers can create occurrence materials"
ON public.event_occurrence_materials;
CREATE POLICY "Event managers can create occurrence materials"
ON public.event_occurrence_materials
FOR INSERT
WITH CHECK (
  public.can_manage_tribe_events(tribe_id)
  AND created_by = public.current_app_user_id()
);

DROP POLICY IF EXISTS "Event managers can delete occurrence materials"
ON public.event_occurrence_materials;
CREATE POLICY "Event managers can delete occurrence materials"
ON public.event_occurrence_materials
FOR DELETE
USING (public.can_manage_tribe_events(tribe_id));

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE
      ON public.event_occurrence_recordings TO authenticated;
    GRANT SELECT, INSERT, DELETE
      ON public.event_occurrence_materials TO authenticated;
  END IF;
END $$;

-- 4. Notification type "recording available".
ALTER TABLE public.notifications
DROP CONSTRAINT IF EXISTS notifications_valid_type;
ALTER TABLE public.notifications
ADD CONSTRAINT notifications_valid_type CHECK (
  type IN (
    'event_reminder_24h',
    'event_reminder_15m',
    'event_waitlist_promoted',
    'event_proposal_reviewed',
    'event_occurrence_cancelled',
    'event_occurrence_moved',
    'event_recording_available'
  )
);

-- 5. Producer: the first recording of an occurrence -> everyone who answered
-- going or maybe for that occurrence (except whoever published it), in the
-- transaction that inserts the recording; a rollback leaves no notification.
-- Replacing the link (UPDATE) notifies nobody. The dedupe key has no version:
-- deleting and publishing again never notifies the same person twice.
-- Owner-only (REVOKE FROM PUBLIC, no grants): it reads other members' rows
-- through the owner policies of event_attendances and tribe_members.
CREATE OR REPLACE FUNCTION public.enqueue_event_recording_available_notifications()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor_id text := public.current_app_user_id();
  occurrence_instant text := public.format_notification_instant(NEW.original_starts_at);
BEGIN
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
    'event_recording_available',
    jsonb_build_object(
      'eventId', NEW.event_id,
      'occurrenceStartsAt', occurrence_instant
    ),
    'event_recording_available:' || NEW.event_id::text || '@' || occurrence_instant
  FROM public.event_attendances
  WHERE event_attendances.event_id = NEW.event_id
    AND event_attendances.occurrence_starts_at = NEW.original_starts_at
    AND event_attendances.status IN ('going', 'maybe')
    AND event_attendances.user_id IS DISTINCT FROM actor_id
    AND public.can_receive_tribe_notifications(NEW.tribe_id, event_attendances.user_id)
  ON CONFLICT (recipient_user_id, dedupe_key) DO NOTHING;

  RETURN NULL;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.enqueue_event_recording_available_notifications() FROM PUBLIC;

DROP TRIGGER IF EXISTS enqueue_event_recording_available_notifications
ON public.event_occurrence_recordings;
CREATE TRIGGER enqueue_event_recording_available_notifications
AFTER INSERT ON public.event_occurrence_recordings
FOR EACH ROW
EXECUTE FUNCTION public.enqueue_event_recording_available_notifications();

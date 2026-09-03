-- Tribe events: keep events when the creator account is deleted, add series
-- recurrence, and add per-member attendance (RSVP) per occurrence.

ALTER TABLE public.events
  ALTER COLUMN created_by DROP NOT NULL;

ALTER TABLE public.events
  DROP CONSTRAINT IF EXISTS events_created_by_fkey;

ALTER TABLE public.events
  ADD CONSTRAINT events_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES public."user"(id) ON DELETE SET NULL;

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS recurrence_frequency text NOT NULL DEFAULT 'none';

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS recurrence_until timestamptz;

ALTER TABLE public.events
  DROP CONSTRAINT IF EXISTS events_valid_recurrence_frequency;

ALTER TABLE public.events
  ADD CONSTRAINT events_valid_recurrence_frequency CHECK (
    recurrence_frequency IN ('none', 'weekly', 'biweekly', 'monthly')
  );

ALTER TABLE public.events
  DROP CONSTRAINT IF EXISTS events_valid_recurrence_until;

ALTER TABLE public.events
  ADD CONSTRAINT events_valid_recurrence_until CHECK (
    recurrence_until IS NULL
    OR (recurrence_frequency <> 'none' AND recurrence_until >= starts_at)
  );

ALTER TABLE public.events
  DROP CONSTRAINT IF EXISTS events_id_tribe_id_key;

ALTER TABLE public.events
  ADD CONSTRAINT events_id_tribe_id_key UNIQUE (id, tribe_id);

CREATE TABLE IF NOT EXISTS public.event_attendances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL,
  tribe_id uuid NOT NULL REFERENCES public.tribes(id) ON DELETE CASCADE,
  occurrence_starts_at timestamptz NOT NULL,
  user_id text NOT NULL REFERENCES public."user"(id) ON DELETE CASCADE,
  status text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT event_attendances_valid_status CHECK (status IN ('going', 'not_going')),
  CONSTRAINT event_attendances_event_occurrence_user_key
    UNIQUE (event_id, occurrence_starts_at, user_id),
  CONSTRAINT event_attendances_event_tribe_fkey
    FOREIGN KEY (event_id, tribe_id)
    REFERENCES public.events(id, tribe_id)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_event_attendances_event_occurrence
ON public.event_attendances(event_id, occurrence_starts_at);

CREATE INDEX IF NOT EXISTS idx_event_attendances_tribe_user
ON public.event_attendances(tribe_id, user_id);

ALTER TABLE public.event_attendances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_attendances FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tribemates can read event attendances"
ON public.event_attendances;
CREATE POLICY "Tribemates can read event attendances"
ON public.event_attendances
FOR SELECT
USING (
  public.can_read_tribe_content(tribe_id)
);

DROP POLICY IF EXISTS "Active members can record own event attendance"
ON public.event_attendances;
CREATE POLICY "Active members can record own event attendance"
ON public.event_attendances
FOR INSERT
WITH CHECK (
  user_id = public.current_app_user_id()
  AND public.is_active_tribe_member(tribe_id)
);

DROP POLICY IF EXISTS "Active members can update own event attendance"
ON public.event_attendances;
CREATE POLICY "Active members can update own event attendance"
ON public.event_attendances
FOR UPDATE
USING (
  user_id = public.current_app_user_id()
  AND public.is_active_tribe_member(tribe_id)
)
WITH CHECK (
  user_id = public.current_app_user_id()
  AND public.is_active_tribe_member(tribe_id)
);

DROP POLICY IF EXISTS "Active members can remove own event attendance"
ON public.event_attendances;
CREATE POLICY "Active members can remove own event attendance"
ON public.event_attendances
FOR DELETE
USING (
  user_id = public.current_app_user_id()
  AND public.is_active_tribe_member(tribe_id)
);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.event_attendances TO authenticated;
  END IF;
END $$;

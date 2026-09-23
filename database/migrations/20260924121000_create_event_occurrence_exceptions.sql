-- Tribe events phase 3: per-occurrence exceptions of a series.
--
-- A series still stores only its first occurrence and a recurrence rule. An
-- exception changes one concrete slot, identified by the instant the rule
-- generates for it (original_starts_at):
--   * cancelled: the slot is shown struck through and takes no answers;
--   * moved: the slot is shown at new_starts_at (and new_ends_at).
-- The occurrence key stays eventId@original_starts_at, so deep links,
-- attendance rows (event_attendances.occurrence_starts_at) and future
-- notifications keep pointing at the same occurrence after a move.

CREATE TABLE IF NOT EXISTS public.event_occurrence_exceptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL,
  tribe_id uuid NOT NULL REFERENCES public.tribes(id) ON DELETE CASCADE,
  original_starts_at timestamptz NOT NULL,
  kind text NOT NULL,
  new_starts_at timestamptz,
  new_ends_at timestamptz,
  reason text,
  created_by text REFERENCES public."user"(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT event_occurrence_exceptions_valid_kind CHECK (
    kind IN ('cancelled', 'moved')
  ),
  CONSTRAINT event_occurrence_exceptions_valid_schedule CHECK (
    (kind = 'cancelled' AND new_starts_at IS NULL AND new_ends_at IS NULL)
    OR (
      kind = 'moved'
      AND new_starts_at IS NOT NULL
      AND (new_ends_at IS NULL OR new_ends_at > new_starts_at)
    )
  ),
  CONSTRAINT event_occurrence_exceptions_valid_reason CHECK (
    reason IS NULL OR length(reason) BETWEEN 1 AND 280
  ),
  CONSTRAINT event_occurrence_exceptions_event_occurrence_key
    UNIQUE (event_id, original_starts_at),
  -- Composite FK: an exception can never point at another tribe's event.
  CONSTRAINT event_occurrence_exceptions_event_tribe_fkey
    FOREIGN KEY (event_id, tribe_id)
    REFERENCES public.events(id, tribe_id)
    ON DELETE CASCADE
);

-- Range listing: exceptions whose original slot or new start falls in the
-- visible month.
CREATE INDEX IF NOT EXISTS idx_event_occurrence_exceptions_tribe_original
ON public.event_occurrence_exceptions(tribe_id, original_starts_at);

CREATE INDEX IF NOT EXISTS idx_event_occurrence_exceptions_tribe_new_start
ON public.event_occurrence_exceptions(tribe_id, new_starts_at)
WHERE kind = 'moved';

-- Future notifications (phase 5) read the exceptions changed after a cut.
CREATE INDEX IF NOT EXISTS idx_event_occurrence_exceptions_updated_at
ON public.event_occurrence_exceptions(updated_at);

ALTER TABLE public.event_occurrence_exceptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_occurrence_exceptions FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tribemates can read event occurrence exceptions"
ON public.event_occurrence_exceptions;
CREATE POLICY "Tribemates can read event occurrence exceptions"
ON public.event_occurrence_exceptions
FOR SELECT
USING (
  public.can_read_tribe_content(tribe_id)
);

DROP POLICY IF EXISTS "Event managers can create occurrence exceptions"
ON public.event_occurrence_exceptions;
CREATE POLICY "Event managers can create occurrence exceptions"
ON public.event_occurrence_exceptions
FOR INSERT
WITH CHECK (
  public.can_manage_tribe_events(tribe_id)
  AND created_by = public.current_app_user_id()
);

DROP POLICY IF EXISTS "Event managers can update occurrence exceptions"
ON public.event_occurrence_exceptions;
CREATE POLICY "Event managers can update occurrence exceptions"
ON public.event_occurrence_exceptions
FOR UPDATE
USING (
  public.can_manage_tribe_events(tribe_id)
)
WITH CHECK (
  public.can_manage_tribe_events(tribe_id)
);

DROP POLICY IF EXISTS "Event managers can delete occurrence exceptions"
ON public.event_occurrence_exceptions;
CREATE POLICY "Event managers can delete occurrence exceptions"
ON public.event_occurrence_exceptions
FOR DELETE
USING (
  public.can_manage_tribe_events(tribe_id)
);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE
      ON public.event_occurrence_exceptions TO authenticated;
  END IF;
END $$;

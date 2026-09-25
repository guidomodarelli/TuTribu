-- Tribe events phase 6: conversation of one occurrence (questions before,
-- comments after), keyed by the stable occurrence identity
-- (event_id, original_starts_at).
--
-- Decision: a dedicated thread table, modeled like course_lesson_comments
-- (the repo's existing per-entity thread), instead of an anchor row in
-- public.messages. A message always belongs to a channel (channel_id NOT
-- NULL) and is read by the round feed, its cache, pins, likes, polls, and
-- channel moves/deletions; anchoring an event there would either surface
-- synthetic posts in the feed or require a nullable channel plus a filter in
-- every round query. See docs/architecture/tribe-events.htm (section 14).
--
-- Replies do not notify in this phase. Extension point: an AFTER INSERT
-- trigger on this table (same pattern as the phase 5 producers) can enqueue
-- a notification type for the other participants.

CREATE TABLE IF NOT EXISTS public.event_occurrence_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL,
  tribe_id uuid NOT NULL REFERENCES public.tribes(id) ON DELETE CASCADE,
  original_starts_at timestamptz NOT NULL,
  author_id text NOT NULL REFERENCES public."user"(id) ON DELETE CASCADE,
  content text NOT NULL,
  -- Client operation key: the browser generates it once per send and reuses
  -- it on every retry of the same text, so a retry after a lost or
  -- unreadable response answers the comment already created instead of
  -- writing a duplicate. Nullable so rows written without a key stay valid.
  client_request_id uuid,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT event_occurrence_comments_valid_content CHECK (
    length(btrim(content)) BETWEEN 1 AND 2000
  ),
  CONSTRAINT event_occurrence_comments_event_tribe_fkey
    FOREIGN KEY (event_id, tribe_id)
    REFERENCES public.events(id, tribe_id)
    ON DELETE CASCADE
);

-- Thread of one occurrence, oldest first (keyset-friendly).
CREATE INDEX IF NOT EXISTS idx_event_occurrence_comments_thread
ON public.event_occurrence_comments(event_id, original_starts_at, created_at, id);

-- One comment per client operation, scoped to its author and occurrence. The
-- insert targets this index with ON CONFLICT DO NOTHING and a replay reads
-- the existing row back.
CREATE UNIQUE INDEX IF NOT EXISTS event_occurrence_comments_client_request_key
ON public.event_occurrence_comments(event_id, original_starts_at, author_id, client_request_id)
WHERE client_request_id IS NOT NULL;

ALTER TABLE public.event_occurrence_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_occurrence_comments FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tribemates can read event occurrence comments"
ON public.event_occurrence_comments;
CREATE POLICY "Tribemates can read event occurrence comments"
ON public.event_occurrence_comments
FOR SELECT
USING (public.can_read_tribe_content(tribe_id));

DROP POLICY IF EXISTS "Active members can comment on occurrences"
ON public.event_occurrence_comments;
CREATE POLICY "Active members can comment on occurrences"
ON public.event_occurrence_comments
FOR INSERT
WITH CHECK (
  author_id = public.current_app_user_id()
  AND public.is_active_tribe_member(tribe_id)
);

-- Authors remove their own comments; event managers moderate the thread.
-- There is no UPDATE: a comment is deleted and written again.
DROP POLICY IF EXISTS "Authors and event managers can delete occurrence comments"
ON public.event_occurrence_comments;
CREATE POLICY "Authors and event managers can delete occurrence comments"
ON public.event_occurrence_comments
FOR DELETE
USING (
  author_id = public.current_app_user_id()
  OR public.can_manage_tribe_events(tribe_id)
);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    GRANT SELECT, INSERT, DELETE
      ON public.event_occurrence_comments TO authenticated;
  END IF;
END $$;

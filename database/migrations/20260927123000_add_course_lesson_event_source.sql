-- Tribe events phase 6: a course lesson can be created from the recording of
-- an event occurrence ("Convertir en lección").
--
-- The reference lives on the courses side and is a plain value pair, not a
-- foreign key to public.events: courses never depend on the events schema,
-- and deleting the event keeps the lesson (the reference then just points at
-- nothing, like a copied video link).
--
-- Idempotency: one lesson per (course, occurrence). course_id is not a column
-- of course_lessons (it hangs from course_modules), so the rule cannot be a
-- UNIQUE index here; the repository serializes conversions of the same
-- (course, occurrence) with pg_advisory_xact_lock and re-reads existing
-- lessons after taking the lock (see PostgresCourseRepository
-- .createLessonFromEventRecording). The index below supports that lookup.

ALTER TABLE public.course_lessons
ADD COLUMN IF NOT EXISTS source_event_id uuid,
ADD COLUMN IF NOT EXISTS source_occurrence_starts_at timestamptz;

ALTER TABLE public.course_lessons
DROP CONSTRAINT IF EXISTS course_lessons_valid_event_source;
ALTER TABLE public.course_lessons
ADD CONSTRAINT course_lessons_valid_event_source CHECK (
  (source_event_id IS NULL) = (source_occurrence_starts_at IS NULL)
);

CREATE INDEX IF NOT EXISTS idx_course_lessons_event_source
ON public.course_lessons(source_event_id, source_occurrence_starts_at)
WHERE source_event_id IS NOT NULL;

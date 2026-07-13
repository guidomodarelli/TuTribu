CREATE TABLE IF NOT EXISTS public.course_lesson_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tribe_id uuid NOT NULL REFERENCES public.tribes(id) ON DELETE CASCADE,
  lesson_id uuid NOT NULL REFERENCES public.course_lessons(id) ON DELETE CASCADE,
  author_id text NOT NULL REFERENCES public."user"(id) ON DELETE CASCADE,
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT course_lesson_comments_content_not_blank_check
    CHECK (char_length(btrim(content)) > 0)
);

CREATE INDEX IF NOT EXISTS idx_course_lesson_comments_lesson_created_at
ON public.course_lesson_comments(lesson_id, created_at ASC);

ALTER TABLE public.course_lesson_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.course_lesson_comments FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can read lesson comments"
ON public.course_lesson_comments;
CREATE POLICY "Members can read lesson comments"
ON public.course_lesson_comments
FOR SELECT
USING (public.can_read_tribe_courses(tribe_id));

DROP POLICY IF EXISTS "Active members can create lesson comments"
ON public.course_lesson_comments;
CREATE POLICY "Active members can create lesson comments"
ON public.course_lesson_comments
FOR INSERT
WITH CHECK (
  author_id = public.current_app_user_id()
  AND public.is_active_tribe_member(tribe_id)
  AND public.is_course_module_unlocked(
    (
      SELECT course_lessons.course_module_id
      FROM public.course_lessons
      WHERE course_lessons.id = course_lesson_comments.lesson_id
    )
  )
);

DROP POLICY IF EXISTS "Authors and leaders can delete lesson comments"
ON public.course_lesson_comments;
CREATE POLICY "Authors and leaders can delete lesson comments"
ON public.course_lesson_comments
FOR DELETE
USING (
  (
    author_id = public.current_app_user_id()
    AND public.is_active_tribe_member(tribe_id)
  )
  OR public.can_manage_tribe_courses(tribe_id)
);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    GRANT SELECT, INSERT, DELETE ON public.course_lesson_comments TO authenticated;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.course_lesson_completions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tribe_id uuid NOT NULL REFERENCES public.tribes(id) ON DELETE CASCADE,
  lesson_id uuid NOT NULL REFERENCES public.course_lessons(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES public."user"(id) ON DELETE CASCADE,
  completed_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT course_lesson_completions_lesson_user_key
    UNIQUE (lesson_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_course_lesson_completions_tribe_user
ON public.course_lesson_completions(tribe_id, user_id);

CREATE TABLE IF NOT EXISTS public.course_last_viewed_lessons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tribe_id uuid NOT NULL REFERENCES public.tribes(id) ON DELETE CASCADE,
  course_id uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  lesson_id uuid NOT NULL REFERENCES public.course_lessons(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES public."user"(id) ON DELETE CASCADE,
  viewed_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT course_last_viewed_lessons_course_user_key
    UNIQUE (course_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_course_last_viewed_lessons_tribe_user
ON public.course_last_viewed_lessons(tribe_id, user_id);

ALTER TABLE public.course_lesson_completions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.course_lesson_completions FORCE ROW LEVEL SECURITY;
ALTER TABLE public.course_last_viewed_lessons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.course_last_viewed_lessons FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can read own lesson completions"
ON public.course_lesson_completions;
CREATE POLICY "Members can read own lesson completions"
ON public.course_lesson_completions
FOR SELECT
USING (
  user_id = public.current_app_user_id()
  AND public.can_read_tribe_courses(tribe_id)
);

DROP POLICY IF EXISTS "Members can record own lesson completions"
ON public.course_lesson_completions;
CREATE POLICY "Members can record own lesson completions"
ON public.course_lesson_completions
FOR INSERT
WITH CHECK (
  user_id = public.current_app_user_id()
  AND public.can_read_tribe_courses(tribe_id)
);

DROP POLICY IF EXISTS "Members can remove own lesson completions"
ON public.course_lesson_completions;
CREATE POLICY "Members can remove own lesson completions"
ON public.course_lesson_completions
FOR DELETE
USING (
  user_id = public.current_app_user_id()
  AND public.can_read_tribe_courses(tribe_id)
);

DROP POLICY IF EXISTS "Members can read own last viewed lessons"
ON public.course_last_viewed_lessons;
CREATE POLICY "Members can read own last viewed lessons"
ON public.course_last_viewed_lessons
FOR SELECT
USING (
  user_id = public.current_app_user_id()
  AND public.can_read_tribe_courses(tribe_id)
);

DROP POLICY IF EXISTS "Members can upsert own last viewed lessons"
ON public.course_last_viewed_lessons;
CREATE POLICY "Members can upsert own last viewed lessons"
ON public.course_last_viewed_lessons
FOR INSERT
WITH CHECK (
  user_id = public.current_app_user_id()
  AND public.can_read_tribe_courses(tribe_id)
);

DROP POLICY IF EXISTS "Members can update own last viewed lessons"
ON public.course_last_viewed_lessons;
CREATE POLICY "Members can update own last viewed lessons"
ON public.course_last_viewed_lessons
FOR UPDATE
USING (
  user_id = public.current_app_user_id()
  AND public.can_read_tribe_courses(tribe_id)
)
WITH CHECK (
  user_id = public.current_app_user_id()
  AND public.can_read_tribe_courses(tribe_id)
);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    GRANT SELECT, INSERT, DELETE ON public.course_lesson_completions TO authenticated;
    GRANT SELECT, INSERT, UPDATE ON public.course_last_viewed_lessons TO authenticated;
  END IF;
END $$;

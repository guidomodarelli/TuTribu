-- Course access requirement: `membership` (historical behavior, default) or
-- `academy`. The requirement only takes effect while the tribe runs in academy
-- mode, so a leader can classify courses before the cutover without changing
-- what members of a legacy tribe can read.
--
-- - can_read_course_content(course_id): membership rules plus, for academy
--   courses in academy mode, a grant covering now() or the active leader
--   administrative preview (course management permission).
-- - is_course_module_unlocked: academy courses drip from the member's first
--   academy activation (member_product_enrollments.first_activated_at), not
--   from the free registration. Basic courses keep tribe_members.created_at.
--   The module must also belong to a readable course, so a temporarily
--   unlocked module never skips the paywall.
-- - Policies of modules, lessons, completions, last viewed lessons, comments
--   and lesson files add the course-level check.

ALTER TABLE public.courses
  ADD COLUMN IF NOT EXISTS access_requirement text NOT NULL DEFAULT 'membership';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'courses_access_requirement_check'
  ) THEN
    ALTER TABLE public.courses
      ADD CONSTRAINT courses_access_requirement_check
      CHECK (access_requirement IN ('membership', 'academy'));
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.can_read_course_content(target_course_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.courses
    WHERE courses.id = target_course_id
      AND public.can_read_tribe_courses(courses.tribe_id)
      AND (
        courses.access_requirement = 'membership'
        OR NOT public.tribe_uses_academy_access(courses.tribe_id)
        OR public.can_manage_tribe_courses(courses.tribe_id)
        OR public.has_current_user_product_access(courses.tribe_id, 'academy')
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.is_course_module_unlocked(target_module_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.course_modules
    INNER JOIN public.courses
      ON courses.id = course_modules.course_id
      AND courses.tribe_id = course_modules.tribe_id
    INNER JOIN public.tribe_members
      ON tribe_members.tribe_id = course_modules.tribe_id
      AND tribe_members.user_id = public.current_app_user_id()
      AND tribe_members.status IN ('active', 'muted')
    LEFT JOIN public.member_product_enrollments
      ON member_product_enrollments.tribe_id = course_modules.tribe_id
      AND member_product_enrollments.user_id = tribe_members.user_id
      AND member_product_enrollments.product_key = 'academy'
    WHERE course_modules.id = target_module_id
      AND public.can_read_course_content(course_modules.course_id)
      AND (
        course_modules.unlock_after_days IS NULL
        OR tribe_members.role = 'leader'
        OR (
          CASE
            WHEN courses.access_requirement = 'academy'
              AND public.tribe_uses_academy_access(course_modules.tribe_id)
              THEN member_product_enrollments.first_activated_at
            ELSE tribe_members.created_at
          END
        ) + make_interval(days => course_modules.unlock_after_days)
          <= timezone('utc', now())
      )
  );
$$;

-- Lesson-level read predicate shared by progress, comments and files.
CREATE OR REPLACE FUNCTION public.can_read_course_lesson(target_lesson_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.course_lessons
    INNER JOIN public.course_modules
      ON course_modules.id = course_lessons.course_module_id
    WHERE course_lessons.id = target_lesson_id
      AND (
        public.can_manage_tribe_courses(course_lessons.tribe_id)
        OR (
          course_lessons.is_active = true
          AND course_modules.is_active = true
          AND public.is_course_module_unlocked(course_modules.id)
        )
      )
      AND public.can_read_course_content(course_modules.course_id)
  );
$$;

DROP POLICY IF EXISTS "Members can read course modules" ON public.course_modules;
CREATE POLICY "Members can read course modules"
ON public.course_modules
FOR SELECT
USING (
  public.can_read_tribe_courses(tribe_id)
  AND public.can_read_course_content(course_id)
  AND (
    is_active = true
    OR public.can_manage_tribe_courses(tribe_id)
  )
);

DROP POLICY IF EXISTS "Members can read course lessons" ON public.course_lessons;
-- Inline (instead of can_read_course_lesson) so the policy never re-reads
-- course_lessons from inside its own policy.
CREATE POLICY "Members can read course lessons"
ON public.course_lessons
FOR SELECT
USING (
  public.can_read_tribe_courses(tribe_id)
  AND public.can_read_course_content(
    (
      SELECT course_modules.course_id
      FROM public.course_modules
      WHERE course_modules.id = course_lessons.course_module_id
    )
  )
  AND (
    public.can_manage_tribe_courses(tribe_id)
    OR (
      is_active = true
      AND EXISTS (
        SELECT 1
        FROM public.course_modules
        WHERE course_modules.id = course_lessons.course_module_id
          AND course_modules.is_active = true
      )
      AND public.is_course_module_unlocked(course_lessons.course_module_id)
    )
  )
);

DROP POLICY IF EXISTS "Members can read own lesson completions"
ON public.course_lesson_completions;
CREATE POLICY "Members can read own lesson completions"
ON public.course_lesson_completions
FOR SELECT
USING (
  user_id = public.current_app_user_id()
  AND public.can_read_tribe_courses(tribe_id)
);

-- Progress summary stays readable after access ends (see SELECT above), but
-- new activity requires the lesson to be readable now.
DROP POLICY IF EXISTS "Members can record own lesson completions"
ON public.course_lesson_completions;
CREATE POLICY "Members can record own lesson completions"
ON public.course_lesson_completions
FOR INSERT
WITH CHECK (
  user_id = public.current_app_user_id()
  AND public.can_read_course_lesson(lesson_id)
);

DROP POLICY IF EXISTS "Members can remove own lesson completions"
ON public.course_lesson_completions;
CREATE POLICY "Members can remove own lesson completions"
ON public.course_lesson_completions
FOR DELETE
USING (
  user_id = public.current_app_user_id()
  AND public.can_read_course_lesson(lesson_id)
);

DROP POLICY IF EXISTS "Members can upsert own last viewed lessons"
ON public.course_last_viewed_lessons;
CREATE POLICY "Members can upsert own last viewed lessons"
ON public.course_last_viewed_lessons
FOR INSERT
WITH CHECK (
  user_id = public.current_app_user_id()
  AND public.can_read_course_lesson(lesson_id)
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
  AND public.can_read_course_lesson(lesson_id)
);

DROP POLICY IF EXISTS "Members can read lesson comments" ON public.course_lesson_comments;
CREATE POLICY "Members can read lesson comments"
ON public.course_lesson_comments
FOR SELECT
USING (public.can_read_course_lesson(lesson_id));

-- Muted members keep reading and recording progress, but only active
-- memberships publish comments. The course requirement replaces the community
-- boundary here, so basic courses stay commentable in academy mode.
DROP POLICY IF EXISTS "Active members can create lesson comments"
ON public.course_lesson_comments;
CREATE POLICY "Active members can create lesson comments"
ON public.course_lesson_comments
FOR INSERT
WITH CHECK (
  author_id = public.current_app_user_id()
  AND public.has_active_tribe_membership(tribe_id)
  AND public.can_read_course_lesson(lesson_id)
);

DROP POLICY IF EXISTS "Authors and leaders can delete lesson comments"
ON public.course_lesson_comments;
CREATE POLICY "Authors and leaders can delete lesson comments"
ON public.course_lesson_comments
FOR DELETE
USING (
  (
    author_id = public.current_app_user_id()
    AND public.has_active_tribe_membership(tribe_id)
  )
  OR public.can_manage_tribe_courses(tribe_id)
);

DROP POLICY IF EXISTS "Members can read course lesson files" ON public.course_lesson_files;
CREATE POLICY "Members can read course lesson files"
ON public.course_lesson_files
FOR SELECT
USING (
  (
    "status" = 'attached'
    AND lesson_id IS NOT NULL
    AND public.can_read_course_lesson(lesson_id)
  )
  OR (
    uploaded_by = public.current_app_user_id()
    AND public.can_manage_tribe_courses(tribe_id)
  )
  OR (
    "status" IN ('pending_delete', 'deleted')
    AND public.can_manage_tribe_courses(tribe_id)
  )
);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    GRANT EXECUTE ON FUNCTION public.can_read_course_content(uuid) TO authenticated;
    GRANT EXECUTE ON FUNCTION public.can_read_course_lesson(uuid) TO authenticated;
  END IF;
END $$;

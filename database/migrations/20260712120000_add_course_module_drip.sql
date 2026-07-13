ALTER TABLE public.course_modules
  ADD COLUMN IF NOT EXISTS unlock_after_days integer;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'course_modules_unlock_after_days_check'
  ) THEN
    ALTER TABLE public.course_modules
      ADD CONSTRAINT course_modules_unlock_after_days_check
      CHECK (unlock_after_days IS NULL OR unlock_after_days >= 0);
  END IF;
END $$;

-- A module is unlocked for the current member when it has no drip window or
-- the member joined the tribe long enough ago. Leaders always see everything.
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
    INNER JOIN public.tribe_members
      ON tribe_members.tribe_id = course_modules.tribe_id
      AND tribe_members.user_id = public.current_app_user_id()
      AND tribe_members.status IN ('active', 'muted')
    WHERE course_modules.id = target_module_id
      AND (
        course_modules.unlock_after_days IS NULL
        OR tribe_members.role = 'leader'
        OR tribe_members.created_at
          + make_interval(days => course_modules.unlock_after_days)
          <= timezone('utc', now())
      )
  );
$$;

DROP POLICY IF EXISTS "Members can read course lessons"
ON public.course_lessons;
CREATE POLICY "Members can read course lessons"
ON public.course_lessons
FOR SELECT
USING (
  public.can_read_tribe_courses(tribe_id)
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

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    GRANT EXECUTE ON FUNCTION public.is_course_module_unlocked(uuid) TO authenticated;
  END IF;
END $$;

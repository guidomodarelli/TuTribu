CREATE TABLE IF NOT EXISTS public.course_modules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tribe_id uuid NOT NULL REFERENCES public.tribes(id) ON DELETE CASCADE,
  title text NOT NULL,
  sort_order integer NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT course_modules_id_tribe_id_key
    UNIQUE (id, tribe_id),
  CONSTRAINT course_modules_title_not_blank_check
    CHECK (btrim(title) <> '')
);

CREATE INDEX IF NOT EXISTS idx_course_modules_tribe_sort
ON public.course_modules(tribe_id, sort_order);

CREATE TABLE IF NOT EXISTS public.course_lessons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_module_id uuid NOT NULL,
  tribe_id uuid NOT NULL REFERENCES public.tribes(id) ON DELETE CASCADE,
  title text NOT NULL,
  video_provider text NOT NULL,
  external_video_id text NOT NULL,
  description text,
  sort_order integer NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT course_lessons_title_not_blank_check
    CHECK (btrim(title) <> ''),
  CONSTRAINT course_lessons_module_tribe_fkey
    FOREIGN KEY (course_module_id, tribe_id)
    REFERENCES public.course_modules(id, tribe_id)
    ON DELETE CASCADE,
  CONSTRAINT course_lessons_external_video_id_not_blank_check
    CHECK (btrim(external_video_id) <> ''),
  CONSTRAINT course_lessons_video_provider_check
    CHECK (video_provider IN ('vimeo', 'wistia', 'loom', 'youtube'))
);

CREATE INDEX IF NOT EXISTS idx_course_lessons_module_sort
ON public.course_lessons(course_module_id, sort_order);

CREATE INDEX IF NOT EXISTS idx_course_lessons_tribe
ON public.course_lessons(tribe_id);

CREATE OR REPLACE FUNCTION public.can_manage_tribe_courses(target_tribe_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.tribe_members
    WHERE tribe_members.tribe_id = target_tribe_id
      AND tribe_members.user_id = public.current_app_user_id()
      AND tribe_members.status = 'active'
      AND tribe_members.role = 'leader'
  );
$$;

CREATE OR REPLACE FUNCTION public.can_read_tribe_courses(target_tribe_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.tribe_members
    WHERE tribe_members.tribe_id = target_tribe_id
      AND tribe_members.user_id = public.current_app_user_id()
      AND tribe_members.status IN ('active', 'muted')
  );
$$;

ALTER TABLE public.course_modules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.course_modules FORCE ROW LEVEL SECURITY;
ALTER TABLE public.course_lessons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.course_lessons FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can read course modules"
ON public.course_modules;
CREATE POLICY "Members can read course modules"
ON public.course_modules
FOR SELECT
USING (
  public.can_read_tribe_courses(tribe_id)
  AND (
    is_active = true
    OR public.can_manage_tribe_courses(tribe_id)
  )
);

DROP POLICY IF EXISTS "Leaders can manage course modules"
ON public.course_modules;
CREATE POLICY "Leaders can manage course modules"
ON public.course_modules
FOR ALL
USING (public.can_manage_tribe_courses(tribe_id))
WITH CHECK (public.can_manage_tribe_courses(tribe_id));

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
    )
  )
);

DROP POLICY IF EXISTS "Leaders can manage course lessons"
ON public.course_lessons;
CREATE POLICY "Leaders can manage course lessons"
ON public.course_lessons
FOR ALL
USING (public.can_manage_tribe_courses(tribe_id))
WITH CHECK (public.can_manage_tribe_courses(tribe_id));

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.course_modules TO authenticated;
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.course_lessons TO authenticated;
    GRANT EXECUTE ON FUNCTION public.can_manage_tribe_courses(uuid) TO authenticated;
    GRANT EXECUTE ON FUNCTION public.can_read_tribe_courses(uuid) TO authenticated;
  END IF;
END $$;

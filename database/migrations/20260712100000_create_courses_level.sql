CREATE TABLE IF NOT EXISTS public.courses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tribe_id uuid NOT NULL REFERENCES public.tribes(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  cover_image_url text,
  sort_order integer NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT courses_id_tribe_id_key
    UNIQUE (id, tribe_id),
  CONSTRAINT courses_title_not_blank_check
    CHECK (btrim(title) <> ''),
  CONSTRAINT courses_cover_image_url_check
    CHECK (
      cover_image_url IS NULL
      OR cover_image_url ~* '^https?://'
    )
);

CREATE INDEX IF NOT EXISTS idx_courses_tribe_sort
ON public.courses(tribe_id, sort_order);

ALTER TABLE public.course_modules
  ADD COLUMN IF NOT EXISTS course_id uuid;

-- Backfill: every tribe with existing modules gets a default course that
-- adopts them, so the new required course level never orphans content.
WITH tribes_with_modules AS (
  SELECT DISTINCT course_modules.tribe_id
  FROM public.course_modules
  WHERE course_modules.course_id IS NULL
),
default_courses AS (
  INSERT INTO public.courses (tribe_id, title, sort_order)
  SELECT tribes_with_modules.tribe_id, 'Curso general', 0
  FROM tribes_with_modules
  RETURNING id, tribe_id
)
UPDATE public.course_modules
SET course_id = default_courses.id
FROM default_courses
WHERE course_modules.tribe_id = default_courses.tribe_id
  AND course_modules.course_id IS NULL;

ALTER TABLE public.course_modules
  ALTER COLUMN course_id SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'course_modules_course_tribe_fkey'
  ) THEN
    ALTER TABLE public.course_modules
      ADD CONSTRAINT course_modules_course_tribe_fkey
      FOREIGN KEY (course_id, tribe_id)
      REFERENCES public.courses(id, tribe_id)
      ON DELETE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_course_modules_course_sort
ON public.course_modules(course_id, sort_order);

ALTER TABLE public.courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.courses FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can read courses"
ON public.courses;
CREATE POLICY "Members can read courses"
ON public.courses
FOR SELECT
USING (
  public.can_read_tribe_courses(tribe_id)
  AND (
    is_active = true
    OR public.can_manage_tribe_courses(tribe_id)
  )
);

DROP POLICY IF EXISTS "Leaders can manage courses"
ON public.courses;
CREATE POLICY "Leaders can manage courses"
ON public.courses
FOR ALL
USING (public.can_manage_tribe_courses(tribe_id))
WITH CHECK (public.can_manage_tribe_courses(tribe_id));

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.courses TO authenticated;
  END IF;
END $$;

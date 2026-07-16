CREATE TABLE IF NOT EXISTS public.tribe_story_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tribe_id uuid NOT NULL REFERENCES public.tribes(id) ON DELETE CASCADE,
  content text NOT NULL,
  updated_by text REFERENCES public."user"(id),
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT tribe_story_settings_content_not_blank_check
    CHECK (btrim(content) <> ''),
  CONSTRAINT tribe_story_settings_content_max_length_check
    CHECK (char_length(content) <= 10000)
);

CREATE UNIQUE INDEX IF NOT EXISTS tribe_story_settings_tribe_key
ON public.tribe_story_settings(tribe_id);

CREATE OR REPLACE FUNCTION public.can_manage_tribe_story(target_tribe_id uuid)
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

CREATE OR REPLACE FUNCTION public.can_read_tribe_story(target_tribe_id uuid)
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

ALTER TABLE public.tribe_story_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tribe_story_settings FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can read tribe story settings"
ON public.tribe_story_settings;
CREATE POLICY "Members can read tribe story settings"
ON public.tribe_story_settings
FOR SELECT
USING (public.can_read_tribe_story(tribe_id));

DROP POLICY IF EXISTS "Leaders can manage tribe story settings"
ON public.tribe_story_settings;
CREATE POLICY "Leaders can manage tribe story settings"
ON public.tribe_story_settings
FOR ALL
USING (public.can_manage_tribe_story(tribe_id))
WITH CHECK (public.can_manage_tribe_story(tribe_id));

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.tribe_story_settings TO authenticated;
    GRANT EXECUTE ON FUNCTION public.can_manage_tribe_story(uuid) TO authenticated;
    GRANT EXECUTE ON FUNCTION public.can_read_tribe_story(uuid) TO authenticated;
  END IF;
END $$;

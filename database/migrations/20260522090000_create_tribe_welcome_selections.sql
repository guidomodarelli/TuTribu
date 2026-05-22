CREATE TABLE IF NOT EXISTS public.tribe_welcome_selections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tribe_id uuid NOT NULL REFERENCES public.tribes(id) ON DELETE CASCADE,
  welcome_link_id uuid NOT NULL REFERENCES public.tribe_welcome_links(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES public."user"(id) ON DELETE CASCADE,
  selected_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE UNIQUE INDEX IF NOT EXISTS tribe_welcome_selections_link_user_key
ON public.tribe_welcome_selections(welcome_link_id, user_id);

CREATE INDEX IF NOT EXISTS idx_tribe_welcome_selections_tribe_user
ON public.tribe_welcome_selections(tribe_id, user_id);

CREATE INDEX IF NOT EXISTS idx_tribe_welcome_selections_tribe_link
ON public.tribe_welcome_selections(tribe_id, welcome_link_id);

ALTER TABLE public.tribe_welcome_selections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tribe_welcome_selections FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can read tribe welcome selections"
ON public.tribe_welcome_selections;
CREATE POLICY "Members can read tribe welcome selections"
ON public.tribe_welcome_selections
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.tribe_members
    WHERE tribe_members.tribe_id = tribe_welcome_selections.tribe_id
      AND tribe_members.user_id = public.current_app_user_id()
      AND tribe_members.status IN ('active', 'muted')
  )
);

DROP POLICY IF EXISTS "Members can record their own welcome selections"
ON public.tribe_welcome_selections;
CREATE POLICY "Members can record their own welcome selections"
ON public.tribe_welcome_selections
FOR INSERT
WITH CHECK (
  user_id = public.current_app_user_id()
  AND EXISTS (
    SELECT 1
    FROM public.tribe_members
    WHERE tribe_members.tribe_id = tribe_welcome_selections.tribe_id
      AND tribe_members.user_id = public.current_app_user_id()
      AND tribe_members.status = 'active'
  )
  AND EXISTS (
    SELECT 1
    FROM public.tribe_welcome_links
    WHERE tribe_welcome_links.id = tribe_welcome_selections.welcome_link_id
      AND tribe_welcome_links.tribe_id = tribe_welcome_selections.tribe_id
      AND tribe_welcome_links.is_active = true
  )
);

DROP POLICY IF EXISTS "Members can remove their own welcome selections"
ON public.tribe_welcome_selections;
CREATE POLICY "Members can remove their own welcome selections"
ON public.tribe_welcome_selections
FOR DELETE
USING (
  user_id = public.current_app_user_id()
  AND EXISTS (
    SELECT 1
    FROM public.tribe_members
    WHERE tribe_members.tribe_id = tribe_welcome_selections.tribe_id
      AND tribe_members.user_id = public.current_app_user_id()
      AND tribe_members.status = 'active'
  )
);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    GRANT SELECT, INSERT, DELETE ON public.tribe_welcome_selections TO authenticated;
  END IF;
END $$;

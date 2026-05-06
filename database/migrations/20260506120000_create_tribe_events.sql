CREATE TABLE IF NOT EXISTS public.events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tribe_id uuid NOT NULL REFERENCES public.tribes(id) ON DELETE CASCADE,
  created_by text NOT NULL REFERENCES public."user"(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  meeting_url text,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT events_title_not_empty CHECK (length(trim(title)) > 0),
  CONSTRAINT events_valid_date_range CHECK (ends_at IS NULL OR ends_at > starts_at),
  CONSTRAINT events_valid_meeting_url CHECK (
    meeting_url IS NULL
    OR meeting_url ~* '^https?://'
  )
);

CREATE INDEX IF NOT EXISTS idx_events_tribe_starts_at
ON public.events(tribe_id, starts_at);

CREATE OR REPLACE FUNCTION public.can_manage_tribe_events(target_tribe_id uuid)
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
      AND tribe_members.role IN ('leader', 'guardian')
  );
$$;

ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.events FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tribemates can read tribe events" ON public.events;
CREATE POLICY "Tribemates can read tribe events"
ON public.events
FOR SELECT
USING (
  public.can_read_tribe_content(tribe_id)
);

DROP POLICY IF EXISTS "Leaders and guardians can create tribe events" ON public.events;
CREATE POLICY "Leaders and guardians can create tribe events"
ON public.events
FOR INSERT
WITH CHECK (
  public.can_manage_tribe_events(tribe_id)
  AND created_by = public.current_app_user_id()
);

DROP POLICY IF EXISTS "Leaders and guardians can update tribe events" ON public.events;
CREATE POLICY "Leaders and guardians can update tribe events"
ON public.events
FOR UPDATE
USING (
  public.can_manage_tribe_events(tribe_id)
)
WITH CHECK (
  public.can_manage_tribe_events(tribe_id)
);

DROP POLICY IF EXISTS "Leaders and guardians can delete tribe events" ON public.events;
CREATE POLICY "Leaders and guardians can delete tribe events"
ON public.events
FOR DELETE
USING (
  public.can_manage_tribe_events(tribe_id)
);

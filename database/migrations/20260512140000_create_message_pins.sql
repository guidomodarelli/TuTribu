CREATE TABLE IF NOT EXISTS public.message_pins (
  message_id uuid PRIMARY KEY REFERENCES public.messages(id) ON DELETE CASCADE,
  tribe_id uuid NOT NULL REFERENCES public.tribes(id) ON DELETE CASCADE,
  pinned_by text NOT NULL REFERENCES public."user"(id) ON DELETE CASCADE,
  pinned_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS idx_message_pins_tribe_pinned_at
ON public.message_pins(tribe_id, pinned_at DESC);

CREATE OR REPLACE FUNCTION public.can_pin_tribe_messages(target_tribe_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.tribe_members
    WHERE tribe_members.tribe_id = target_tribe_id
      AND tribe_members.user_id = public.current_app_user_id()
      AND tribe_members.role IN ('leader', 'guardian')
      AND tribe_members.status = 'active'
  );
$$;

ALTER TABLE public.message_pins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_pins FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tribemates can read message pins"
ON public.message_pins;

DROP POLICY IF EXISTS "Leaders and guardians can manage message pins"
ON public.message_pins;

CREATE POLICY "Tribemates can read message pins"
ON public.message_pins
FOR SELECT
USING (
  public.can_read_tribe_content(tribe_id)
);

CREATE POLICY "Leaders and guardians can manage message pins"
ON public.message_pins
FOR ALL
USING (
  public.can_pin_tribe_messages(tribe_id)
)
WITH CHECK (
  pinned_by = public.current_app_user_id()
  AND public.can_pin_tribe_messages(tribe_id)
);

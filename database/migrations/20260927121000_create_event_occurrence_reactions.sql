-- Tribe events phase 6: "¿Cómo estuvo?" quick reactions to a finished
-- occurrence.
--
-- One reaction per member and occurrence (UNIQUE key), changeable and
-- removable. The catalog is fixed (fire, thumbs_up, neutral; the app maps
-- them to 🔥 👍 😐). Counts are aggregated on read; reactions never notify.
-- "Finished" and "not cancelled" are business rules of the use case (they
-- depend on the series expansion and exceptions), not of this table.

CREATE TABLE IF NOT EXISTS public.event_occurrence_reactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL,
  tribe_id uuid NOT NULL REFERENCES public.tribes(id) ON DELETE CASCADE,
  original_starts_at timestamptz NOT NULL,
  user_id text NOT NULL REFERENCES public."user"(id) ON DELETE CASCADE,
  reaction text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT event_occurrence_reactions_valid_reaction CHECK (
    reaction IN ('fire', 'thumbs_up', 'neutral')
  ),
  CONSTRAINT event_occurrence_reactions_member_key
    UNIQUE (event_id, original_starts_at, user_id),
  CONSTRAINT event_occurrence_reactions_event_tribe_fkey
    FOREIGN KEY (event_id, tribe_id)
    REFERENCES public.events(id, tribe_id)
    ON DELETE CASCADE
);

-- The UNIQUE key (event_id, original_starts_at, user_id) already serves the
-- per-occurrence aggregation and the viewer lookup.

ALTER TABLE public.event_occurrence_reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_occurrence_reactions FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tribemates can read event occurrence reactions"
ON public.event_occurrence_reactions;
CREATE POLICY "Tribemates can read event occurrence reactions"
ON public.event_occurrence_reactions
FOR SELECT
USING (public.can_read_tribe_content(tribe_id));

DROP POLICY IF EXISTS "Active members can react to occurrences"
ON public.event_occurrence_reactions;
CREATE POLICY "Active members can react to occurrences"
ON public.event_occurrence_reactions
FOR INSERT
WITH CHECK (
  user_id = public.current_app_user_id()
  AND public.is_active_tribe_member(tribe_id)
);

DROP POLICY IF EXISTS "Active members can change own occurrence reaction"
ON public.event_occurrence_reactions;
CREATE POLICY "Active members can change own occurrence reaction"
ON public.event_occurrence_reactions
FOR UPDATE
USING (user_id = public.current_app_user_id())
WITH CHECK (
  user_id = public.current_app_user_id()
  AND public.is_active_tribe_member(tribe_id)
);

DROP POLICY IF EXISTS "Members can remove own occurrence reaction"
ON public.event_occurrence_reactions;
CREATE POLICY "Members can remove own occurrence reaction"
ON public.event_occurrence_reactions
FOR DELETE
USING (user_id = public.current_app_user_id());

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE
      ON public.event_occurrence_reactions TO authenticated;
  END IF;
END $$;

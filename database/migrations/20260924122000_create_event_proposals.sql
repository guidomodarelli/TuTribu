-- Tribe events phase 3: meeting proposals from members.
--
-- Active members propose a meeting; leaders and guardians approve it (which
-- creates the real event in the same transaction) or reject it with an
-- optional note; the author may withdraw a pending proposal. Rows are never
-- deleted by the app, so the history stays available for notifications
-- (phase 5: status, reviewed_at, and event_id say what happened and when).

CREATE TABLE IF NOT EXISTS public.event_proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tribe_id uuid NOT NULL REFERENCES public.tribes(id) ON DELETE CASCADE,
  proposed_by text NOT NULL REFERENCES public."user"(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  starts_at timestamptz NOT NULL,
  duration_minutes integer NOT NULL,
  event_type text NOT NULL DEFAULT 'live',
  status text NOT NULL DEFAULT 'pending',
  reviewed_by text REFERENCES public."user"(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  review_note text,
  -- The event created on approval; SET NULL keeps the approved proposal when
  -- the event is deleted later.
  event_id uuid REFERENCES public.events(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT event_proposals_valid_title CHECK (
    length(trim(title)) BETWEEN 1 AND 120
  ),
  CONSTRAINT event_proposals_valid_description CHECK (
    description IS NULL OR length(description) <= 2000
  ),
  CONSTRAINT event_proposals_valid_duration CHECK (
    duration_minutes BETWEEN 15 AND 480
  ),
  CONSTRAINT event_proposals_valid_event_type CHECK (
    event_type IN ('live', 'workshop', 'qa', 'in_person', 'social')
  ),
  CONSTRAINT event_proposals_valid_status CHECK (
    status IN ('pending', 'approved', 'rejected', 'withdrawn')
  ),
  CONSTRAINT event_proposals_valid_review_note CHECK (
    review_note IS NULL OR length(review_note) BETWEEN 1 AND 500
  ),
  -- Only approved or rejected proposals carry a review.
  CONSTRAINT event_proposals_review_matches_status CHECK (
    (status IN ('approved', 'rejected')) = (reviewed_at IS NOT NULL)
  )
);

-- One proposal can create at most one event, even under concurrent approvals.
CREATE UNIQUE INDEX IF NOT EXISTS event_proposals_event_id_key
ON public.event_proposals(event_id)
WHERE event_id IS NOT NULL;

-- Manager queue (pending of a tribe, oldest first) and pending count.
CREATE INDEX IF NOT EXISTS idx_event_proposals_tribe_status_created
ON public.event_proposals(tribe_id, status, created_at);

-- Author list and the anti-spam count of pending proposals per member.
CREATE INDEX IF NOT EXISTS idx_event_proposals_tribe_author_created
ON public.event_proposals(tribe_id, proposed_by, created_at);

CREATE INDEX IF NOT EXISTS idx_event_proposals_reviewed_at
ON public.event_proposals(reviewed_at)
WHERE reviewed_at IS NOT NULL;

ALTER TABLE public.event_proposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_proposals FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authors and event managers can read event proposals"
ON public.event_proposals;
CREATE POLICY "Authors and event managers can read event proposals"
ON public.event_proposals
FOR SELECT
USING (
  (
    proposed_by = public.current_app_user_id()
    AND public.can_read_tribe_content(tribe_id)
  )
  OR public.can_manage_tribe_events(tribe_id)
);

DROP POLICY IF EXISTS "Active members can propose events"
ON public.event_proposals;
CREATE POLICY "Active members can propose events"
ON public.event_proposals
FOR INSERT
WITH CHECK (
  proposed_by = public.current_app_user_id()
  AND public.is_active_tribe_member(tribe_id)
  AND status = 'pending'
  AND reviewed_by IS NULL
  AND event_id IS NULL
);

DROP POLICY IF EXISTS "Authors can withdraw pending event proposals"
ON public.event_proposals;
CREATE POLICY "Authors can withdraw pending event proposals"
ON public.event_proposals
FOR UPDATE
USING (
  proposed_by = public.current_app_user_id()
  AND status = 'pending'
)
WITH CHECK (
  proposed_by = public.current_app_user_id()
  AND status = 'withdrawn'
);

DROP POLICY IF EXISTS "Event managers can review event proposals"
ON public.event_proposals;
CREATE POLICY "Event managers can review event proposals"
ON public.event_proposals
FOR UPDATE
USING (
  public.can_manage_tribe_events(tribe_id)
)
WITH CHECK (
  public.can_manage_tribe_events(tribe_id)
);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    GRANT SELECT, INSERT, UPDATE ON public.event_proposals TO authenticated;
  END IF;
END $$;

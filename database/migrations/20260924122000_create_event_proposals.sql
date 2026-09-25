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

-- No direct writes for request roles. The anti-spam cap (at most three
-- pending proposals per member and tribe) needs a per-member advisory lock and
-- a count of pending rows before the insert, and an approval must create the
-- event in the same transaction that resolves the proposal. RLS checks one
-- row at a time and cannot express either rule, so the only writer is the
-- events repository (runtime role, which runs both under its locks). Granting
-- INSERT to a request role would let a member flood the manager queue past
-- the cap; granting UPDATE would let a manager mark a proposal approved
-- without creating its event.
DROP POLICY IF EXISTS "Active members can propose events"
ON public.event_proposals;
DROP POLICY IF EXISTS "Authors can withdraw pending event proposals"
ON public.event_proposals;
DROP POLICY IF EXISTS "Event managers can review event proposals"
ON public.event_proposals;

-- Owner exception: the table is under FORCE RLS, so without it a table owner
-- without BYPASSRLS (migration or runtime role) could not write at all once
-- the member and manager write policies are gone. Request roles never own
-- the table.
DROP POLICY IF EXISTS "Table owner manages event proposals"
ON public.event_proposals;
CREATE POLICY "Table owner manages event proposals"
ON public.event_proposals
FOR ALL
USING (
  current_user = (
    SELECT pg_get_userbyid(pg_class.relowner)
    FROM pg_class
    WHERE pg_class.oid = 'public.event_proposals'::regclass
  )
)
WITH CHECK (
  current_user = (
    SELECT pg_get_userbyid(pg_class.relowner)
    FROM pg_class
    WHERE pg_class.oid = 'public.event_proposals'::regclass
  )
);

-- Column guard for every writer: the repository is the only one today, but
-- a row-level check cannot stop a buggy or future UPDATE from moving the
-- proposal to another tribe, rewriting its title or schedule, or attaching a
-- review or an unrelated event while withdrawing it. The trigger fires for
-- every role, including the runtime role that bypasses RLS, and keeps two
-- invariants:
--   * what was proposed (tribe, author, content, schedule, type, creation
--     date) never changes after insert, for authors and managers alike;
--   * a withdrawal only changes `status` and `updated_at`, and only from
--     `pending`. The foreign keys may still clear `reviewed_by` and
--     `event_id` (ON DELETE SET NULL) on a withdrawn row.
-- It is SECURITY INVOKER on purpose: it reads nothing but OLD and NEW.
CREATE OR REPLACE FUNCTION public.guard_event_proposal_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NEW.tribe_id IS DISTINCT FROM OLD.tribe_id
    OR NEW.proposed_by IS DISTINCT FROM OLD.proposed_by
    OR NEW.title IS DISTINCT FROM OLD.title
    OR NEW.description IS DISTINCT FROM OLD.description
    OR NEW.starts_at IS DISTINCT FROM OLD.starts_at
    OR NEW.duration_minutes IS DISTINCT FROM OLD.duration_minutes
    OR NEW.event_type IS DISTINCT FROM OLD.event_type
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION
      'guard_event_proposal_update: proposed fields are immutable (proposal %)',
      OLD.id
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.status = 'withdrawn' AND (
    OLD.status NOT IN ('pending', 'withdrawn')
    OR NEW.reviewed_at IS DISTINCT FROM OLD.reviewed_at
    OR NEW.review_note IS DISTINCT FROM OLD.review_note
    OR (NEW.reviewed_by IS DISTINCT FROM OLD.reviewed_by AND NEW.reviewed_by IS NOT NULL)
    OR (NEW.event_id IS DISTINCT FROM OLD.event_id AND NEW.event_id IS NOT NULL)
  ) THEN
    RAISE EXCEPTION
      'guard_event_proposal_update: a withdrawal only changes status from pending (proposal %)',
      OLD.id
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_event_proposal_update() FROM PUBLIC;

DROP TRIGGER IF EXISTS guard_event_proposal_update ON public.event_proposals;
CREATE TRIGGER guard_event_proposal_update
BEFORE UPDATE ON public.event_proposals
FOR EACH ROW
EXECUTE FUNCTION public.guard_event_proposal_update();

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE INSERT, UPDATE, DELETE ON public.event_proposals FROM authenticated;
    GRANT SELECT ON public.event_proposals TO authenticated;
  END IF;
END $$;

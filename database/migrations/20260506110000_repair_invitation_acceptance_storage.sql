CREATE TABLE IF NOT EXISTS public.tribe_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tribe_id uuid NOT NULL REFERENCES public.tribes(id) ON DELETE CASCADE,
  token_hash text NOT NULL,
  created_by text NOT NULL REFERENCES public."user"(id),
  status text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  revoked_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS tribe_invitations_token_hash_key
ON public.tribe_invitations(token_hash);

CREATE INDEX IF NOT EXISTS idx_tribe_invitations_tribe_status
ON public.tribe_invitations(tribe_id, status);

ALTER TABLE public.tribe_members
ADD COLUMN IF NOT EXISTS status_reason text NOT NULL DEFAULT 'none';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'tribe_members_status_reason_check'
  ) THEN
    ALTER TABLE public.tribe_members
    ADD CONSTRAINT tribe_members_status_reason_check
    CHECK (status_reason IN ('none', 'conduct_blocked', 'payment_blocked'));
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.can_manage_tribe_invitations(
  target_tribe_id uuid
)
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

ALTER TABLE public.tribe_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tribe_invitations FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read invited tribe by token"
ON public.tribes;

CREATE POLICY "Authenticated users can read invited tribe by token"
ON public.tribes
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.tribe_invitations
    WHERE tribe_invitations.tribe_id = tribes.id
      AND tribe_invitations.status = 'active'
      AND tribe_invitations.token_hash = current_setting(
        'app.current_invitation_hash',
        true
      )
  )
);

DROP POLICY IF EXISTS "Invitation managers can read active invitations"
ON public.tribe_invitations;

CREATE POLICY "Invitation managers can read active invitations"
ON public.tribe_invitations
FOR SELECT
USING (
  status = 'active'
  AND public.can_manage_tribe_invitations(tribe_id)
);

DROP POLICY IF EXISTS "Authenticated users can read invitation by token"
ON public.tribe_invitations;

DROP POLICY IF EXISTS "Authenticated users can read active invitation by token"
ON public.tribe_invitations;

CREATE POLICY "Authenticated users can read invitation by token"
ON public.tribe_invitations
FOR SELECT
USING (
  status IN ('active', 'revoked')
  AND token_hash = current_setting(
    'app.current_invitation_hash',
    true
  )
);

DROP POLICY IF EXISTS "Invitation managers can create invitations"
ON public.tribe_invitations;

CREATE POLICY "Invitation managers can create invitations"
ON public.tribe_invitations
FOR INSERT
WITH CHECK (
  created_by = public.current_app_user_id()
  AND status = 'active'
  AND public.can_manage_tribe_invitations(tribe_id)
);

DROP POLICY IF EXISTS "Invitation managers can revoke invitations"
ON public.tribe_invitations;

CREATE POLICY "Invitation managers can revoke invitations"
ON public.tribe_invitations
FOR UPDATE
USING (public.can_manage_tribe_invitations(tribe_id))
WITH CHECK (
  status = 'revoked'
  AND public.can_manage_tribe_invitations(tribe_id)
);

DROP POLICY IF EXISTS "Authenticated users can accept active invitations"
ON public.tribe_members;

CREATE POLICY "Authenticated users can accept active invitations"
ON public.tribe_members
FOR INSERT
WITH CHECK (
  user_id = public.current_app_user_id()
  AND role = 'tribemate'
  AND status = 'active'
  AND EXISTS (
    SELECT 1
    FROM public.tribe_invitations
    WHERE tribe_invitations.tribe_id = tribe_members.tribe_id
      AND tribe_invitations.status = 'active'
      AND tribe_invitations.token_hash = current_setting(
        'app.current_invitation_hash',
        true
      )
  )
);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    GRANT SELECT, INSERT, UPDATE ON public.tribe_invitations TO authenticated;
    GRANT EXECUTE ON FUNCTION public.can_manage_tribe_invitations(uuid) TO authenticated;
  END IF;
END;
$$;

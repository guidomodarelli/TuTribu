CREATE TABLE IF NOT EXISTS public.message_polls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL UNIQUE REFERENCES public.messages(id) ON DELETE CASCADE,
  tribe_id uuid NOT NULL REFERENCES public.tribes(id) ON DELETE CASCADE,
  question text NOT NULL,
  allow_multiple_votes boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'open',
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  CHECK (char_length(trim(question)) BETWEEN 1 AND 160),
  CHECK (status IN ('open', 'closed'))
);

CREATE TABLE IF NOT EXISTS public.message_poll_options (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  poll_id uuid NOT NULL REFERENCES public.message_polls(id) ON DELETE CASCADE,
  tribe_id uuid NOT NULL REFERENCES public.tribes(id) ON DELETE CASCADE,
  text text NOT NULL,
  sort_order integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  CHECK (char_length(trim(text)) BETWEEN 1 AND 80),
  UNIQUE (poll_id, sort_order)
);

CREATE TABLE IF NOT EXISTS public.message_poll_votes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  poll_id uuid NOT NULL REFERENCES public.message_polls(id) ON DELETE CASCADE,
  option_id uuid NOT NULL REFERENCES public.message_poll_options(id) ON DELETE CASCADE,
  tribe_id uuid NOT NULL REFERENCES public.tribes(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES public."user"(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  UNIQUE (poll_id, option_id, user_id)
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'message_poll_options_poll_id_fkey'
      AND conrelid = 'public.message_poll_options'::regclass
  ) THEN
    ALTER TABLE public.message_poll_options
    ADD CONSTRAINT message_poll_options_poll_id_fkey
    FOREIGN KEY (poll_id)
    REFERENCES public.message_polls(id)
    ON DELETE CASCADE
    NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'message_poll_votes_poll_id_fkey'
      AND conrelid = 'public.message_poll_votes'::regclass
  ) THEN
    ALTER TABLE public.message_poll_votes
    ADD CONSTRAINT message_poll_votes_poll_id_fkey
    FOREIGN KEY (poll_id)
    REFERENCES public.message_polls(id)
    ON DELETE CASCADE
    NOT VALID;
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_message_poll_options_poll_sort
ON public.message_poll_options(poll_id, sort_order);

CREATE INDEX IF NOT EXISTS idx_message_poll_votes_poll_user
ON public.message_poll_votes(poll_id, user_id);

DROP POLICY IF EXISTS "Tribemates can read message polls"
ON public.message_polls;

DROP POLICY IF EXISTS "Authors leaders and guardians can manage message polls"
ON public.message_polls;

DROP POLICY IF EXISTS "Tribemates can read message poll options"
ON public.message_poll_options;

DROP POLICY IF EXISTS "Authors leaders and guardians can manage message poll options"
ON public.message_poll_options;

DROP POLICY IF EXISTS "Tribemates can read message poll votes"
ON public.message_poll_votes;

DROP POLICY IF EXISTS "Active tribemates can manage own message poll votes"
ON public.message_poll_votes;

ALTER TABLE public.message_polls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_polls FORCE ROW LEVEL SECURITY;

ALTER TABLE public.message_poll_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_poll_options FORCE ROW LEVEL SECURITY;

ALTER TABLE public.message_poll_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_poll_votes FORCE ROW LEVEL SECURITY;

CREATE POLICY "Tribemates can read message polls"
ON public.message_polls
FOR SELECT
USING (
  public.can_read_tribe_content(tribe_id)
);

CREATE POLICY "Authors leaders and guardians can manage message polls"
ON public.message_polls
FOR ALL
USING (
  public.can_pin_tribe_messages(tribe_id)
  OR EXISTS (
    SELECT 1
    FROM public.messages
    WHERE messages.id = message_polls.message_id
      AND messages.author_id = public.current_app_user_id()
  )
)
WITH CHECK (
  public.can_pin_tribe_messages(tribe_id)
  OR EXISTS (
    SELECT 1
    FROM public.messages
    WHERE messages.id = message_polls.message_id
      AND messages.author_id = public.current_app_user_id()
  )
);

CREATE POLICY "Tribemates can read message poll options"
ON public.message_poll_options
FOR SELECT
USING (
  public.can_read_tribe_content(tribe_id)
);

CREATE POLICY "Authors leaders and guardians can manage message poll options"
ON public.message_poll_options
FOR ALL
USING (
  public.can_pin_tribe_messages(tribe_id)
  OR EXISTS (
    SELECT 1
    FROM public.message_polls
    INNER JOIN public.messages
      ON messages.id = message_polls.message_id
    WHERE message_polls.id = message_poll_options.poll_id
      AND message_polls.tribe_id = message_poll_options.tribe_id
      AND messages.author_id = public.current_app_user_id()
  )
)
WITH CHECK (
  public.can_pin_tribe_messages(tribe_id)
  OR EXISTS (
    SELECT 1
    FROM public.message_polls
    INNER JOIN public.messages
      ON messages.id = message_polls.message_id
    WHERE message_polls.id = message_poll_options.poll_id
      AND message_polls.tribe_id = message_poll_options.tribe_id
      AND messages.author_id = public.current_app_user_id()
  )
);

CREATE POLICY "Tribemates can read message poll votes"
ON public.message_poll_votes
FOR SELECT
USING (
  public.can_read_tribe_content(tribe_id)
);

CREATE POLICY "Active tribemates can manage own message poll votes"
ON public.message_poll_votes
FOR ALL
USING (
  user_id = public.current_app_user_id()
  AND public.is_active_tribe_member(tribe_id)
)
WITH CHECK (
  user_id = public.current_app_user_id()
  AND public.is_active_tribe_member(tribe_id)
);

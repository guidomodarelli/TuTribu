CREATE TABLE IF NOT EXISTS public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tribe_id uuid NOT NULL REFERENCES public.tribes(id) ON DELETE CASCADE,
  author_id text NOT NULL REFERENCES public."user"(id) ON DELETE CASCADE,
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  CHECK (char_length(trim(content)) > 0)
);

CREATE TABLE IF NOT EXISTS public.message_replies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  tribe_id uuid NOT NULL REFERENCES public.tribes(id) ON DELETE CASCADE,
  author_id text NOT NULL REFERENCES public."user"(id) ON DELETE CASCADE,
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  CHECK (char_length(trim(content)) > 0)
);

CREATE TABLE IF NOT EXISTS public.message_reactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  tribe_id uuid NOT NULL REFERENCES public.tribes(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES public."user"(id) ON DELETE CASCADE,
  type text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  UNIQUE (message_id, user_id),
  CHECK (type IN ('like'))
);

CREATE INDEX IF NOT EXISTS idx_messages_tribe_created_at
ON public.messages(tribe_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_message_replies_message_created_at
ON public.message_replies(message_id, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_message_reactions_message_type
ON public.message_reactions(message_id, type);

CREATE OR REPLACE FUNCTION public.can_read_tribe_content(target_tribe_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.tribe_members
    WHERE tribe_members.tribe_id = target_tribe_id
      AND tribe_members.user_id = public.current_app_user_id()
      AND tribe_members.status IN ('active', 'muted')
  );
$$;

CREATE OR REPLACE FUNCTION public.is_active_tribe_member(target_tribe_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.tribe_members
    WHERE tribe_members.tribe_id = target_tribe_id
      AND tribe_members.user_id = public.current_app_user_id()
      AND tribe_members.status = 'active'
  );
$$;

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages FORCE ROW LEVEL SECURITY;

ALTER TABLE public.message_replies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_replies FORCE ROW LEVEL SECURITY;

ALTER TABLE public.message_reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_reactions FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tribemates can read tribe messages"
ON public.messages;

DROP POLICY IF EXISTS "Active tribemates can create tribe messages"
ON public.messages;

DROP POLICY IF EXISTS "Tribemates can read tribe message replies"
ON public.message_replies;

DROP POLICY IF EXISTS "Active tribemates can create tribe message replies"
ON public.message_replies;

DROP POLICY IF EXISTS "Tribemates can read tribe message reactions"
ON public.message_reactions;

DROP POLICY IF EXISTS "Active tribemates can manage own message reactions"
ON public.message_reactions;

CREATE POLICY "Tribemates can read tribe messages"
ON public.messages
FOR SELECT
USING (
  public.can_read_tribe_content(tribe_id)
);

CREATE POLICY "Active tribemates can create tribe messages"
ON public.messages
FOR INSERT
WITH CHECK (
  author_id = public.current_app_user_id()
  AND public.is_active_tribe_member(tribe_id)
);

CREATE POLICY "Tribemates can read tribe message replies"
ON public.message_replies
FOR SELECT
USING (
  public.can_read_tribe_content(tribe_id)
);

CREATE POLICY "Active tribemates can create tribe message replies"
ON public.message_replies
FOR INSERT
WITH CHECK (
  author_id = public.current_app_user_id()
  AND public.is_active_tribe_member(tribe_id)
);

CREATE POLICY "Tribemates can read tribe message reactions"
ON public.message_reactions
FOR SELECT
USING (
  public.can_read_tribe_content(tribe_id)
);

CREATE POLICY "Active tribemates can manage own message reactions"
ON public.message_reactions
FOR ALL
USING (
  user_id = public.current_app_user_id()
  AND public.is_active_tribe_member(tribe_id)
)
WITH CHECK (
  user_id = public.current_app_user_id()
  AND public.is_active_tribe_member(tribe_id)
);

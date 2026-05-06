CREATE TABLE IF NOT EXISTS public.posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tribe_id uuid NOT NULL REFERENCES public.tribes(id) ON DELETE CASCADE,
  author_id text NOT NULL REFERENCES public."user"(id) ON DELETE CASCADE,
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  CHECK (char_length(trim(content)) > 0)
);

CREATE TABLE IF NOT EXISTS public.post_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  tribe_id uuid NOT NULL REFERENCES public.tribes(id) ON DELETE CASCADE,
  author_id text NOT NULL REFERENCES public."user"(id) ON DELETE CASCADE,
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  CHECK (char_length(trim(content)) > 0)
);

CREATE TABLE IF NOT EXISTS public.post_reactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  tribe_id uuid NOT NULL REFERENCES public.tribes(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES public."user"(id) ON DELETE CASCADE,
  type text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  UNIQUE (post_id, user_id),
  CHECK (type IN ('like'))
);

CREATE INDEX IF NOT EXISTS idx_posts_tribe_created_at
ON public.posts(tribe_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_post_comments_post_created_at
ON public.post_comments(post_id, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_post_reactions_post_type
ON public.post_reactions(post_id, type);

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

ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.posts FORCE ROW LEVEL SECURITY;

ALTER TABLE public.post_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.post_comments FORCE ROW LEVEL SECURITY;

ALTER TABLE public.post_reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.post_reactions FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can read tribe posts"
ON public.posts;

DROP POLICY IF EXISTS "Active members can create tribe posts"
ON public.posts;

DROP POLICY IF EXISTS "Members can read tribe post comments"
ON public.post_comments;

DROP POLICY IF EXISTS "Active members can create tribe post comments"
ON public.post_comments;

DROP POLICY IF EXISTS "Members can read tribe post reactions"
ON public.post_reactions;

DROP POLICY IF EXISTS "Active members can manage own post reactions"
ON public.post_reactions;

CREATE POLICY "Members can read tribe posts"
ON public.posts
FOR SELECT
USING (
  public.can_read_tribe_content(tribe_id)
);

CREATE POLICY "Active members can create tribe posts"
ON public.posts
FOR INSERT
WITH CHECK (
  author_id = public.current_app_user_id()
  AND public.is_active_tribe_member(tribe_id)
);

CREATE POLICY "Members can read tribe post comments"
ON public.post_comments
FOR SELECT
USING (
  public.can_read_tribe_content(tribe_id)
);

CREATE POLICY "Active members can create tribe post comments"
ON public.post_comments
FOR INSERT
WITH CHECK (
  author_id = public.current_app_user_id()
  AND public.is_active_tribe_member(tribe_id)
);

CREATE POLICY "Members can read tribe post reactions"
ON public.post_reactions
FOR SELECT
USING (
  public.can_read_tribe_content(tribe_id)
);

CREATE POLICY "Active members can manage own post reactions"
ON public.post_reactions
FOR ALL
USING (
  user_id = public.current_app_user_id()
  AND public.is_active_tribe_member(tribe_id)
)
WITH CHECK (
  user_id = public.current_app_user_id()
  AND public.is_active_tribe_member(tribe_id)
);

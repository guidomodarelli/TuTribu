CREATE TABLE IF NOT EXISTS public.tribe_channels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tribe_id uuid NOT NULL REFERENCES public.tribes(id) ON DELETE CASCADE,
  name text NOT NULL,
  slug text NOT NULL,
  emoji text NOT NULL,
  sort_order integer NOT NULL,
  access_scope text NOT NULL DEFAULT 'tribemates',
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  UNIQUE (tribe_id, slug),
  CHECK (char_length(trim(name)) > 0),
  CHECK (char_length(trim(emoji)) > 0),
  CHECK (access_scope IN ('tribemates'))
);

CREATE INDEX IF NOT EXISTS idx_tribe_channels_sort_order
ON public.tribe_channels(tribe_id, sort_order ASC);

CREATE OR REPLACE FUNCTION public.can_manage_tribe_channels(target_tribe_id uuid)
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
      AND tribe_members.role IN ('leader', 'guardian')
  );
$$;

WITH channel_seed(name, slug, emoji, sort_order) AS (
  VALUES
    ('General', 'general', '💬', 20)
)
INSERT INTO public.tribe_channels (
  tribe_id,
  name,
  slug,
  emoji,
  sort_order,
  access_scope,
  created_at,
  updated_at
)
SELECT
  tribes.id,
  channel_seed.name,
  channel_seed.slug,
  channel_seed.emoji,
  channel_seed.sort_order,
  'tribemates',
  timezone('utc', now()),
  timezone('utc', now())
FROM public.tribes
CROSS JOIN channel_seed
ON CONFLICT (tribe_id, slug) DO NOTHING;

ALTER TABLE public.posts
ADD COLUMN IF NOT EXISTS channel_id uuid;

WITH tribe_general_channels AS (
  SELECT
    tribe_channels.tribe_id,
    tribe_channels.id
  FROM public.tribe_channels
  WHERE tribe_channels.slug = 'general'
)
UPDATE public.posts
SET
  channel_id = tribe_general_channels.id,
  updated_at = timezone('utc', now())
FROM tribe_general_channels
WHERE posts.tribe_id = tribe_general_channels.tribe_id
  AND posts.channel_id IS NULL;

ALTER TABLE public.posts
ALTER COLUMN channel_id SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'posts_channel_id_fkey'
      AND conrelid = 'public.posts'::regclass
  ) THEN
    ALTER TABLE public.posts
    ADD CONSTRAINT posts_channel_id_fkey
    FOREIGN KEY (channel_id)
    REFERENCES public.tribe_channels(id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_posts_channel_created_at
ON public.posts(channel_id, created_at DESC);

ALTER TABLE public.tribe_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tribe_channels FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tribemates can read tribe channels"
ON public.tribe_channels;

DROP POLICY IF EXISTS "Leaders and guardians can manage tribe channels"
ON public.tribe_channels;

DROP POLICY IF EXISTS "Leaders can manage tribe channels"
ON public.tribe_channels;

CREATE POLICY "Tribemates can read tribe channels"
ON public.tribe_channels
FOR SELECT
USING (
  public.can_read_tribe_content(tribe_id)
);

CREATE POLICY "Leaders and guardians can manage tribe channels"
ON public.tribe_channels
FOR ALL
USING (
  public.can_manage_tribe_channels(tribe_id)
)
WITH CHECK (
  public.can_manage_tribe_channels(tribe_id)
);

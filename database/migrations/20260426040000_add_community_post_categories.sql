CREATE TABLE IF NOT EXISTS public.community_post_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id uuid NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  name text NOT NULL,
  slug text NOT NULL,
  emoji text NOT NULL,
  sort_order integer NOT NULL,
  access_scope text NOT NULL DEFAULT 'members',
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  UNIQUE (community_id, slug),
  CHECK (char_length(trim(name)) > 0),
  CHECK (char_length(trim(emoji)) > 0),
  CHECK (access_scope IN ('members'))
);

CREATE INDEX IF NOT EXISTS idx_community_post_categories_sort_order
ON public.community_post_categories(community_id, sort_order ASC);

CREATE OR REPLACE FUNCTION public.can_manage_community_categories(target_community_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.community_members
    WHERE community_members.community_id = target_community_id
      AND community_members.user_id = public.current_app_user_id()
      AND community_members.status = 'active'
      AND community_members.role IN ('owner', 'admin')
  );
$$;

WITH category_seed(name, slug, emoji, sort_order) AS (
  VALUES
    ('General', 'general', '💬', 20)
)
INSERT INTO public.community_post_categories (
  community_id,
  name,
  slug,
  emoji,
  sort_order,
  access_scope,
  created_at,
  updated_at
)
SELECT
  communities.id,
  category_seed.name,
  category_seed.slug,
  category_seed.emoji,
  category_seed.sort_order,
  'members',
  timezone('utc', now()),
  timezone('utc', now())
FROM public.communities
CROSS JOIN category_seed
ON CONFLICT (community_id, slug) DO NOTHING;

ALTER TABLE public.posts
ADD COLUMN IF NOT EXISTS category_id uuid;

WITH community_general_categories AS (
  SELECT
    community_post_categories.community_id,
    community_post_categories.id
  FROM public.community_post_categories
  WHERE community_post_categories.slug = 'general'
)
UPDATE public.posts
SET
  category_id = community_general_categories.id,
  updated_at = timezone('utc', now())
FROM community_general_categories
WHERE posts.community_id = community_general_categories.community_id
  AND posts.category_id IS NULL;

ALTER TABLE public.posts
ALTER COLUMN category_id SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'posts_category_id_fkey'
      AND conrelid = 'public.posts'::regclass
  ) THEN
    ALTER TABLE public.posts
    ADD CONSTRAINT posts_category_id_fkey
    FOREIGN KEY (category_id)
    REFERENCES public.community_post_categories(id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_posts_category_created_at
ON public.posts(category_id, created_at DESC);

ALTER TABLE public.community_post_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_post_categories FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can read community post categories"
ON public.community_post_categories;

DROP POLICY IF EXISTS "Owners and admins can manage community post categories"
ON public.community_post_categories;

DROP POLICY IF EXISTS "Owners can manage community post categories"
ON public.community_post_categories;

CREATE POLICY "Members can read community post categories"
ON public.community_post_categories
FOR SELECT
USING (
  public.can_read_community_content(community_id)
);

CREATE POLICY "Owners and admins can manage community post categories"
ON public.community_post_categories
FOR ALL
USING (
  public.can_manage_community_categories(community_id)
)
WITH CHECK (
  public.can_manage_community_categories(community_id)
);

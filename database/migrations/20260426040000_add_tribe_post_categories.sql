CREATE TABLE IF NOT EXISTS public.tribe_post_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tribe_id uuid NOT NULL REFERENCES public.tribes(id) ON DELETE CASCADE,
  name text NOT NULL,
  slug text NOT NULL,
  emoji text NOT NULL,
  sort_order integer NOT NULL,
  access_scope text NOT NULL DEFAULT 'members',
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  UNIQUE (tribe_id, slug),
  CHECK (char_length(trim(name)) > 0),
  CHECK (char_length(trim(emoji)) > 0),
  CHECK (access_scope IN ('members'))
);

CREATE INDEX IF NOT EXISTS idx_tribe_post_categories_sort_order
ON public.tribe_post_categories(tribe_id, sort_order ASC);

CREATE OR REPLACE FUNCTION public.can_manage_tribe_categories(target_tribe_id uuid)
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
      AND tribe_members.role IN ('owner', 'admin')
  );
$$;

WITH category_seed(name, slug, emoji, sort_order) AS (
  VALUES
    ('General', 'general', '💬', 20)
)
INSERT INTO public.tribe_post_categories (
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
  category_seed.name,
  category_seed.slug,
  category_seed.emoji,
  category_seed.sort_order,
  'members',
  timezone('utc', now()),
  timezone('utc', now())
FROM public.tribes
CROSS JOIN category_seed
ON CONFLICT (tribe_id, slug) DO NOTHING;

ALTER TABLE public.posts
ADD COLUMN IF NOT EXISTS category_id uuid;

WITH tribe_general_categories AS (
  SELECT
    tribe_post_categories.tribe_id,
    tribe_post_categories.id
  FROM public.tribe_post_categories
  WHERE tribe_post_categories.slug = 'general'
)
UPDATE public.posts
SET
  category_id = tribe_general_categories.id,
  updated_at = timezone('utc', now())
FROM tribe_general_categories
WHERE posts.tribe_id = tribe_general_categories.tribe_id
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
    REFERENCES public.tribe_post_categories(id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_posts_category_created_at
ON public.posts(category_id, created_at DESC);

ALTER TABLE public.tribe_post_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tribe_post_categories FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can read tribe post categories"
ON public.tribe_post_categories;

DROP POLICY IF EXISTS "Owners and admins can manage tribe post categories"
ON public.tribe_post_categories;

DROP POLICY IF EXISTS "Owners can manage tribe post categories"
ON public.tribe_post_categories;

CREATE POLICY "Members can read tribe post categories"
ON public.tribe_post_categories
FOR SELECT
USING (
  public.can_read_tribe_content(tribe_id)
);

CREATE POLICY "Owners and admins can manage tribe post categories"
ON public.tribe_post_categories
FOR ALL
USING (
  public.can_manage_tribe_categories(tribe_id)
)
WITH CHECK (
  public.can_manage_tribe_categories(tribe_id)
);

WITH general_categories AS (
  SELECT
    tribe_post_categories.tribe_id,
    tribe_post_categories.id
  FROM public.tribe_post_categories
  WHERE tribe_post_categories.slug = 'general'
),
moved_posts AS (
  UPDATE public.posts
  SET
    category_id = general_categories.id,
    updated_at = timezone('utc', now())
  FROM public.tribe_post_categories source_categories
  INNER JOIN general_categories
    ON general_categories.tribe_id = source_categories.tribe_id
  WHERE posts.category_id = source_categories.id
    AND source_categories.slug IN ('anuncios', 'preguntas', 'eventos')
  RETURNING posts.id
)
DELETE FROM public.tribe_post_categories obsolete_categories
USING general_categories
WHERE obsolete_categories.tribe_id = general_categories.tribe_id
  AND obsolete_categories.slug IN ('anuncios', 'preguntas', 'eventos');

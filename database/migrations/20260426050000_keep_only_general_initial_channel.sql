WITH general_channels AS (
  SELECT
    tribe_channels.tribe_id,
    tribe_channels.id
  FROM public.tribe_channels
  WHERE tribe_channels.slug = 'general'
),
moved_posts AS (
  UPDATE public.posts
  SET
    channel_id = general_channels.id,
    updated_at = timezone('utc', now())
  FROM public.tribe_channels source_channels
  INNER JOIN general_channels
    ON general_channels.tribe_id = source_channels.tribe_id
  WHERE posts.channel_id = source_channels.id
    AND source_channels.slug IN ('anuncios', 'preguntas', 'eventos')
  RETURNING posts.id
)
DELETE FROM public.tribe_channels obsolete_channels
USING general_channels
WHERE obsolete_channels.tribe_id = general_channels.tribe_id
  AND obsolete_channels.slug IN ('anuncios', 'preguntas', 'eventos');
